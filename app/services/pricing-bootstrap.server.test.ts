import { describe, expect, it, vi } from "vitest";
import { ensureSurfaceDefinitions } from "./pricing-bootstrap.server";

const metaobjectId = "gid://shopify/MetaobjectDefinition/123";

function existingDefinitions() {
  return {
    metaobjectDefinitionByType: {
      id: metaobjectId,
      displayNameKey: "value",
      access: { storefront: "PUBLIC_READ" },
      fieldDefinitions: [
        { key: "value", type: { name: "single_line_text_field" }, required: false },
      ],
    },
    metafieldDefinitions: {
      nodes: [{
        type: { name: "metaobject_reference" },
        access: { storefront: "PUBLIC_READ" },
        validations: [{ name: "metaobject_definition_id", value: metaobjectId }],
      }],
    },
  };
}

function mockAdmin(...responses: unknown[]) {
  const graphql = vi.fn();
  for (const response of responses) {
    graphql.mockResolvedValueOnce(new Response(JSON.stringify(response)));
  }
  return { graphql };
}

const createdMetaobject = {
  metaobjectDefinitionCreate: {
    metaobjectDefinition: { id: metaobjectId },
    userErrors: [],
  },
};
const createdMetafield = {
  metafieldDefinitionCreate: {
    createdDefinition: { id: "gid://shopify/MetafieldDefinition/456" },
    userErrors: [],
  },
};

