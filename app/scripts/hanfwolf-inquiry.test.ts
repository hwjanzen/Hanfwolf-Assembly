import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const script = readFileSync(new URL("../../assets/hanfwolf-inquiry.js", import.meta.url), "utf8");
const contextFunction = script.slice(
  script.indexOf("  function contextFor"),
  script.indexOf('  document.addEventListener("click"'),
);

describe("individual inquiry context", () => {
  it("captures collection, URL and active filters once, including zero-result pages", () => {
    const inputs = [
      { name: "filter.p.m.diameter", type: "checkbox", checked: true, value: "20" },
      { name: "filter.p.m.diameter", type: "checkbox", checked: true, value: "20" },
      { name: "filter.p.m.diameter", type: "checkbox", checked: false, value: "25" },
    ];
    const context = runInNewContext(contextFunction + "\ncontextFor(trigger, root);", {
      window: { location: { href: "https://shop.test/collections/hawo-seile?filter=20" } },
      root: { dataset: { inquiryAssortment: "HaWo – Seile" } },
      trigger: { closest: () => null },
      document: { querySelector: () => ({ querySelectorAll: () => inputs }) },
    });
    expect(context).toContain("Sortiment: HaWo – Seile");
    expect(context).toContain("Seite: https://shop.test/collections/hawo-seile");
    expect(context.match(/Filter:/g)).toHaveLength(1);
    expect(context).not.toContain("=25");
  });

  it("captures the clicked draft cut, not another cut or only finished configuration", () => {
    const cut = {
      querySelector: (selector: string) => ({
        textContent: selector === "legend" ? "Zuschnitt 2" : "Endverbindung 1",
        value: selector === "[data-rope-quantity]" ? "3" : "2.5",
      }),
      querySelectorAll: () => [{
        id: "option-end_1", selectedIndex: 0,
        options: [{ textContent: "Ende spitz" }],
      }],
    };
    const context = runInNewContext(contextFunction + "\ncontextFor(trigger, root);", {
      window: { location: { href: "https://shop.test/products/seil" } },
      root: { dataset: { inquiryAssortment: "DIEPA", inquiryProduct: "Seil A" } },
      trigger: { closest: () => cut },
    });
    expect(context).toContain("Produkt: Seil A");
    expect(context).toContain("Zuschnitt 2");
    expect(context).toContain("Anzahl: 3");
    expect(context).toContain("Länge je Stück (m): 2.5");
    expect(context).toContain("Endverbindung 1: Ende spitz");
  });

  it("uses native contact fields and server-confirmed success, outside the cart form", () => {
    const snippet = readFileSync(new URL("../../snippets/hanfwolf-inquiry.liquid", import.meta.url), "utf8");
    expect(snippet).toContain("form 'contact'");
    expect(snippet).toContain("form.posted_successfully?");
    for (const field of ["email", "name", "body", "Kontext"]) {
      expect(snippet).toContain(`name="contact[${field}]"`);
    }
    const section = readFileSync(new URL("../../sections/seile.liquid", import.meta.url), "utf8");
    expect(section.indexOf("render 'hanfwolf-inquiry'")).toBeGreaterThan(section.indexOf("</form>"));
    const collection = readFileSync(new URL("../../sections/main-collection-product-grid.liquid", import.meta.url), "utf8");
    expect(collection.indexOf("render 'hanfwolf-inquiry'")).toBeGreaterThan(collection.indexOf("endpaginate"));
  });

  it("restores all cuts as drafts after a native contact post", async () => {
    const configurator = readFileSync(new URL("./rope-configurator.js", import.meta.url), "utf8");
    const loadSetup = configurator.slice(
      configurator.indexOf("  async function loadSetup()"),
      configurator.indexOf('  reloadButton.addEventListener("click"'),
    );
    const restored: Array<{ inputs: { querySelector: (selector: string) => { value: string } }; selects: Map<string, { dataset: { positionCode: string }; value: string }> }> = [];
    const drafts = [
      { quantity: "2", length: "3.5", selections: [{ code: "end_1", value: "kausche" }] },
      { quantity: "4", length: "8", selections: [{ code: "end_1", value: "" }] },
    ];
    const storage = new Map([["hw-inquiry-drafts:/products/seil", JSON.stringify(drafts)]]);
    const context = {
      setup: null, showError() {}, reloadButton: { hidden: false }, overallStatus: { textContent: "" },
      jsonRequest: async () => ({}), proxyPath: "", script: { dataset: { productId: "1" } },
      window: { location: { pathname: "/products/seil" } },
      sessionStorage: { getItem: (key: string) => storage.get(key), removeItem: (key: string) => storage.delete(key) },
      cuts: restored, updatePreview() {},
      addCut() {
        const fields = new Map<string, { value: string }>();
        restored.push({
          inputs: { querySelector: (selector: string) => {
            if (!fields.has(selector)) fields.set(selector, { value: "" });
            return fields.get(selector)!;
          } },
          selects: new Map([["position", { dataset: { positionCode: "end_1" }, value: "" }]]),
        });
      },
    };
    await runInNewContext(loadSetup + "\nloadSetup();", context);
    expect(restored).toHaveLength(2);
    expect(restored[0].inputs.querySelector("[data-rope-quantity]").value).toBe("2");
    expect(restored[1].inputs.querySelector("[data-rope-length]").value).toBe("8");
    expect(restored[0].selects.get("position")?.value).toBe("kausche");
    expect(storage.size).toBe(0);
  });
});
