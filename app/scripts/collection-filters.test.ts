import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync(
  new URL("../../assets/component-collection-filters.js", import.meta.url),
  "utf8",
);

class TestNode {}

function setup(lang = "de") {
  const listeners = new Map<
    string,
    (event: { target: TestNode; key?: string }) => void
  >();
  const inside = new TestNode();
  const outside = new TestNode();
  const summary = { setAttribute: vi.fn(), focus: vi.fn() };
  const details = {
    open: true,
    contains: (target: TestNode) => target === inside,
    querySelector: () => summary,
  };
  let rendered = [details];
  const textNodes = [
    { nodeValue: " Surface " },
    { nodeValue: "Art des Schlags" },
    { nodeValue: "Mindestbruchkraft in kN" },
    { nodeValue: "HaWo - Seile" },
    { nodeValue: "Durchmesser" },
  ];
  let onMutation: () => void = () => {};
  const document = {
    documentElement: { lang },
    body: {},
    createTreeWalker: vi.fn(() => {
      let index = 0;
      return { nextNode: () => textNodes[index++] };
    }),
    addEventListener: vi.fn(
      (
        name: string,
        handler: (event: { target: TestNode; key?: string }) => void,
      ) => {
        listeners.set(name, handler);
      },
    ),
    querySelectorAll: vi.fn((selector: string) =>
      selector.includes("summary")
        ? [{}]
        : rendered.filter((entry) => entry.open),
    ),
  };
  const context = {
    window: { requestAnimationFrame: (callback: () => void) => callback() },
    document,
    Node: TestNode,
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class {
      constructor(callback: () => void) {
        onMutation = callback;
      }
      observe() {}
    },
  };
  runInNewContext(script, context);
  return {
    listeners,
    inside,
    outside,
    summary,
    details,
    document,
    context,
    textNodes,
    update: () => onMutation(),
    replace: () => {
      rendered = [{ ...details, open: true }];
      return rendered[0];
    },
  };
}

describe("collection filter disclosure interactions", () => {
  it("normalizes German captions without changing existing labels or filter values", () => {
    const state = setup();
    expect(state.textNodes.map((node) => node.nodeValue)).toEqual([
      " Oberfläche ",
      "Schlagart",
      "Mindestbruchkraft (kN)",
      "HaWo – Seile",
      "Durchmesser",
    ]);
    state.textNodes[0].nodeValue = "Surface";
    state.update();
    expect(state.textNodes[0].nodeValue).toBe("Oberfläche");
  });

  it("does not translate captions in other storefront languages", () => {
    const state = setup("en");
    expect(state.textNodes[0].nodeValue).toBe(" Surface ");
  });
  it("keeps checkbox and summary clicks inside the filter untouched", () => {
    const state = setup();
    state.listeners.get("click")!({ target: state.inside });
    expect(state.details.open).toBe(true);
    expect(state.summary.setAttribute).not.toHaveBeenCalled();
  });

  it("closes on outside click without moving focus or cancelling navigation", () => {
    const state = setup();
    state.listeners.get("click")!({ target: state.outside });
    expect(state.details.open).toBe(false);
    expect(state.summary.setAttribute).toHaveBeenCalledWith(
      "aria-expanded",
      "false",
    );
    expect(state.summary.focus).not.toHaveBeenCalled();
  });

  it("handles replacement markup after AJAX filtering", () => {
    const state = setup();
    const replacement = state.replace();
    state.listeners.get("click")!({ target: state.outside });
    expect(replacement.open).toBe(false);
    expect(state.details.open).toBe(true);
  });

  it("closes with Escape and returns focus to the filter caption", () => {
    const state = setup();
    state.listeners.get("keydown")!({ target: state.inside, key: "Enter" });
    expect(state.details.open).toBe(true);
    state.listeners.get("keydown")!({ target: state.inside, key: "Escape" });
    expect(state.details.open).toBe(false);
    expect(state.summary.focus).toHaveBeenCalledOnce();
  });

  it("does not register handlers twice", () => {
    const state = setup();
    runInNewContext(script, state.context);
    expect(state.document.addEventListener).toHaveBeenCalledTimes(2);
  });
});
