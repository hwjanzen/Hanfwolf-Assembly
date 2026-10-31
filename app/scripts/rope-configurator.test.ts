import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const script = readFileSync(new URL("./rope-configurator.js", import.meta.url), "utf8");
const template = readFileSync(
  new URL("../../sections/seile.liquid", import.meta.url),
  "utf8",
);

describe("responsive order summary", () => {
  function renderSummary(quantity = 1, prepared = true, submitting = false) {
    type Node = {
      tag: string;
      textContent: string;
      className: string;
      disabled: boolean;
      children: Node[];
      attributes: Record<string, string>;
      listeners: Record<string, () => void>;
      setAttribute: (key: string, value: string) => void;
      appendChild: (node: Node) => void;
      replaceChildren: () => void;
      addEventListener: (event: string, callback: () => void) => void;
    };
    const node = (tag: string): Node => ({
      tag, textContent: "", className: "", disabled: false, children: [],
      attributes: {}, listeners: {},
      setAttribute(key, value) { this.attributes[key] = value; },
      appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      addEventListener(event, callback) { this.listeners[event] = callback; },
    });
    const rows = node("tbody");
    const total = node("p");
    const events: string[] = [];
    const cut = {
      input: { quantity, lengthMeters: 1, selections: [{ positionId: "end_1", mappingId: "end" }] },
      prepared: prepared ? { currency: "EUR", unitPriceCents: 5000 } : null,
      element: { scrollIntoView: () => events.push("scroll") },
    };
    runInNewContext(
      script.slice(script.indexOf("  function renderSummary()"), script.indexOf("  function editCut(")) +
        "\nrenderSummary();",
      {
        reviewRows: rows, totalElement: total, cuts: [cut, cut], submitting,
        setup: { positions: [{ id: "end_1", label: "Endverbindung 1", options: [{ id: "end", label: "Ende spitz" }] }] },
        document: { createElement: node },
        money: (cents: number) => `${(cents / 100).toFixed(2)} EUR`,
        editCut: () => events.push("edit"),
        removeCut: () => events.push("remove"),
      },
    );
    return { rows, total, events };
  }

  it("pairs all values with mobile labels and preserves totals and actions", () => {
    const { rows, total, events } = renderSummary(2);
    expect(rows.children).toHaveLength(2);
    const cells = rows.children[0].children;
    expect(cells.slice(0, 6).map((cell) => cell.children[0].textContent)).toEqual([
      "Zuschnitt", "Stück", "Länge je Stück", "Ausführung", "Stückpreis", "Gesamt",
    ]);
    expect(cells.slice(0, 6).map((cell) => cell.children[1].textContent)).toEqual([
      "1", "2", "1,0 m", "Endverbindung 1: Ende spitz", "50.00 EUR", "100.00 EUR",
    ]);
    expect(cells.slice(0, 6).every((cell) => cell.children[0].attributes["aria-hidden"] === "true")).toBe(true);
    expect(total.textContent).toBe("Gesamtsumme: 200.00 EUR");
    expect(cells[3].className).toBe("rope-summary__configuration");
    expect(cells[6].className).toBe("rope-summary__actions");
    cells[6].children[0].listeners.click();
    cells[6].children[1].listeners.click();
    expect(events).toEqual(["edit", "scroll", "remove"]);
  });

  it("preserves pending prices and disables actions while submitting", () => {
    const { rows, total } = renderSummary(1, false, true);
    const cells = rows.children[0].children;
    expect(cells[4].children[1].textContent).toBe("Wird ermittelt");
    expect(cells[5].children[1].textContent).toBe("Wird ermittelt");
    expect(total.textContent).toBe("Gesamtsumme wird ermittelt.");
    expect(cells[6].children.every((button) => button.disabled)).toBe(true);
  });
});

describe("rope preview layout", () => {
  it("renders confirmation buttons with German umlauts", () => {
    const renderFunction = script.slice(
      script.indexOf("  function render()"),
      script.indexOf("  function renderSummary()"),
    );
    const confirmButton = { disabled: false, textContent: "" };
    const context = {
      cuts: [],
      setup: {},
      submitting: false,
      confirmed: false,
      addButton: {},
      reviewButton: {},
      confirmButton,
      submitButton: { setAttribute() {} },
      overallStatus: {},
      review: { hidden: true },
    };
    runInNewContext(renderFunction + "\nrender();", context);
    expect(confirmButton.textContent).toBe("Konfiguration bestätigen");
    context.confirmed = true;
    runInNewContext(renderFunction + "\nrender();", context);
    expect(confirmButton.textContent).toBe("Zusammenstellung bestätigt");
  });

  it("keeps both input fieldsets inside the shared lock and before separate previews", () => {
    const inputs = template.indexOf("data-rope-inputs");
    const quantity = template.indexOf("data-rope-quantity", inputs);
    const options = template.indexOf("data-rope-options", inputs);
    const preview = template.indexOf("<div data-rope-preview", inputs);
    expect(inputs).toBeGreaterThan(0);
    expect(quantity).toBeGreaterThan(inputs);
    expect(options).toBeGreaterThan(quantity);
    expect(preview).toBeGreaterThan(options);
    expect(template.slice(options, preview)).toMatch(/<\/fieldset>\s*<\/fieldset>/);
    const ropePreviewEnd = template.indexOf("</figure>", preview);
    const presentation = template.indexOf('data-rope-preview-end="presentation"', preview);
    expect(presentation).toBeGreaterThan(ropePreviewEnd);
    expect(template.slice(ropePreviewEnd, presentation)).toContain("data-rope-preview-group");
  });

  it("shows the presentation separately and hides its whole group for Ohne", () => {
    const part = {
      dataset: { ropePreviewEnd: "presentation" },
      hidden: true,
      children: [] as Array<{ textContent?: string; src?: string }>,
      replaceChildren() { this.children = []; },
      appendChild(child: { textContent?: string; src?: string }) { this.children.push(child); },
    };
    const group = { hidden: true, querySelectorAll: () => [part] };
    const preview = {
      hidden: true,
      querySelectorAll: (selector: string) =>
        selector === "[data-rope-preview-group]" ? [group] : [part],
    };
    const select = { value: "" };
    const context = {
      setup: {
        positions: [{
          id: "presentation",
          code: "presentation",
          label: "Aufmachung",
          options: ["Haspel", "Ring"].map((label) => ({
            id: label, label, image: { url: `${label}.png`, altText: label },
          })),
        }],
      },
      document: { createElement: () => ({ addEventListener() {} }) },
      element: { querySelector: () => preview },
      selects: new Map([["presentation", select]]),
    };
    const previewFunctions = script.slice(
      script.indexOf("  function handlePreviewImageError"),
      script.indexOf("  function addCut()"),
    );
    const render = () => runInNewContext(
      previewFunctions + "\nupdatePreview(element, selects);",
      context,
    );
    render();
    expect(group.hidden).toBe(true);
    for (const label of ["Haspel", "Ring"]) {
      select.value = label;
      render();
      expect(group.hidden).toBe(false);
      expect(part.children[1].src).toBe(`${label}.png`);
    }
    select.value = "";
    render();
    expect(group.hidden).toBe(true);
    expect(part.hidden).toBe(true);
  });
});
