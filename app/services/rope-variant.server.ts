import prisma from "../db.server";
import { adminGraphql } from "./shopify-graphql.server";
import {
  buildConfigurationSnapshot,
  configurationId,
  configurationProperties,
  ConfigurationInputError,
  priceCents,
  selectionDisplayLabel,
  type ConfigurationInput,
  type ConfigurationSnapshot,
} from "./rope-configuration";
import { loadConfigurationProduct } from "./rope-components.server";
import type { RopeConfiguratorConfig } from "./rope-configurator-config";

export const CREATE_CONFIGURATION_VARIANT = `#graphql
  mutation CreateConfigurationVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: PRESERVE_STANDALONE_VARIANT) {
      productVariants { id }
      userErrors { field message }
    }
  }`;

export const CONFIGURATION_VARIANT_STATUS = `#graphql
  query ConfigurationVariantStatus($id: ID!) {
    productVariant(id: $id) {
      id price taxable availableForSale
      inventoryPolicy
      inventoryItem { tracked requiresShipping measurement { weight { value unit } } }
      configuration: metafield(namespace: "hanfwolf", key: "rope_configuration") { value }
      product { id status publishedAt }
    }
  }`;

export function configurationResponse(record: {
  id: string;
  snapshot: string;
  variantId: string | null;
  status: string;
  error: string | null;
}) {
  const snapshot: ConfigurationSnapshot = JSON.parse(record.snapshot);
  return {
    ok: true,
    configurationId: record.id,
    status: record.status,
    error: record.error,
    variantId: record.variantId,
    productHandle: snapshot.productHandle,
    unitPriceCents: snapshot.unitPriceCents,
    currency: snapshot.currency,
    properties: configurationProperties(snapshot, record.id),
    summary: {
      lengthMeters: snapshot.lengthDecimeters / 10,
      selections: snapshot.selections.map((entry) => ({
        label: entry.label,
        value: selectionDisplayLabel(entry),
      })),
    },
  };
}

