import { adminGraphql, type GraphqlResult } from "./shopify-graphql.server";
import { isRopeProduct } from "./rope-draft-order.server";
import type { RopeConfiguratorConfig } from "./rope-configurator-config";

const PAGE_SIZE = 100;
const MAX_IMPORT_ROWS = 5000;
const MAX_CSV_LENGTH = 2_000_000;

type Metaobject = {
  id: string;
  type: string;
  fields: Array<{ key: string; value: string | null }>;
};

type Product = {
  id: string;
  title: string;
  handle: string;
  productType: string;
  componentMappings: {
    value: string;
    references: {
      nodes: Array<{ id: string }>;
      pageInfo: { hasNextPage: boolean };
    };
  } | null;
};

type Position = {
  id: string;
  code: string;
  label: string;
  active: boolean;
};

export type RopeRelease = {
  id: string;
  productId: string;
  productTitle: string;
  productHandle: string;
  positionCode: string;
  positionLabel: string;
  componentVariantId: string;
  componentVariantTitle: string;
  componentProductTitle: string;
  componentSku: string;
  label: string;
  quantity: number;
  sortOrder: number;
  active: boolean;
  linked: boolean;
};

type ImportRow = {
  line: number;
  mappingId: string;
  productId: string;
  positionCode: string;
  componentVariantId: string;
  label: string;
  quantity: number;
  sortOrder: number;
  active: boolean;
  positionId: string;
  existingId: string | null;
  previousProductId: string | null;
};

export type ImportPreview = {
  rows: Array<{
    line: number;
    productTitle: string;
    positionCode: string;
    componentVariantId: string;
    label: string;
    valid: boolean;
    message: string;
  }>;
  validCount: number;
  invalidCount: number;
  errors: Array<{ line: number; message: string }>;
};

