import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROPE_CONFIG } from "./rope-configurator-config";

const graphql = vi.hoisted(() => vi.fn());
vi.mock("./shopify-graphql.server", () => ({ adminGraphql: graphql }));
import { loadConfigurationProduct } from "./rope-components.server";

const gid = (kind: string, id: number) => `gid://shopify/${kind}/${id}`;
function metaobject(id: number, type: string, fields: Record<string, string>) {
  return {
    id: gid("Metaobject", id),
    type: `app--123--${type}`,
    fields: Object.entries(fields).map(([key, value]) => ({ key, value })),
  };
}
function fixture() {
  const position = metaobject(1, "configuration_position", {
    code: "end_1",
    label: "Endverbindung 1",
    active: "true",
    required: "true",
    sort_order: "0",
  });
  const mapping = metaobject(10, "component_mapping", {
    label: "Kausche A",
    active: "true",
    sort_order: "0",
    quantity: "1",
    base_product: gid("Product", 1),
    position: position.id,
    component: gid("ProductVariant", 20),
  });
  const list = (nodes: ReturnType<typeof metaobject>[]) => ({
    value: JSON.stringify(nodes.map((node) => node.id)),
    references: { nodes, pageInfo: { hasNextPage: false } },
  });
  return {
    shop: { currencyCode: "EUR" },
    positionDefinition: { type: "app--123--configuration_position" },
    mappingDefinition: { type: "app--123--component_mapping" },
    product: {
      id: gid("Product", 1),
      title: "Seil A",
      handle: "seil-a",
      productType: "Spezialseile",
      status: "ACTIVE",
      publishedAt: "2026-01-01",
      positions: list([position]),
      mappings: list([mapping]),
      variants: {
        nodes: [
          {
            id: gid("ProductVariant", 1),
            price: "0.10",
            sku: null,
            taxable: true,
            selectedOptions: [{ name: "Title", value: "Default Title" }],
            ropeConfiguration: null,
            isDefaultConfiguration: null,
            inventoryItem: {
              measurement: { weight: { value: 1, unit: "GRAMS" } },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  };
}
function component() {
  return {
    id: gid("ProductVariant", 20),
    price: "2.50",
    title: "Standard",
    product: { title: "Kausche A", status: "ACTIVE" },
    inventoryItem: {
      requiresShipping: true,
      measurement: { weight: { value: 50, unit: "GRAMS" } },
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
});

describe("explicit component mappings", () => {
  it("uses the app-resolved definition types rather than assuming a type-name suffix", async () => {
    const data = fixture();
    data.positionDefinition.type = "resolved-position-type";
    data.mappingDefinition.type = "resolved-mapping-type";
    data.product.positions.references.nodes[0].type =
      data.positionDefinition.type;
    data.product.mappings.references.nodes[0].type =
      data.mappingDefinition.type;
    graphql
      .mockResolvedValueOnce({ ok: true, data })
      .mockResolvedValueOnce({ ok: true, data: { nodes: [component()] } });
    expect(
      (
        await loadConfigurationProduct(
          {},
          gid("Product", 1),
          DEFAULT_ROPE_CONFIG,
        )
      ).mappings,
    ).toHaveLength(1);
  });

  it.each([
    ["code", "Ende 1", "Code muss"],
    ["required", "", "Pflichtauswahl muss"],
    ["sort_order", "", "Sortierung muss"],
    ["active", "", "Aktiv muss"],
  ])(
    "identifies the invalid position field %s",
    async (key, value, message) => {
      const data = fixture();
      data.product.positions.references.nodes[0].fields.find(
        (field) => field.key === key,
      )!.value = value;
      graphql.mockResolvedValueOnce({ ok: true, data });
      await expect(
        loadConfigurationProduct({}, gid("Product", 1), DEFAULT_ROPE_CONFIG),
      ).rejects.toThrow(`Konfigurationsposition "Endverbindung 1": ${message}`);
    },
  );

  it("rejects positions and mappings from a different definition", async () => {
    for (const list of ["positions", "mappings"] as const) {
      const data = fixture();
      data.product[list].references.nodes[0].type = "merchant-owned-type";
      graphql.mockResolvedValueOnce({ ok: true, data });
      await expect(
        loadConfigurationProduct({}, gid("Product", 1), DEFAULT_ROPE_CONFIG),
      ).rejects.toThrow(
        list === "positions"
          ? "falsche Metaobjekt-Definition"
          : "Komponentenfreigabe",
      );
    }
  });

  it("reports missing deployed app definitions", async () => {
    graphql.mockResolvedValueOnce({
      ok: true,
      data: { ...fixture(), positionDefinition: null },
    });
    await expect(
      loadConfigurationProduct({}, gid("Product", 1), DEFAULT_ROPE_CONFIG),
    ).rejects.toThrow("App-Konfiguration deployen");
  });

  it("identifies duplicate position codes and labels", async () => {
    const data = fixture();
    const first = data.product.positions.references.nodes[0];
    data.product.positions.references.nodes.push({
      ...first,
      id: gid("Metaobject", 2),
    });
    data.product.positions.value = JSON.stringify(
      data.product.positions.references.nodes.map((entry) => entry.id),
    );
    graphql.mockResolvedValueOnce({ ok: true, data });
    await expect(
      loadConfigurationProduct({}, gid("Product", 1), DEFAULT_ROPE_CONFIG),
    ).rejects.toThrow("Code ist doppelt; Bezeichnung ist doppelt");
  });

  it("loads permitted real variants and their current prices and weights", async () => {
    graphql
      .mockResolvedValueOnce({ ok: true, data: fixture() })
      .mockResolvedValueOnce({ ok: true, data: { nodes: [component()] } });
    const result = await loadConfigurationProduct(
      {},
      gid("Product", 1),
      DEFAULT_ROPE_CONFIG,
    );
    expect(result.mappings[0]).toMatchObject({
      variantId: gid("ProductVariant", 20),
      price: "2.50",
      quantity: 1,
    });
    expect(result.positions[0]).toMatchObject({
      code: "end_1",
      required: true,
    });
  });

  it.each([
    ["base_product", gid("Product", 2)],
    ["position", gid("Metaobject", 2)],
    ["quantity", "0"],
    ["active", ""],
  ])("rejects invalid mapping field %s", async (key, value) => {
    const data = fixture();
    data.product.mappings.references.nodes[0].fields.find(
      (field) => field.key === key,
    )!.value = value;
    graphql.mockResolvedValueOnce({ ok: true, data });
    await expect(
      loadConfigurationProduct({}, gid("Product", 1), DEFAULT_ROPE_CONFIG),
    ).rejects.toThrow("Komponentenfreigabe");
  });

  it("does not offer inactive mappings or silently accept a required position without options", async () => {
    const data = fixture();
    data.product.mappings.references.nodes[0].fields.find(
      (field) => field.key === "active",
    )!.value = "false";
    graphql.mockResolvedValueOnce({ ok: true, data });
    await expect(
      loadConfigurationProduct({}, gid("Product", 1), DEFAULT_ROPE_CONFIG),
    ).rejects.toThrow("aktive Komponentenfreigabe");
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it("rejects dangling references and components without required shipping weight", async () => {
    const data = fixture();
    data.product.mappings.value = JSON.stringify([
      gid("Metaobject", 10),
      gid("Metaobject", 11),
    ]);
    graphql.mockResolvedValueOnce({ ok: true, data });
    await expect(
      loadConfigurationProduct({}, gid("Product", 1), DEFAULT_ROPE_CONFIG),
    ).rejects.toThrow("unvollstaendige");
    const invalid = component();
    invalid.inventoryItem.measurement.weight.value = 0;
    graphql
      .mockResolvedValueOnce({ ok: true, data: fixture() })
      .mockResolvedValueOnce({ ok: true, data: { nodes: [invalid] } });
    await expect(
      loadConfigurationProduct({}, gid("Product", 1), DEFAULT_ROPE_CONFIG),
    ).rejects.toThrow("Versandgewicht");
  });
});