export async function prepareConfiguration(
  admin: unknown,
  shop: string,
  input: ConfigurationInput,
  config: RopeConfiguratorConfig,
  customerId: string | null,
) {
  const started = Date.now();
  const { product, master, positions, mappings, currency } =
    await loadConfigurationProduct(admin, input.productId, config);
  const baseWeight = master.inventoryItem.measurement.weight;
  if (
    !baseWeight ||
    !Number.isFinite(baseWeight.value) ||
    baseWeight.value <= 0
  ) {
    throw new ConfigurationInputError(
      "Bitte ein positives Versandgewicht je dm an der Stammdatenvariante pflegen.",
    );
  }
  const snapshot = buildConfigurationSnapshot(
    input,
    {
      productId: product.id,
      sourceVariantId: master.id,
      productHandle: product.handle,
      productTitle: product.title,
      currency,
      taxable: master.taxable,
      basePricePerDecimeter: master.price,
      baseWeightPerDecimeter: baseWeight,
    },
    positions,
    mappings,
  );
  const id = configurationId(shop, snapshot);
  await prisma.ropeConfiguration.upsert({
    where: { id },
    create: {
      id,
      shop,
      productId: product.id,
      snapshot: JSON.stringify(snapshot),
    },
    update: {},
  });
  // A retry must not silently associate the same request with different inputs.
  const selectionId = `${shop}:${input.requestId}`;
  const selection = await prisma.ropeConfigurationSelection.upsert({
    where: { id: selectionId },
    create: {
      id: selectionId,
      shop,
      configurationId: id,
      customerId,
      quantity: input.quantity,
    },
    update: {},
  });
  if (
    selection.configurationId !== id ||
    selection.quantity !== input.quantity
  ) {
    throw new ConfigurationInputError(
      "Die Konfiguration hat sich geändert. Bitte erneut fertigstellen.",
    );
  }
  const leaseUntil = new Date(Date.now() + 120_000);
  const claim = await prisma.ropeConfiguration.updateMany({
    where: {
      id,
      shop,
      variantId: null,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { status: "preparing", error: null, leaseUntil },
  });
  if (claim.count) {
    try {
      // Recover a successful Shopify mutation even if its response or the DB update was lost.
      const existing = product.variants.nodes.find(
        (variant) => variant.ropeConfiguration?.value === `v3|${id}`,
      );
      let variantId = existing?.id;
      if (!variantId) {
        if (!master.selectedOptions.length)
          throw new Error("Die Stammdatenvariante hat keine Produktoptionen.");
        const result = await adminGraphql<{
          productVariantsBulkCreate: {
            productVariants: Array<{ id: string }>;
            userErrors: Array<{ field: string[] | null; message: string }>;
          };
        }>(admin, CREATE_CONFIGURATION_VARIANT, {
          productId: product.id,
          variants: [
            {
              price: (snapshot.unitPriceCents / 100).toFixed(2),
              taxable: snapshot.taxable,
              published: true,
              inventoryPolicy: "CONTINUE",
              inventoryItem: {
                sku: `HW-RC-${id}`,
                tracked: false,
                requiresShipping: true,
                measurement: {
                  weight: {
                    value: snapshot.unitWeightKilograms,
                    unit: "KILOGRAMS",
                  },
                },
              },
              optionValues: master.selectedOptions.map(
                (option, index, options) => ({
                  optionName: option.name,
                  name:
                    index === options.length - 1
                      ? `Zuschnitt ${id}`
                      : option.value,
                }),
              ),
              metafields: [
                {
                  namespace: "hanfwolf",
                  key: "rope_configuration",
                  type: "single_line_text_field",
                  value: `v3|${id}`,
                },
              ],
            },
          ],
        });
        if (!result.ok)
          throw new Error(
            `Variante konnte nicht erstellt werden: ${result.errors.join(" | ")}`,
          );
        const payload = result.data.productVariantsBulkCreate;
        if (payload.userErrors.length || !payload.productVariants[0]) {
          throw new Error(
            `Shopify hat die Konfiguration abgelehnt: ${payload.userErrors.map((error) => error.message).join("; ")}`,
          );
        }
        variantId = payload.productVariants[0].id;
      }
      await prisma.ropeConfiguration.updateMany({
        where: { id, shop, leaseUntil },
        data: { variantId, status: "checking", leaseUntil: null, error: null },
      });
      console.info("Rope configuration variant prepared", {
        shop,
        id,
        variantId,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Rope configuration preparation failed", {
        shop,
        id,
        message,
      });
      await prisma.ropeConfiguration.updateMany({
        where: { id, shop, leaseUntil },
        data: { status: "failed", error: message, leaseUntil: null },
      });
      throw error;
    }
  }
  const record = await prisma.ropeConfiguration.findUniqueOrThrow({
    where: { id },
  });
  return configurationResponse(record);
}

export async function getConfigurationStatus(
  admin: unknown,
  shop: string,
  id: string,
) {
  const record = await prisma.ropeConfiguration.findFirst({
    where: { id, shop },
  });
  if (!record)
    throw new ConfigurationInputError(
      "Die Konfiguration wurde nicht gefunden.",
    );
  if (!record.variantId) {
    if (
      record.status === "preparing" &&
      record.leaseUntil &&
      record.leaseUntil < new Date()
    ) {
      return {
        ...configurationResponse(record),
        status: "failed",
        error: "Die Vorbereitung wurde unterbrochen. Bitte erneut versuchen.",
      };
    }
    return configurationResponse(record);
  }
  type Variant = {
    id: string;
    price: string;
    taxable: boolean;
    availableForSale: boolean;
    inventoryPolicy: string;
    inventoryItem: {
      tracked: boolean;
      requiresShipping: boolean;
      measurement: { weight: { value: number; unit: string } | null };
    };
    configuration: { value: string } | null;
    product: { id: string; status: string; publishedAt: string | null };
  };
  const result = await adminGraphql<{ productVariant: Variant | null }>(
    admin,
    CONFIGURATION_VARIANT_STATUS,
    { id: record.variantId },
  );
  if (!result.ok)
    throw new Error(
      `Verfügbarkeit konnte nicht geprüft werden: ${result.errors.join(" | ")}`,
    );
  const variant = result.data.productVariant;
  const snapshot: ConfigurationSnapshot = JSON.parse(record.snapshot);
  const weight = variant?.inventoryItem.measurement.weight;
  if (
    !variant ||
    variant.product.id !== record.productId ||
    variant.configuration?.value !== `v3|${id}` ||
    priceCents(variant.price) !== snapshot.unitPriceCents ||
    variant.taxable !== snapshot.taxable ||
    variant.inventoryItem.tracked ||
    variant.inventoryPolicy !== "CONTINUE" ||
    !variant.inventoryItem.requiresShipping ||
    weight?.unit !== "KILOGRAMS" ||
    Math.abs(weight.value - snapshot.unitWeightKilograms) > 0.000001
  )
    throw new Error(
      "Die Konfigurationsvariante wurde gelöscht oder nachträglich geändert. Bitte den Shop kontaktieren.",
    );
  const status =
    variant.availableForSale &&
    variant.product.status === "ACTIVE" &&
    variant.product.publishedAt
      ? "available"
      : "checking";
  return { ...configurationResponse(record), status };
}
