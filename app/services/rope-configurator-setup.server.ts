import prisma from "../db.server";
import {
  DEFAULT_ROPE_CONFIG,
  type MetafieldMapping,
  type RopeConfiguratorConfig,
} from "./rope-configurator-config";

export type {
  MetafieldMapping,
  RopeConfiguratorConfig,
} from "./rope-configurator-config";

function createMapping(
  definitionId: string | null | undefined,
  namespace: string | null | undefined,
  key: string | null | undefined,
): MetafieldMapping | null {
  return namespace && key ? { definitionId: definitionId ?? "", namespace, key } : null;
}

export async function getRopeConfiguratorSetup(shop: string) {
  return prisma.ropeConfiguratorSetup.findUnique({ where: { shop } });
}

export async function getRopeConfiguratorConfig(shop: string): Promise<RopeConfiguratorConfig> {
  const setup = await getRopeConfiguratorSetup(shop);
  if (!setup) return DEFAULT_ROPE_CONFIG;

  return {
    minLengthHundredths: setup.minLengthHundredths,
    maxLengthHundredths: setup.maxLengthHundredths,
    defaultLengthHundredths: setup.defaultLengthHundredths,
    minQuantity: setup.minQuantity,
    maxQuantity: setup.maxQuantity,
    haspelSurchargeMetafield: createMapping(
      setup.haspelSurchargeMetafieldDefinitionId,
      setup.haspelSurchargeMetafieldNamespace,
      setup.haspelSurchargeMetafieldKey,
    ),
    ropeProductType: setup.ropeProductType,
  };
}

export async function saveRopeConfiguratorSetup(
  shop: string,
  config: RopeConfiguratorConfig,
) {
  const data = {
    haspelSurchargeMetafieldDefinitionId: config.haspelSurchargeMetafield?.definitionId ?? null,
    haspelSurchargeMetafieldNamespace: config.haspelSurchargeMetafield?.namespace ?? null,
    haspelSurchargeMetafieldKey: config.haspelSurchargeMetafield?.key ?? null,
    ropeProductType: config.ropeProductType,
    minLengthHundredths: config.minLengthHundredths,
    maxLengthHundredths: config.maxLengthHundredths,
    defaultLengthHundredths: config.defaultLengthHundredths,
    minQuantity: config.minQuantity,
    maxQuantity: config.maxQuantity,
  };

  return prisma.ropeConfiguratorSetup.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });
}
