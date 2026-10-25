import { createHash } from "node:crypto";
import type { RopeConfiguratorConfig } from "./rope-configurator-config";
import { convertWeightToKilograms } from "./rope-draft-order.server";

export class ConfigurationInputError extends Error {}

export type Position = {
  id: string;
  code: string;
  label: string;
  required: boolean;
  sortOrder: number;
};

export type ComponentMapping = {
  id: string;
  positionId: string;
  label: string;
  quantity: number;
  sortOrder: number;
  variantId: string;
  price: string;
  weight: { value: number; unit: string } | null;
};

export type ConfigurationInput = {
  productId: string;
  quantity: number;
  lengthDecimeters: number;
  selections: Array<{ positionId: string; mappingId: string | null }>;
  requestId: string;
};

export type ConfigurationSnapshot = {
  version: 3;
  productId: string;
  sourceVariantId: string;
  productHandle: string;
  productTitle: string;
  currency: string;
  taxable: boolean;
  lengthDecimeters: number;
  basePricePerDecimeter: string;
  baseWeightPerDecimeter: { value: number; unit: string };
  selections: Array<{
    positionId: string;
    code: string;
    label: string;
    mappingId: string | null;
    componentLabel: string;
    variantId: string | null;
    quantity: number;
    unitPrice: string;
    weightKilograms: number;
  }>;
  unitPriceCents: number;
  unitWeightKilograms: number;
};

export function priceCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Ein gepflegter Shopify-Preis ist ungueltig.");
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Der Preis ist zu gross.");
  return cents;
}

export function normalizeConfigurationInput(
  value: unknown,
  config: RopeConfiguratorConfig,
): ConfigurationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigurationInputError("Ungueltige Konfiguration.");
  }
  const input = value as Record<string, unknown>;
  const productId = String(input.productId || "");
  const requestId = String(input.requestId || "");
  const quantity = Number(input.quantity);
  const length = String(input.lengthMeters || "")
    .trim()
    .replace(",", ".");
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) {
    throw new ConfigurationInputError("Ungueltiger Basisartikel.");
  }
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(requestId)) {
    throw new ConfigurationInputError("Ungueltige Anfrage-ID.");
  }
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < config.minQuantity ||
    quantity > config.maxQuantity
  ) {
    throw new ConfigurationInputError(
      `Die Stueckzahl muss zwischen ${config.minQuantity} und ${config.maxQuantity} liegen.`,
    );
  }
  if (!/^\d+(?:\.\d)?$/.test(length)) {
    throw new ConfigurationInputError(
      "Die Laenge muss in Schritten von 0,1 m angegeben werden.",
    );
  }
  const lengthDecimeters = Math.round(Number(length) * 10);
  if (
    !Number.isSafeInteger(lengthDecimeters) ||
    lengthDecimeters * 10 < config.minLengthHundredths ||
    lengthDecimeters * 10 > config.maxLengthHundredths
  ) {
    throw new ConfigurationInputError(
      "Die Laenge liegt ausserhalb des erlaubten Bereichs.",
    );
  }
  if (!Array.isArray(input.selections) || input.selections.length > 30) {
    throw new ConfigurationInputError("Ungueltige Komponentenauswahl.");
  }
  const seen = new Set<string>();
  const selections = input.selections.map((selection: unknown) => {
    if (
      !selection ||
      typeof selection !== "object" ||
      Array.isArray(selection)
    ) {
      throw new ConfigurationInputError("Ungueltige Komponentenauswahl.");
    }
    const entry = selection as Record<string, unknown>;
    const positionId = String(entry.positionId || "");
    const mappingId =
      entry.mappingId == null || entry.mappingId === ""
        ? null
        : String(entry.mappingId);
    if (
      !/^gid:\/\/shopify\/Metaobject\/\d+$/.test(positionId) ||
      (mappingId !== null &&
        !/^gid:\/\/shopify\/Metaobject\/\d+$/.test(mappingId)) ||
      seen.has(positionId)
    ) {
      throw new ConfigurationInputError(
        "Ungueltige oder doppelte Konfigurationsposition.",
      );
    }
    seen.add(positionId);
    return { positionId, mappingId };
  });
  return { productId, requestId, quantity, lengthDecimeters, selections };
}

