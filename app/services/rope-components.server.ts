import { adminGraphql } from "./shopify-graphql.server";
import {
  ConfigurationInputError,
  type ComponentMapping,
  type Position,
  priceCents,
} from "./rope-configuration";
import {
  isRopeProduct,
  selectRopeMasterVariant,
} from "./rope-draft-order.server";
import type { RopeConfiguratorConfig } from "./rope-configurator-config";

type Metaobject = {
  id: string;
  type: string;
  fields: Array<{ key: string; value: string | null }>;
};
type ReferenceList = {
  value: string;
  references: { nodes: Metaobject[]; pageInfo: { hasNextPage: boolean } };
} | null;
type SourceVariant = {
  id: string;
  price: string;
  sku: string | null;
  taxable: boolean;
  selectedOptions: Array<{ name: string; value: string }>;
  ropeConfiguration: { value: string } | null;
  isDefaultConfiguration: { value: string } | null;
  inventoryItem: {
    measurement: { weight: { value: number; unit: string } | null };
  };
};
type Product = {
  id: string;
  title: string;
  handle: string;
  productType: string;
  status: string;
  publishedAt: string | null;
  positions: ReferenceList;
  mappings: ReferenceList;
  variants: {
    nodes: SourceVariant[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export const CONFIGURATION_PRODUCT_QUERY = `#graphql
  query ConfigurationProduct($id: ID!, $after: String) {
    shop { currencyCode }
    product(id: $id) {
      id title handle productType status publishedAt
      positions: metafield(namespace: "$app", key: "configuration_positions") {
        value
        references(first: 100) {
          nodes { ... on Metaobject { id type fields { key value } } }
          pageInfo { hasNextPage }
        }
      }
      mappings: metafield(namespace: "$app", key: "component_mappings") {
        value
        references(first: 100) {
          nodes { ... on Metaobject { id type fields { key value } } }
          pageInfo { hasNextPage }
        }
      }
      variants(first: 250, after: $after) {
        nodes {
          id price sku taxable selectedOptions { name value }
          ropeConfiguration: metafield(namespace: "hanfwolf", key: "rope_configuration") { value }
          isDefaultConfiguration: metafield(namespace: "$app", key: "is_default_configuration") { value }
          inventoryItem { measurement { weight { value unit } } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;

export const COMPONENT_VARIANTS_QUERY = `#graphql
  query ConfigurationComponents($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id price title
        product { title status }
        inventoryItem { requiresShipping measurement { weight { value unit } } }
      }
    }
  }`;

function fields(entry: Metaobject) {
  return Object.fromEntries(
    entry.fields.map((field) => [field.key, field.value]),
  );
}

function referenceNodes(list: ReferenceList, label: string) {
  if (!list)
    throw new ConfigurationInputError(
      `${label} am Produkt fehlen. Bitte das Konfigurator-Setup pflegen.`,
    );
  const ids: unknown = JSON.parse(list.value);
  if (
    !Array.isArray(ids) ||
    list.references.pageInfo.hasNextPage ||
    ids.length !== list.references.nodes.length
  ) {
    throw new Error(
      `${label}: unvollstaendige Referenzen oder mehr als 100 Eintraege.`,
    );
  }
  return list.references.nodes;
}

export async function loadConfigurationProduct(
  admin: unknown,
  productId: string,
  config: RopeConfiguratorConfig,
) {
  const result = await adminGraphql<{
    shop: { currencyCode: string };
    product: Product | null;
  }>(admin, CONFIGURATION_PRODUCT_QUERY, { id: productId });
  if (!result.ok)
    throw new Error(
      `Konfigurationsdaten konnten nicht geladen werden: ${result.errors.join(" | ")}`,
    );
  const product = result.data.product;
  if (!product || !isRopeProduct(product.productType, config.ropeProductType)) {
    throw new ConfigurationInputError(
      "Der Artikel ist kein freigegebener Seilartikel.",
    );
  }
  if (product.status !== "ACTIVE" || !product.publishedAt) {
    throw new ConfigurationInputError(
      "Der Basisartikel muss im Onlineshop veroeffentlicht sein.",
    );
  }
  // All candidates must be considered; a later page can contain the marked master.
  while (product.variants.pageInfo.hasNextPage) {
    const page = await adminGraphql<{ product: Product | null }>(
      admin,
      CONFIGURATION_PRODUCT_QUERY,
      {
        id: productId,
        after: product.variants.pageInfo.endCursor,
      },
    );
    if (!page.ok || !page.data.product)
      throw new Error("Weitere Varianten konnten nicht geladen werden.");
    product.variants.nodes.push(...page.data.product.variants.nodes);
    product.variants.pageInfo = page.data.product.variants.pageInfo;
  }
  const selection = selectRopeMasterVariant(product.variants.nodes);
  if (!selection.ok) {
    throw new ConfigurationInputError(
      "Bitte genau eine Stammdatenvariante mit is_default_configuration markieren.",
    );
  }
  const master = selection.variant;
  if (master.ropeConfiguration?.value || master.sku?.startsWith("HW-RC-")) {
    throw new ConfigurationInputError(
      "Eine Zuschnittvariante darf nicht als Stammdatenvariante markiert sein.",
    );
  }
  priceCents(master.price);
  const positions: Position[] = [];
  const codes = new Set<string>();
  const labels = new Set<string>(["Länge"]);
  for (const entry of referenceNodes(
    product.positions,
    "Konfigurationspositionen",
  )) {
    const data = fields(entry);
    if (data.active === "false") continue;
    const sortOrder = Number(data.sort_order);
    if (
      !entry.type.endsWith(":configuration_position") ||
      data.active !== "true" ||
      !data.code ||
      !/^[a-z][a-z0-9_]{0,49}$/.test(data.code) ||
      !data.label ||
      data.label.startsWith("_") ||
      data.label.length > 80 ||
      codes.has(data.code) ||
      labels.has(data.label) ||
      !["true", "false"].includes(data.required || "") ||
      !Number.isSafeInteger(sortOrder)
    )
      throw new Error(
        "Konfigurationspositionen sind ungueltig oder nicht eindeutig.",
      );
    codes.add(data.code);
    labels.add(data.label);
    positions.push({
      id: entry.id,
      code: data.code,
      label: data.label,
      required: data.required === "true",
      sortOrder,
    });
  }
  if (!positions.length || positions.length > 30) {
    throw new ConfigurationInputError(
      "Bitte zwischen 1 und 30 aktive Konfigurationspositionen zuordnen.",
    );
  }
  const rawMappings = referenceNodes(product.mappings, "Komponentenfreigaben")
    .map(
      (
        entry,
      ): { id: string; type: string } & Record<string, string | null> => ({
        ...fields(entry),
        id: entry.id,
        type: entry.type,
      }),
    )
    .filter((entry) => entry.active !== "false");
  for (const entry of rawMappings) {
    if (
      !entry.type.endsWith(":component_mapping") ||
      entry.active !== "true" ||
      entry.base_product !== product.id ||
      !entry.position ||
      !positions.some((position) => position.id === entry.position) ||
      !entry.component ||
      !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(entry.component) ||
      !entry.label ||
      entry.label.length > 150 ||
      !Number.isSafeInteger(Number(entry.quantity)) ||
      Number(entry.quantity) < 1 ||
      Number(entry.quantity) > 999 ||
      !Number.isSafeInteger(Number(entry.sort_order))
    )
      throw new Error(
        "Eine Komponentenfreigabe ist ungueltig oder gehoert nicht zum Basisartikel.",
      );
  }
  type Component = {
    id: string;
    price: string;
    title: string;
    product: { title: string; status: string };
    inventoryItem: {
      requiresShipping: boolean;
      measurement: { weight: { value: number; unit: string } | null };
    };
  };
  const variants = new Map<string, Component>();
  if (rawMappings.length) {
    const components = await adminGraphql<{ nodes: Array<Component | null> }>(
      admin,
      COMPONENT_VARIANTS_QUERY,
      { ids: [...new Set(rawMappings.map((entry) => entry.component))] },
    );
    if (!components.ok)
      throw new Error(
        `Komponenten konnten nicht geladen werden: ${components.errors.join(" | ")}`,
      );
    for (const variant of components.data.nodes)
      if (variant) variants.set(variant.id, variant);
  }
  const mappings: ComponentMapping[] = rawMappings.map((entry) => {
    const variant = variants.get(entry.component!);
    if (!variant || variant.product.status !== "ACTIVE")
      throw new Error(
        `Komponente fuer ${entry.label} fehlt oder ist nicht aktiv.`,
      );
    priceCents(variant.price);
    const weight = variant.inventoryItem.measurement.weight;
    if (
      variant.inventoryItem.requiresShipping &&
      (!weight || weight.value <= 0)
    ) {
      throw new Error(`Versandgewicht fuer ${variant.product.title} fehlt.`);
    }
    return {
      id: entry.id,
      positionId: entry.position!,
      label: entry.label!,
      quantity: Number(entry.quantity),
      sortOrder: Number(entry.sort_order),
      variantId: variant.id,
      price: variant.price,
      weight,
    };
  });
  for (const position of positions) {
    if (
      position.required &&
      !mappings.some((entry) => entry.positionId === position.id)
    ) {
      throw new ConfigurationInputError(
        `Fuer ${position.label} fehlt eine aktive Komponentenfreigabe.`,
      );
    }
  }
  positions.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  mappings.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "de"),
  );
  return {
    product,
    master,
    positions,
    mappings,
    currency: result.data.shop.currencyCode,
  };
}