describe("surface definition bootstrap", () => {
  it("creates only the agreed definitions, in reference dependency order", async () => {
    const admin = mockAdmin(
      { data: { metaobjectDefinitionByType: null, metafieldDefinitions: { nodes: [] } } },
      { data: createdMetaobject },
      { data: createdMetafield },
    );

    await expect(ensureSurfaceDefinitions(admin)).resolves.toEqual({
      metaobject: "created", productMetafield: "created",
    });
    expect(admin.graphql).toHaveBeenCalledTimes(3);
    expect(admin.graphql.mock.calls[0][0]).toContain("query BootstrapSurfaceDefinitions");
    expect(admin.graphql.mock.calls[1][0]).toContain("mutation BootstrapCreateSurfaceMetaobject");
    expect(admin.graphql.mock.calls[1][1]).toEqual({
      variables: {
        definition: {
          name: "enAttOberfläche",
          type: "enattoberflaeche",
          description: "Oberfläche",
          displayNameKey: "value",
          access: { storefront: "PUBLIC_READ" },
          fieldDefinitions: [{
            key: "value", name: "Value", type: "single_line_text_field", required: false,
          }],
        },
      },
    });
    expect(admin.graphql.mock.calls[2][0]).toContain("mutation BootstrapCreateSurfaceProductMetafield");
    expect(admin.graphql.mock.calls[2][1]).toEqual({
      variables: {
        definition: {
          name: "Oberfläche",
          namespace: "custom",
          key: "oberflaeche",
          ownerType: "PRODUCT",
          type: "metaobject_reference",
          access: { storefront: "PUBLIC_READ" },
          validations: [{ name: "metaobject_definition_id", value: metaobjectId }],
        },
      },
    });
    for (const [query] of admin.graphql.mock.calls) {
      expect(query).not.toMatch(/metaobjectCreate|metaobjectUpsert|metafieldsSet|DefinitionUpdate|DefinitionDelete/);
      expect(query).not.toContain('"oberflache"');
    }
  });

  it("reuses compatible definitions on repeated app loads without writing", async () => {
    const admin = mockAdmin(
      { data: existingDefinitions() },
      { data: existingDefinitions() },
    );
    for (let run = 0; run < 2; run++) {
      await expect(ensureSurfaceDefinitions(admin)).resolves.toEqual({
        metaobject: "exists", productMetafield: "exists",
      });
    }
    expect(admin.graphql).toHaveBeenCalledTimes(2);
  });

  it("resumes after metaobject creation when the product definition is still missing", async () => {
    const existing = existingDefinitions();
    existing.metafieldDefinitions.nodes = [];
    const admin = mockAdmin({ data: existing }, { data: createdMetafield });
    await expect(ensureSurfaceDefinitions(admin)).resolves.toEqual({
      metaobject: "exists", productMetafield: "created",
    });
    expect(admin.graphql).toHaveBeenCalledTimes(2);
    expect(admin.graphql.mock.calls[1][1].variables.definition.validations[0].value)
      .toBe(metaobjectId);
  });

  it.each(["type", "key", "required", "displayNameKey", "access"])(
    "rejects incompatible metaobject %s without writing",
    async (conflict) => {
      const existing = existingDefinitions();
      const definition = existing.metaobjectDefinitionByType;
      if (conflict === "type") definition.fieldDefinitions[0].type.name = "number_decimal";
      if (conflict === "key") definition.fieldDefinitions[0].key = "different";
      if (conflict === "required") definition.fieldDefinitions[0].required = true;
      if (conflict === "displayNameKey") definition.displayNameKey = "different";
      if (conflict === "access") definition.access.storefront = "NONE";
      const admin = mockAdmin({ data: existing });
      await expect(ensureSurfaceDefinitions(admin)).rejects.toThrow("enattoberflaeche exists with an incompatible");
      expect(admin.graphql).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["type", "target", "validation", "access", "missing metaobject"])(
    "rejects incompatible product metafield %s without writing",
    async (conflict) => {
      const existing = existingDefinitions();
      const definition = existing.metafieldDefinitions.nodes[0];
      if (conflict === "type") definition.type.name = "list.metaobject_reference";
      if (conflict === "target") definition.validations[0].value = "gid://shopify/MetaobjectDefinition/999";
      if (conflict === "validation") definition.validations = [];
      if (conflict === "access") definition.access.storefront = "NONE";
      const admin = mockAdmin({
        data: {
          ...existing,
          metaobjectDefinitionByType: conflict === "missing metaobject"
            ? null : existing.metaobjectDefinitionByType,
        },
      });
      await expect(ensureSurfaceDefinitions(admin)).rejects.toThrow("custom.oberflaeche exists with an incompatible");
      expect(admin.graphql).toHaveBeenCalledTimes(1);
    },
  );

  it("propagates lookup GraphQL errors", async () => {
    const admin = mockAdmin({ errors: [{ message: "Access denied" }] });
    await expect(ensureSurfaceDefinitions(admin)).rejects.toThrow("Access denied");
    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });

  it("propagates network errors", async () => {
    const admin = { graphql: vi.fn().mockRejectedValue(new Error("Connection failed")) };
    await expect(ensureSurfaceDefinitions(admin)).rejects.toThrow("Connection failed");
  });

  it.each(["metaobject", "metafield"])("propagates %s creation GraphQL errors", async (step) => {
    const existing = existingDefinitions();
    const admin = mockAdmin(
      { data: {
        metaobjectDefinitionByType: step === "metafield" ? existing.metaobjectDefinitionByType : null,
        metafieldDefinitions: { nodes: [] },
      } },
      { errors: [{ message: "Creation denied" }] },
    );
    await expect(ensureSurfaceDefinitions(admin)).rejects.toThrow("Creation denied");
    expect(admin.graphql).toHaveBeenCalledTimes(2);
  });

  it.each(["metaobject", "metafield"])("propagates %s creation user errors", async (step) => {
    const existing = existingDefinitions();
    const admin = mockAdmin(
      { data: {
        metaobjectDefinitionByType: step === "metafield" ? existing.metaobjectDefinitionByType : null,
        metafieldDefinitions: { nodes: [] },
      } },
      { data: step === "metaobject"
        ? { metaobjectDefinitionCreate: { metaobjectDefinition: null, userErrors: [{
          field: ["definition", "type"], code: "TAKEN", message: "Already taken",
        }] } }
        : { metafieldDefinitionCreate: { createdDefinition: null, userErrors: [{
          field: ["definition", "key"], code: "TAKEN", message: "Already taken",
        }] } },
      },
    );
    await expect(ensureSurfaceDefinitions(admin)).rejects.toThrow("[TAKEN] Already taken");
    expect(admin.graphql).toHaveBeenCalledTimes(2);
  });

  it.each(["metaobject", "metafield"])("rejects %s creation without a returned id", async (step) => {
    const existing = existingDefinitions();
    const admin = mockAdmin(
      { data: {
        metaobjectDefinitionByType: step === "metafield" ? existing.metaobjectDefinitionByType : null,
        metafieldDefinitions: { nodes: [] },
      } },
      { data: step === "metaobject"
        ? { metaobjectDefinitionCreate: { metaobjectDefinition: null, userErrors: [] } }
        : { metafieldDefinitionCreate: { createdDefinition: null, userErrors: [] } },
      },
    );
    await expect(ensureSurfaceDefinitions(admin)).rejects.toThrow("returned no id");
    expect(admin.graphql).toHaveBeenCalledTimes(2);
  });
});
