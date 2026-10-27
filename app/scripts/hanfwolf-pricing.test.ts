import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(
  new URL("./hanfwolf-pricing.js", import.meta.url),
  "utf8",
);
function setup() {
  const fetch = vi.fn();
  const assign = vi.fn();
  const window = {
    location: {
      pathname: "/products/seil",
      origin: "https://example.test",
      assign,
    },
    Shopify: { routes: { root: "/de/" } },
    HanfwolfPricing: {
      addConfiguredCutsToCart: vi.fn<(items: unknown[]) => Promise<unknown>>(),
      finalizeCart: (): Promise<unknown> => Promise.resolve(),
    },
  };
  runInNewContext(script, {
    window,
    fetch,
    URL,
    AbortSignal,
    document: {
      currentScript: { dataset: { disablePriceFeature: "true" } },
      querySelector: () => null,
      addEventListener: () => {},
    },
  });
  return { fetch, assign, api: window.HanfwolfPricing };
}
const item = (id: number) => ({
  variantId: `gid://shopify/ProductVariant/${id}`,
  quantity: 2,
  properties: {
    _hanfwolf_rope_cut_id: `cut-${id}`,
    _hanfwolf_configuration_id: `config-${id}`,
    _hanfwolf_quantity_unit: "piece",
    Länge: "2,5 m",
  },
});
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("configured cart batch", () => {
  it("adds all cuts together as pieces and never submits a browser-supplied price", async () => {
    const { fetch, api } = setup();
    fetch
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ items: [{ id: 1 }, { id: 2 }] }));
    await api.addConfiguredCutsToCart([item(1), item(2)]);
    expect(fetch.mock.calls[1][0]).toBe("/de/cart/add.js");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      items: [1, 2].map((id) => ({
        id: String(id),
        quantity: 2,
        properties: item(id).properties,
      })),
    });
  });

  it("does not add again after an uncertain successful request", async () => {
    const { fetch, api } = setup();
    fetch.mockResolvedValueOnce(
      response({
        items: [{ variant_id: 1, quantity: 2, properties: item(1).properties }],
      }),
    );
    await api.addConfiguredCutsToCart([item(1)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("only retries missing lines after a partial add and rejects conflicting quantities", async () => {
    const { fetch, api } = setup();
    fetch
      .mockResolvedValueOnce(
        response({
          items: [
            { variant_id: 1, quantity: 2, properties: item(1).properties },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ items: [{ id: 2 }] }));
    await api.addConfiguredCutsToCart([item(1), item(2)]);
    expect(JSON.parse(fetch.mock.calls[1][1].body).items).toHaveLength(1);
    fetch.mockResolvedValueOnce(
      response({
        items: [{ variant_id: 1, quantity: 3, properties: item(1).properties }],
      }),
    );
    await expect(api.addConfiguredCutsToCart([item(1)])).rejects.toThrow(
      "anderer Menge",
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("surfaces malformed success responses and invalid prepared inputs", async () => {
    const { fetch, api } = setup();
    await expect(
      api.addConfiguredCutsToCart([item(1), item(1)]),
    ).rejects.toThrow("Ungültiger vorbereiteter Zuschnitt.");
    expect(fetch).not.toHaveBeenCalled();
    fetch
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({}));
    await expect(api.addConfiguredCutsToCart([item(1)])).rejects.toThrow(
      "Shopify hat die Übernahme nicht eindeutig bestätigt. Bitte erneut versuchen oder den Warenkorb prüfen.",
    );
  });

  it("uses native checkout for v3 configurations even without the legacy cut marker", async () => {
    const { fetch, api, assign } = setup();
    fetch.mockResolvedValueOnce(
      response({
        items: [{ properties: { _hanfwolf_configuration_id: "hash" } }],
      }),
    );
    await api.finalizeCart();
    expect(assign).toHaveBeenCalledWith("/de/checkout");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
