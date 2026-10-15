import { describe, expect, it } from "vitest";
import { DEFAULT_ROPE_CONFIG } from "./rope-configurator-config";
import {
  buildConfigurationSnapshot,
  configurationId,
  configurationProperties,
  normalizeConfigurationInput,
  priceCents,
  type ComponentMapping,
  type Position,
} from "./rope-configuration";

const positions: Position[] = [
  {
    id: "gid://shopify/Metaobject/1",
    code: "end_1",
    label: "Endverbindung 1",
    required: true,
    sortOrder: 0,
  },
  {
    id: "gid://shopify/Metaobject/2",
    code: "end_2",
    label: "Endverbindung 2",
    required: false,
    sortOrder: 1,
  },
];
const mappings: ComponentMapping[] = positions.map((position, index) => ({
  id: `gid://shopify/Metaobject/${index + 10}`,
  positionId: position.id,
  label: "Kausche",
  quantity: 1,
  sortOrder: 0,
  variantId: "gid://shopify/ProductVariant/20",
  price: "2.50",
  weight: { value: 50, unit: "GRAMS" },
}));
const source = {
  productId: "gid://shopify/Product/1",
  sourceVariantId: "gid://shopify/ProductVariant/1",
  productHandle: "seil",
  productTitle: "Seil",
  currency: "EUR",
  taxable: true,
  basePricePerDecimeter: "0.10",
  baseWeightPerDecimeter: { value: 10, unit: "GRAMS" },
};
function input(overrides = {}) {
  return normalizeConfigurationInput(
    {
      productId: source.productId,
      quantity: 2,
      lengthMeters: "2,5",
      requestId: "a-valid-request-id-0001",
      selections: positions.map((position, index) => ({
        positionId: position.id,
        mappingId: mappings[index].id,
      })),
      ...overrides,
    },
    DEFAULT_ROPE_CONFIG,
  );
}
function snapshot(overrides = {}) {
  return buildConfigurationSnapshot(
    input(overrides),
    source,
    positions,
    mappings,
  );
}

describe("immutable piece configurations", () => {
  it("charges each selected component once per position and keeps quantity separate", () => {
    const result = snapshot();
    expect(result.unitPriceCents).toBe(750);
    expect(result.unitWeightKilograms).toBe(0.35);
    expect(snapshot({ quantity: 4 })).toEqual(result);
    expect(configurationProperties(result, "hash")).toEqual({
      Länge: "2,5 m",
      "Endverbindung 1": "Kausche",
      "Endverbindung 2": "Kausche",
      _hanfwolf_configuration_id: "hash",
      _hanfwolf_quantity_unit: "piece",
    });
  });

  it("supports optional Ohne, component multipliers, and weightless services", () => {
    const request = input({
      selections: [
        { positionId: positions[0].id, mappingId: mappings[0].id },
        { positionId: positions[1].id, mappingId: null },
      ],
    });
    const result = buildConfigurationSnapshot(request, source, positions, [
      { ...mappings[0], quantity: 2, weight: null },
    ]);
    expect(result.unitPriceCents).toBe(750);
    expect(result.unitWeightKilograms).toBe(0.25);
    expect(result.selections[1].componentLabel).toBe("Ohne");
  });

  it("canonicalizes selection order and scopes configuration hashes by shop and price snapshot", () => {
    const original = snapshot();
    const reversed = buildConfigurationSnapshot(
      input(),
      source,
      [...positions].reverse(),
      mappings,
    );
    expect(configurationId("a.myshopify.com", original)).toBe(
      configurationId("a.myshopify.com", reversed),
    );
    expect(configurationId("a.myshopify.com", original)).not.toBe(
      configurationId("b.myshopify.com", original),
    );
    for (const changed of [
      { ...source, basePricePerDecimeter: "0.11" },
      { ...source, baseWeightPerDecimeter: { value: 11, unit: "GRAMS" } },
    ]) {
      expect(
        configurationId(
          "a",
          buildConfigurationSnapshot(input(), changed, positions, mappings),
        ),
      ).not.toBe(configurationId("a", original));
    }
    expect(
      configurationId(
        "a",
        buildConfigurationSnapshot(input(), source, positions, [
          { ...mappings[0], price: "3.00" },
          mappings[1],
        ]),
      ),
    ).not.toBe(configurationId("a", original));
  });

  it.each([
    { quantity: 0 },
    { quantity: 1.5 },
    { quantity: 1000 },
    { lengthMeters: "0.4" },
    { lengthMeters: "500.1" },
    { lengthMeters: "2.55" },
    { lengthMeters: "-1" },
    { requestId: "short" },
    { productId: "other" },
    {
      selections: [
        { positionId: positions[0].id, mappingId: null },
        { positionId: positions[0].id, mappingId: null },
      ],
    },
  ])("rejects invalid input %j", (overrides) => {
    expect(() => input(overrides)).toThrow();
  });

  it("accepts exact length boundaries and rejects missing, foreign or required-empty selections", () => {
    expect(input({ lengthMeters: "0.5" }).lengthDecimeters).toBe(5);
    expect(input({ lengthMeters: "500" }).lengthDecimeters).toBe(5000);
    expect(() => snapshot({ selections: [] })).toThrow();
    expect(() =>
      snapshot({
        selections: [
          { positionId: positions[0].id, mappingId: mappings[1].id },
          { positionId: positions[1].id, mappingId: null },
        ],
      }),
    ).toThrow("nicht freigegeben");
    expect(() =>
      snapshot({
        selections: positions.map((position) => ({
          positionId: position.id,
          mappingId: null,
        })),
      }),
    ).toThrow("nicht freigegeben");
  });

  it("uses integer cents without floating point multiplication", () => {
    expect(priceCents("0.29")).toBe(29);
    expect(priceCents("2.5")).toBe(250);
    expect(priceCents("0")).toBe(0);
    expect(() => priceCents("1.001")).toThrow();
    expect(() => priceCents("-1")).toThrow();
    expect(
      buildConfigurationSnapshot(
        input({ lengthMeters: "1.3" }),
        {
          ...source,
          basePricePerDecimeter: "0.29",
        },
        positions,
        mappings,
      ).unitPriceCents,
    ).toBe(877);
  });
});