const POSITION_QUERY = `#graphql
  query RopeReleasePositions($after: String) {
    metaobjects(type: "$app:configuration_position", first: ${PAGE_SIZE}, after: $after) {
      nodes { id type fields { key value } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

type MetaobjectsPage = {
  metaobjects: {
    nodes: Metaobject[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type ProductsPage = {
  products: {
    nodes: Product[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

const MAPPING_QUERY = `#graphql
  query RopeReleaseMappings($after: String) {
    metaobjects(type: "$app:component_mapping", first: ${PAGE_SIZE}, after: $after) {
      nodes { id type fields { key value } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const PRODUCT_QUERY = `#graphql
  query RopeReleaseProducts($after: String, $query: String!) {
    products(first: 250, after: $after, query: $query) {
      nodes {
        id title handle productType
        componentMappings: metafield(namespace: "$app", key: "component_mappings") {
          value
          references(first: 100) {
            nodes { ... on Metaobject { id } }
            pageInfo { hasNextPage }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

const VARIANTS_QUERY = `#graphql
  query RopeReleaseVariants($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id title sku
        product { title }
      }
    }
  }`;

const CREATE_MAPPING_MUTATION = `#graphql
  mutation CreateRopeRelease($metaobject: MetaobjectCreateInput!) {
    metaobjectCreate(metaobject: $metaobject) {
      metaobject { id }
      userErrors { field message }
    }
  }`;

const UPDATE_MAPPING_MUTATION = `#graphql
  mutation UpdateRopeRelease($id: ID!, $metaobject: MetaobjectUpdateInput!) {
    metaobjectUpdate(id: $id, metaobject: $metaobject) {
      metaobject { id }
      userErrors { field message }
    }
  }`;

const SET_PRODUCT_MAPPINGS_MUTATION = `#graphql
  mutation SetRopeReleaseProductMappings($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }`;

function fieldMap(entry: Metaobject) {
  return Object.fromEntries(
    entry.fields.map(({ key, value }) => [key, value ?? ""]),
  ) as Record<string, string>;
}

function resultError(result: { ok: false; errors: string[] }) {
  return result.errors.join(" | ");
}

async function loadMetaobjects(admin: unknown, query: string, label: string) {
  const entries: Metaobject[] = [];
  let after: string | null = null;
  do {
    const result: GraphqlResult<MetaobjectsPage> = await adminGraphql(
      admin,
      query,
      { after },
    );
    if (!result.ok)
      throw new Error(
        `${label} konnten nicht geladen werden: ${resultError(result)}`,
      );
    entries.push(...result.data.metaobjects.nodes);
    const page: MetaobjectsPage["metaobjects"]["pageInfo"] =
      result.data.metaobjects.pageInfo;
    if (page.hasNextPage && (!page.endCursor || page.endCursor === after))
      throw new Error(`${label} konnten nicht vollständig geladen werden.`);
    after = page.hasNextPage ? page.endCursor : null;
  } while (after);
  return entries;
}

function productSearch(config: RopeConfiguratorConfig) {
  return config.ropeProductType
    ? `product_type:${JSON.stringify(config.ropeProductType)}`
    : "product_type:Spezialseil*";
}

async function loadRopeProducts(
  admin: unknown,
  config: RopeConfiguratorConfig,
) {
  const products: Product[] = [];
  let after: string | null = null;
  const query = productSearch(config);
  do {
    const result: GraphqlResult<ProductsPage> = await adminGraphql(
      admin,
      PRODUCT_QUERY,
      { after, query },
    );
    if (!result.ok)
      throw new Error(
        `Seilartikel konnten nicht geladen werden: ${resultError(result)}`,
      );
    products.push(
      ...result.data.products.nodes.filter((product) =>
        isRopeProduct(product.productType, config.ropeProductType),
      ),
    );
    const page: ProductsPage["products"]["pageInfo"] =
      result.data.products.pageInfo;
    if (page.hasNextPage && (!page.endCursor || page.endCursor === after))
      throw new Error("Seilartikel konnten nicht vollständig geladen werden.");
    after = page.hasNextPage ? page.endCursor : null;
  } while (after);
  return products;
}

function parseReferenceValue(value: string | null) {
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      "Ein Produkt enthält eine ungültige Komponentenfreigaben-Liste.",
    );
  }
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new Error(
      "Ein Produkt enthält eine ungültige Komponentenfreigaben-Liste.",
    );
  }
  return parsed as string[];
}

async function loadVariants(admin: unknown, ids: string[]) {
  const variants = new Map<
    string,
    {
      id: string;
      title: string;
      sku: string | null;
      product: { title: string };
    }
  >();
  for (let index = 0; index < ids.length; index += 250) {
    const result = await adminGraphql<{
      nodes: Array<{
        id: string;
        title: string;
        sku: string | null;
        product: { title: string };
      } | null>;
    }>(admin, VARIANTS_QUERY, { ids: ids.slice(index, index + 250) });
    if (!result.ok)
      throw new Error(
        `Komponentenvarianten konnten nicht geladen werden: ${resultError(result)}`,
      );
    for (const variant of result.data.nodes)
      if (variant) variants.set(variant.id, variant);
  }
  return variants;
}

export async function loadRopeReleases(
  admin: unknown,
  config: RopeConfiguratorConfig,
) {
  const [positionsRaw, mappingsRaw, products] = await Promise.all([
    loadMetaobjects(admin, POSITION_QUERY, "Konfigurationspositionen"),
    loadMetaobjects(admin, MAPPING_QUERY, "Konfigurationsfreigaben"),
    loadRopeProducts(admin, config),
  ]);
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const positionsById = new Map<string, Position>();
  const positionsByCode = new Map<string, Position>();
  for (const entry of positionsRaw) {
    const data = fieldMap(entry);
    const position = {
      id: entry.id,
      code: data.code,
      label: data.label,
      active: data.active === "true",
    };
    if (position.code) {
      positionsById.set(position.id, position);
      positionsByCode.set(position.code, position);
    }
  }
  const mappingEntries = mappingsRaw.flatMap((entry) => {
    const data = fieldMap(entry);
    if (!productsById.has(data.base_product)) return [];
    return [{ entry, data }];
  });
  const variantIds = [
    ...new Set(
      mappingEntries
        .map(({ data }) => data.component)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const variants = await loadVariants(admin, variantIds);
  const linkedByProduct = new Map<string, Set<string>>();
  for (const product of products) {
    const linkedIds = parseReferenceValue(
      product.componentMappings?.value ?? null,
    );
    const metafield = product.componentMappings;
    if (metafield?.references.pageInfo.hasNextPage)
      throw new Error(
        `Die Komponentenfreigaben-Liste von "${product.title}" enthält mehr als 100 Einträge.`,
      );
    const referenceIds = new Set(
      metafield?.references.nodes.map(({ id }) => id) ?? [],
    );
    for (const id of linkedIds) referenceIds.add(id);
    linkedByProduct.set(product.id, referenceIds);
  }
  const releases = mappingEntries.map(({ entry, data }): RopeRelease => {
    const product = productsById.get(data.base_product)!;
    const position = positionsById.get(data.position);
    const variant = variants.get(data.component);
    return {
      id: entry.id,
      productId: product.id,
      productTitle: product.title,
      productHandle: product.handle,
      positionCode: position?.code ?? "",
      positionLabel: position?.label ?? "Unbekannte Position",
      componentVariantId: data.component,
      componentVariantTitle: variant?.title ?? "Variante nicht gefunden",
      componentProductTitle: variant?.product.title ?? "",
      componentSku: variant?.sku ?? "",
      label: data.label,
      quantity: Number(data.quantity),
      sortOrder: Number(data.sort_order),
      active: data.active === "true",
      linked: linkedByProduct.get(product.id)?.has(entry.id) ?? false,
    };
  });
  releases.sort(
    (left, right) =>
      left.productTitle.localeCompare(right.productTitle, "de") ||
      left.positionCode.localeCompare(right.positionCode, "de") ||
      left.sortOrder - right.sortOrder ||
      left.label.localeCompare(right.label, "de"),
  );
  return {
    releases,
    positions: [...positionsByCode.values()].sort((left, right) =>
      left.code.localeCompare(right.code, "de"),
    ),
    mappings: mappingsRaw.map(
      (entry): { id: string } & Record<string, string> => ({
        id: entry.id,
        ...fieldMap(entry),
      }),
    ),
    products,
  };
}

export function parseRopeReleaseCsv(csv: string) {
  if (csv.length > MAX_CSV_LENGTH)
    throw new Error("Die CSV-Datei darf höchstens 2 MB groß sein.");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) records.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted)
    throw new Error(
      "Die CSV enthält ein nicht geschlossenes Anführungszeichen.",
    );
  row.push(field);
  if (row.some((value) => value.trim())) records.push(row);
  if (records.length < 2)
    throw new Error(
      "Die CSV benötigt eine Kopfzeile und mindestens eine Datenzeile.",
    );
  if (records.length - 1 > MAX_IMPORT_ROWS)
    throw new Error(`Der Import ist auf ${MAX_IMPORT_ROWS} Zeilen begrenzt.`);
  const headers = records[0].map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim(),
  );
  const expectedHeaders = [
    "mapping_id",
    "product_id",
    "position_code",
    "component_variant_id",
    "label",
    "quantity",
    "sort_order",
    "active",
  ];
  if (
    headers.length !== expectedHeaders.length ||
    expectedHeaders.some((header) => !headers.includes(header)) ||
    new Set(headers).size !== headers.length
  ) {
    throw new Error(`CSV-Spalten müssen lauten: ${expectedHeaders.join(", ")}`);
  }
  return records.slice(1).map((cells, index) => {
    if (cells.length !== headers.length)
      throw new Error(`Zeile ${index + 2}: falsche Anzahl an CSV-Spalten.`);
    return {
      line: index + 2,
      values: Object.fromEntries(
        headers.map((header, cellIndex) => [header, cells[cellIndex].trim()]),
      ) as Record<(typeof expectedHeaders)[number], string>,
    };
  });
}

function normalizeBool(value: string, line: number) {
  if (["true", "1", "ja", "yes"].includes(value.toLowerCase())) return true;
  if (["false", "0", "nein", "no"].includes(value.toLowerCase())) return false;
  throw new Error(`Zeile ${line}: active muss true oder false sein.`);
}

function parseImportRows(
  csv: string,
  board: Awaited<ReturnType<typeof loadRopeReleases>>,
): { rows: ImportRow[]; errors: Array<{ line: number; message: string }> } {
  const input = parseRopeReleaseCsv(csv);
  const productsById = new Map(
    board.products.map((product) => [product.id, product]),
  );
  const positionsByCode = new Map(
    board.positions.map((position) => [position.code, position]),
  );
  const mappingsById = new Map(
    board.mappings.map((mapping) => [mapping.id, mapping]),
  );
  const existingByKey = new Map<string, string[]>();
  for (const mapping of board.mappings) {
    const key = `${mapping.base_product}|${mapping.position}|${mapping.component}`;
    existingByKey.set(key, [...(existingByKey.get(key) ?? []), mapping.id]);
  }
  const importedKeys = new Set<string>();
  const importedIds = new Set<string>();
  const rows: ImportRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  for (const { line, values } of input) {
    try {
      const product = productsById.get(values.product_id);
      if (!product)
        throw new Error(
          `Seilartikel ${values.product_id} wurde nicht gefunden.`,
        );
      const position = positionsByCode.get(values.position_code);
      if (!position || !position.active)
        throw new Error(
          `Aktive Position "${values.position_code}" wurde nicht gefunden.`,
        );
      if (
        !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(
          values.component_variant_id,
        )
      )
        throw new Error(
          "component_variant_id ist keine gültige Shopify-Varianten-ID.",
        );
      if (!values.label || values.label.length > 150)
        throw new Error("label muss zwischen 1 und 150 Zeichen lang sein.");
      const quantity = Number(values.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999)
        throw new Error(
          "quantity muss eine ganze Zahl zwischen 1 und 999 sein.",
        );
      const sortOrder = Number(values.sort_order);
      if (!Number.isSafeInteger(sortOrder))
        throw new Error("sort_order muss eine ganze Zahl sein.");
      const active = normalizeBool(values.active, line);
      const key = `${product.id}|${position.id}|${values.component_variant_id}`;
      if (importedKeys.has(key))
        throw new Error(
          "Die Kombination aus Artikel, Position und Variante ist in der CSV doppelt.",
        );
      let existingId: string | null = null;
      let previousProductId: string | null = null;
      if (values.mapping_id) {
        const current = mappingsById.get(values.mapping_id);
        if (!current)
          throw new Error(
            `mapping_id ${values.mapping_id} wurde nicht gefunden.`,
          );
        if (!productsById.has(current.base_product))
          throw new Error(
            "mapping_id gehört nicht zu einem konfigurierten Seilartikel.",
          );
        if (importedIds.has(values.mapping_id))
          throw new Error("mapping_id steht mehrfach in der CSV.");
        existingId = values.mapping_id;
        previousProductId = current.base_product;
        const conflictingMatches = (existingByKey.get(key) ?? []).filter(
          (id) => id !== existingId,
        );
        if (conflictingMatches.length)
          throw new Error(
            `Für diese Kombination existiert bereits eine andere Freigabe (${conflictingMatches.join(", ")}).`,
          );
      } else {
        const matches = existingByKey.get(key) ?? [];
        if (matches.length > 1)
          throw new Error(
            "Für diese Kombination existieren mehrere Freigaben; bitte mapping_id angeben.",
          );
        existingId = matches[0] ?? null;
        previousProductId = existingId
          ? (mappingsById.get(existingId)?.base_product ?? null)
          : null;
      }
      importedKeys.add(key);
      if (existingId) importedIds.add(existingId);
      rows.push({
        line,
        mappingId: values.mapping_id,
        productId: product.id,
        positionCode: position.code,
        componentVariantId: values.component_variant_id,
        label: values.label,
        quantity,
        sortOrder,
        active,
        positionId: position.id,
        existingId,
        previousProductId,
      });
    } catch (error) {
      errors.push({
        line,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { rows, errors };
}

async function prepareImport(
  admin: unknown,
  csv: string,
  config: RopeConfiguratorConfig,
) {
  const board = await loadRopeReleases(admin, config);
  const parsed = parseImportRows(csv, board);
  const variants = await loadVariants(admin, [
    ...new Set(parsed.rows.map((row) => row.componentVariantId)),
  ]);
  for (const row of parsed.rows) {
    if (!variants.has(row.componentVariantId))
      parsed.errors.push({
        line: row.line,
        message: `Komponentenvariante ${row.componentVariantId} wurde nicht gefunden.`,
      });
  }
  const refsByProduct = new Map(
    board.products.map((product) => [
      product.id,
      new Set(parseProductReferenceIds(product)),
    ]),
  );
  for (const row of parsed.rows) {
    if (
      row.existingId &&
      row.previousProductId &&
      row.previousProductId !== row.productId
    ) {
      refsByProduct.get(row.previousProductId)?.delete(row.existingId);
    }
    refsByProduct.get(row.productId)?.add(row.existingId ?? `new:${row.line}`);
  }
  for (const [productId, ids] of refsByProduct) {
    if (ids.size <= 100) continue;
    for (const row of parsed.rows) {
      if (row.productId === productId)
        parsed.errors.push({
          line: row.line,
          message: `Produkt ${productId} hätte mehr als 100 Komponentenfreigaben.`,
        });
    }
  }
  return { board, rows: parsed.rows, errors: parsed.errors };
}

export async function previewRopeReleaseImport(
  admin: unknown,
  csv: string,
  config: RopeConfiguratorConfig,
): Promise<ImportPreview> {
  const { board, rows, errors } = await prepareImport(admin, csv, config);
  const products = new Map(
    board.products.map((product) => [product.id, product]),
  );
  return {
    rows: rows.map((row) => ({
      line: row.line,
      productTitle: products.get(row.productId)?.title ?? row.productId,
      positionCode: row.positionCode,
      componentVariantId: row.componentVariantId,
      label: row.label,
      valid: true,
      message: row.existingId ? "Wird aktualisiert" : "Wird neu angelegt",
    })),
    validCount: rows.length,
    invalidCount: errors.length,
    errors,
  };
}

function mappingFields(row: ImportRow) {
  return [
    { key: "label", value: row.label },
    { key: "base_product", value: row.productId },
    { key: "position", value: row.positionId },
    { key: "component", value: row.componentVariantId },
    { key: "quantity", value: String(row.quantity) },
    { key: "sort_order", value: String(row.sortOrder) },
    { key: "active", value: String(row.active) },
  ];
}

function parseProductReferenceIds(product: Product) {
  const ids = new Set(
    parseReferenceValue(product.componentMappings?.value ?? null),
  );
  for (const reference of product.componentMappings?.references.nodes ?? [])
    ids.add(reference.id);
  return [...ids];
}

export async function importRopeReleaseCsv(
  admin: unknown,
  csv: string,
  config: RopeConfiguratorConfig,
) {
  const {
    board,
    rows,
    errors: validationErrors,
  } = await prepareImport(admin, csv, config);
  if (validationErrors.length)
    return { created: 0, updated: 0, failures: validationErrors };
  const createdOrUpdated: Array<{ id: string; row: ImportRow }> = [];
  const failures: Array<{ line: number; message: string }> = [];

  for (const row of rows) {
    const metaobject = { fields: mappingFields(row) };
    let id: string | null = null;
    let userErrors: Array<{ message: string }> = [];
    let requestErrors: string[] | null = null;
    if (row.existingId) {
      const result = await adminGraphql<{
        metaobjectUpdate: {
          metaobject: { id: string } | null;
          userErrors: Array<{ message: string }>;
        };
      }>(admin, UPDATE_MAPPING_MUTATION, {
        id: row.existingId,
        metaobject,
      });
      if (!result.ok) requestErrors = result.errors;
      else {
        id = result.data.metaobjectUpdate.metaobject?.id ?? null;
        userErrors = result.data.metaobjectUpdate.userErrors;
      }
    } else {
      const result = await adminGraphql<{
        metaobjectCreate: {
          metaobject: { id: string } | null;
          userErrors: Array<{ message: string }>;
        };
      }>(admin, CREATE_MAPPING_MUTATION, {
        metaobject: {
          type: "$app:component_mapping",
          fields: mappingFields(row),
        },
      });
      if (!result.ok) requestErrors = result.errors;
      else {
        id = result.data.metaobjectCreate.metaobject?.id ?? null;
        userErrors = result.data.metaobjectCreate.userErrors;
      }
    }
    if (requestErrors) {
      failures.push({ line: row.line, message: requestErrors.join(" | ") });
      continue;
    }
    if (!id || userErrors.length) {
      failures.push({
        line: row.line,
        message:
          userErrors.map(({ message }) => message).join("; ") ||
          "Shopify hat keinen Eintrag bestätigt.",
      });
      continue;
    }
    createdOrUpdated.push({ id, row });
  }

  const productsById = new Map(
    board.products.map((product) => [product.id, product]),
  );
  const idsByProduct = new Map<string, Set<string>>();
  for (const success of createdOrUpdated) {
    const { row, id } = success;
    if (
      row.previousProductId &&
      row.previousProductId !== row.productId &&
      productsById.has(row.previousProductId)
    ) {
      const oldIds =
        idsByProduct.get(row.previousProductId) ??
        new Set(
          parseProductReferenceIds(productsById.get(row.previousProductId)!),
        );
      oldIds.delete(id);
      idsByProduct.set(row.previousProductId, oldIds);
    }
    const newIds =
      idsByProduct.get(row.productId) ??
      new Set(parseProductReferenceIds(productsById.get(row.productId)!));
    newIds.add(id);
    idsByProduct.set(row.productId, newIds);
  }

  for (const [productId, ids] of idsByProduct) {
    if (ids.size > 100) {
      failures.push({
        line: 0,
        message: `Produkt ${productId}: maximal 100 Komponentenfreigaben pro Artikel; Liste wurde nicht aktualisiert.`,
      });
      continue;
    }
    const result = await adminGraphql<{
      metafieldsSet: {
        metafields: Array<{ id: string }>;
        userErrors: Array<{ message: string }>;
      };
    }>(admin, SET_PRODUCT_MAPPINGS_MUTATION, {
      metafields: [
        {
          ownerId: productId,
          namespace: "$app",
          key: "component_mappings",
          type: "list.metaobject_reference<$app:component_mapping>",
          value: JSON.stringify([...ids]),
        },
      ],
    });
    if (!result.ok || result.data.metafieldsSet.userErrors.length) {
      failures.push({
        line: 0,
        message: `Produkt ${productId}: Freigaben konnten nicht am Produkt zugeordnet werden: ${
          result.ok
            ? result.data.metafieldsSet.userErrors
                .map(({ message }) => message)
                .join("; ")
            : resultError(result)
        }`,
      });
    }
  }

  return {
    created: createdOrUpdated.filter(({ row }) => !row.existingId).length,
    updated: createdOrUpdated.filter(({ row }) => Boolean(row.existingId))
      .length,
    failures,
  };
}

function csvCell(value: string) {
  const safeValue = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function ropeReleasesToCsv(releases: RopeRelease[]) {
  const header = [
    "mapping_id",
    "product_id",
    "position_code",
    "component_variant_id",
    "label",
    "quantity",
    "sort_order",
    "active",
  ];
  const lines = releases.map((release) =>
    [
      release.id,
      release.productId,
      release.positionCode,
      release.componentVariantId,
      release.label,
      String(release.quantity),
      String(release.sortOrder),
      String(release.active),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

export const ROPE_RELEASE_CSV_TEMPLATE =
  "mapping_id,product_id,position_code,component_variant_id,label,quantity,sort_order,active\r\n" +
  ",gid://shopify/Product/123456789,end_1,gid://shopify/ProductVariant/123456789,Kausche verzinkt,1,10,true";
