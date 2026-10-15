import { beforeEach, describe, expect, it, vi } from "vitest";

const graphql = vi.hoisted(() => vi.fn());
vi.mock("./shopify-graphql.server", () => ({ adminGraphql: graphql }));
import { initializeRopePositions } from "./rope-position-init.server";

function page(
  nodes: Array<{ handle: string; code: { value: string } | null }>,
  hasNextPage = false,
  endCursor: string | null = null,
) {
  return {
    ok: true,
    data: { metaobjects: { nodes, pageInfo: { hasNextPage, endCursor } } },
  };
}
const success = {
  ok: true,
  data: {
    metaobjectUpsert: {
      metaobject: { id: "gid://shopify/Metaobject/1" },
      userErrors: [],
    },
  },
};
beforeEach(() => vi.resetAllMocks());

describe("standard position initialization", () => {
  it("creates three optional active positions with fixed codes", async () => {
    graphql.mockResolvedValueOnce(page([])).mockResolvedValue(success);
    expect(await initializeRopePositions({})).toEqual({
      created: 3,
      reused: 0,
    });
    const variables = graphql.mock.calls.slice(1).map((call) => call[2]);
    expect(variables.map((value) => value.metaobject.fields[0].value)).toEqual([
      "end_1",
      "end_2",
      "presentation",
    ]);
    expect(variables[0]).toMatchObject({
      handle: { type: "$app:configuration_position", handle: "end-1" },
      metaobject: {
        fields: [
          { key: "code", value: "end_1" },
          { key: "label", value: "Endverbindung 1" },
          { key: "required", value: "false" },
          { key: "sort_order", value: "10" },
          { key: "active", value: "true" },
        ],
      },
    });
  });

  it("reuses existing codes across pages and does not overwrite merchant entries", async () => {
    graphql
      .mockResolvedValueOnce(
        page(
          [{ handle: "custom-one", code: { value: "end_1" } }],
          true,
          "next",
        ),
      )
      .mockResolvedValueOnce(
        page([
          { handle: "custom-two", code: { value: "end_2" } },
          { handle: "custom-three", code: { value: "presentation" } },
        ]),
      );
    expect(await initializeRopePositions({})).toEqual({
      created: 0,
      reused: 3,
    });
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(graphql.mock.calls[1][2]).toEqual({ after: "next" });
  });

  it("fills only missing positions", async () => {
    graphql
      .mockResolvedValueOnce(
        page([{ handle: "existing", code: { value: "end_1" } }]),
      )
      .mockResolvedValue(success);
    expect(await initializeRopePositions({})).toEqual({
      created: 2,
      reused: 1,
    });
    expect(graphql).toHaveBeenCalledTimes(3);
  });

  it("rejects duplicate codes and handle collisions before writing", async () => {
    graphql.mockResolvedValueOnce(
      page([
        { handle: "a", code: { value: "end_1" } },
        { handle: "b", code: { value: "end_1" } },
      ]),
    );
    await expect(initializeRopePositions({})).rejects.toThrow("mehrfach");
    expect(graphql).toHaveBeenCalledTimes(1);
    graphql.mockResolvedValueOnce(page([{ handle: "end-1", code: null }]));
    await expect(initializeRopePositions({})).rejects.toThrow("Handle");
    expect(graphql).toHaveBeenCalledTimes(2);
  });

  it("surfaces missing definitions, access errors and mutation errors", async () => {
    graphql.mockResolvedValueOnce({ ok: false, errors: ["Access denied"] });
    await expect(initializeRopePositions({})).rejects.toThrow("Access denied");
    graphql.mockResolvedValueOnce(page([])).mockResolvedValueOnce({
      ok: true,
      data: {
        metaobjectUpsert: {
          metaobject: null,
          userErrors: [{ field: ["type"], message: "Definition not found" }],
        },
      },
    });
    await expect(initializeRopePositions({})).rejects.toThrow(
      "Definition not found",
    );
  });
});