export function buildConfigurationSnapshot(
  input: ConfigurationInput,
  source: Omit<
    ConfigurationSnapshot,
    | "version"
    | "lengthDecimeters"
    | "selections"
    | "unitPriceCents"
    | "unitWeightKilograms"
  >,
  positions: Position[],
  mappings: ComponentMapping[],
): ConfigurationSnapshot {
  if (input.selections.length !== positions.length) {
    throw new ConfigurationInputError(
      "Die Konfigurationspositionen haben sich geaendert. Bitte die Seite neu laden.",
    );
  }
  const selections = [...positions]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((position) => {
      const selected = input.selections.find(
        (entry) => entry.positionId === position.id,
      );
      if (!selected)
        throw new ConfigurationInputError(
          `Die Auswahl fuer ${position.label} fehlt.`,
        );
      const mapping = selected.mappingId
        ? mappings.find(
            (entry) =>
              entry.id === selected.mappingId &&
              entry.positionId === position.id,
          )
        : null;
      if ((selected.mappingId && !mapping) || (position.required && !mapping)) {
        throw new ConfigurationInputError(
          `Die Auswahl fuer ${position.label} ist nicht freigegeben.`,
        );
      }
      return {
        positionId: position.id,
        code: position.code,
        label: position.label,
        mappingId: mapping?.id ?? null,
        componentLabel: mapping?.label ?? "Ohne",
        variantId: mapping?.variantId ?? null,
        quantity: mapping?.quantity ?? 0,
        unitPrice: mapping?.price ?? "0.00",
        weightKilograms: mapping?.weight
          ? convertWeightToKilograms(mapping.weight.value, mapping.weight.unit)
          : 0,
      };
    });
  const unitPriceCents =
    priceCents(source.basePricePerDecimeter) * input.lengthDecimeters +
    selections.reduce(
      (sum, selection) =>
        sum + priceCents(selection.unitPrice) * selection.quantity,
      0,
    );
  const unitWeightKilograms = Number(
    (
      convertWeightToKilograms(
        source.baseWeightPerDecimeter.value,
        source.baseWeightPerDecimeter.unit,
      ) *
        input.lengthDecimeters +
      selections.reduce(
        (sum, selection) =>
          sum + selection.weightKilograms * selection.quantity,
        0,
      )
    ).toFixed(6),
  );
  if (
    !Number.isSafeInteger(unitPriceCents) ||
    !Number.isFinite(unitWeightKilograms) ||
    unitWeightKilograms <= 0
  ) {
    throw new Error(
      "Preis oder Versandgewicht der Konfiguration ist ungueltig.",
    );
  }
  return {
    version: 3,
    ...source,
    lengthDecimeters: input.lengthDecimeters,
    selections,
    unitPriceCents,
    unitWeightKilograms,
  };
}

export function configurationId(shop: string, snapshot: ConfigurationSnapshot) {
  const canonical = JSON.stringify([shop, snapshot], (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) =>
            left.localeCompare(right, "en"),
          ),
        )
      : value,
  );
  return createHash("sha256").update(canonical).digest("hex");
}

// Keep immutable snapshots/hashes unchanged when renaming the standard rope end.
export function selectionDisplayLabel(
  selection: ConfigurationSnapshot["selections"][number],
) {
  return selection.mappingId === null &&
    (selection.code === "end_1" || selection.code === "end_2")
    ? "Ende spitz"
    : selection.componentLabel;
}

export function configurationProperties(
  snapshot: ConfigurationSnapshot,
  id: string,
) {
  return {
    Länge: `${(snapshot.lengthDecimeters / 10).toFixed(1).replace(".", ",")} m`,
    ...Object.fromEntries(
      snapshot.selections.map((selection) => [
        selection.label,
        selectionDisplayLabel(selection),
      ]),
    ),
    _hanfwolf_configuration_id: id,
    _hanfwolf_quantity_unit: "piece",
  };
}
