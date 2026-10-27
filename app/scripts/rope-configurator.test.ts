import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const script = readFileSync(new URL("./rope-configurator.js", import.meta.url), "utf8");
const template = readFileSync(
  new URL("../../sections/seile.liquid", import.meta.url),
  "utf8",
);

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
