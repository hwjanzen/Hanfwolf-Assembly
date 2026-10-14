import { adminGraphql } from "./shopify-graphql.server";

const PRICE_LIST_HEADER_TYPE = "price_list_header";
const PRICE_LIST_LINE_TYPE = "price_list_line";
const ROPE_DEFAULT_CONFIGURATION_KEY = "is_default_configuration";
const ROPE_DEFAULT_CONFIGURATION_NAMESPACE = "$app";

type UserError = {
  field?: string[];
  message: string;
  code?: string;
};

type BootstrapStatus = "created" | "exists";

type SurfaceDefinitionsResult = {
  metaobject: BootstrapStatus;
  productMetafield: BootstrapStatus;
};

export type BootstrapResult = {
  headerDefinition: BootstrapStatus;
  lineDefinition: BootstrapStatus;
  companyMetafieldDefinition: BootstrapStatus;
  ropeDefaultConfigurationMetafield: BootstrapStatus;
};

type EnsureDefinitionResult = {
  status: BootstrapStatus;
  id: string;
};

function assertNoUserErrors(userErrors: UserError[] | undefined, context: string) {
  if (!userErrors?.length) return;

  const details = userErrors
    .map((error) => {
      const field = error.field?.length ? `${error.field.join(".")}: ` : "";
      const code = error.code ? `[${error.code}] ` : "";
      return `${field}${code}${error.message}`;
    })
    .join("; ");

  throw new Error(`${context}: ${details}`);
}

async function getMetaobjectDefinitionByType(admin: any, type: string) {
  const result = await adminGraphql<{
    metaobjectDefinitionByType: { id: string } | null;
  }>(
    admin,
    `#graphql
    query BootstrapMetaobjectDefinitionByType($type: String!) {
      metaobjectDefinitionByType(type: $type) {
        id
      }
    }`,

    { type },
  );

  if (!result.ok) {
    throw new Error(
      `Failed to read metaobject definition \"${type}\": ${result.errors.join(" | ")}`,
    );
  }

  return result.data.metaobjectDefinitionByType;
}

async function ensurePriceListHeaderDefinition(
  admin: any,
): Promise<EnsureDefinitionResult> {
  const existing = await getMetaobjectDefinitionByType(admin, PRICE_LIST_HEADER_TYPE);
  if (existing?.id) {
    return { status: "exists", id: existing.id };
  }

  const createResult = await adminGraphql<{
    metaobjectDefinitionCreate: {
      metaobjectDefinition: { id: string } | null;
      userErrors: UserError[];
    };
  }>(
    admin,
    `#graphql
    mutation BootstrapCreatePriceListHeaderDefinition($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition {
          id
        }
        userErrors {
          field
          message
          code
        }
      }
    }`,
    {
      definition: {
        name: "Price List Header",
        type: PRICE_LIST_HEADER_TYPE,
        displayNameKey: "name",
        fieldDefinitions: [
          {
            key: "name",
            name: "Name",
            type: "single_line_text_field",
            required: true,
          },
          {
            key: "valid_from",
            name: "Valid From",
            type: "date",
          },
          {
            key: "valid_to",
            name: "Valid To",
            type: "date",
          },
        ],
      },
    },
  );

  if (!createResult.ok) {
    throw new Error(
      `Failed to create metaobject definition \"${PRICE_LIST_HEADER_TYPE}\": ${createResult.errors.join(" | ")}`,
    );
  }

  assertNoUserErrors(
    createResult.data.metaobjectDefinitionCreate.userErrors,
    `Failed to create metaobject definition \"${PRICE_LIST_HEADER_TYPE}\"`,
  );

  if (!createResult.data.metaobjectDefinitionCreate.metaobjectDefinition?.id) {
    throw new Error(
      `Create metaobject definition \"${PRICE_LIST_HEADER_TYPE}\" returned no id.`,
    );
  }

  return {
    status: "created",
    id: createResult.data.metaobjectDefinitionCreate.metaobjectDefinition.id,
  };
}

async function ensurePriceListLineDefinition(
  admin: any,
  headerDefinitionId: string,
): Promise<BootstrapStatus> {
  const existing = await getMetaobjectDefinitionByType(admin, PRICE_LIST_LINE_TYPE);
  if (existing?.id) return "exists";

  const createResult = await adminGraphql<{
    metaobjectDefinitionCreate: {
      metaobjectDefinition: { id: string } | null;
      userErrors: UserError[];
    };
  }>(
    admin,
    `#graphql
    mutation BootstrapCreatePriceListLineDefinition($definition: MetaobjectDefinitionCreateInput!) {
      metaobjectDefinitionCreate(definition: $definition) {
        metaobjectDefinition {
          id
        }
        userErrors {
          field
          message
          code
        }
      }
    }`,
    {
      definition: {
        name: "Price List Line",
        type: PRICE_LIST_LINE_TYPE,
        fieldDefinitions: [
          {
            key: "price_list_header",
            name: "Price List Header",
            type: "metaobject_reference",
            required: true,
            validations: [
              {
                name: "metaobject_definition_id",
                value: headerDefinitionId,
              },
            ],
          },
          {
            key: "product",
            name: "Product",
            type: "product_reference",
          },
          {
            key: "variant",
            name: "Variant",
            type: "variant_reference",
          },
          {
            key: "quantity",
            name: "Quantity",
            type: "number_integer",
            required: true,
          },
          {
            key: "unit_price",
            name: "Unit Price",
            type: "number_decimal",
            required: true,
          },
        ],
      },
    },
  );

  if (!createResult.ok) {
    throw new Error(
      `Failed to create metaobject definition \"${PRICE_LIST_LINE_TYPE}\": ${createResult.errors.join(" | ")}`,
    );
  }

  assertNoUserErrors(
    createResult.data.metaobjectDefinitionCreate.userErrors,
    `Failed to create metaobject definition \"${PRICE_LIST_LINE_TYPE}\"`,
  );

  if (!createResult.data.metaobjectDefinitionCreate.metaobjectDefinition?.id) {
    throw new Error(
      `Create metaobject definition \"${PRICE_LIST_LINE_TYPE}\" returned no id.`,
    );
  }

  return "created";
}

async function ensureCompanyPriceListMetafieldDefinition(
  admin: any,
  headerDefinitionId: string,
): Promise<BootstrapStatus> {
  const existingResult = await adminGraphql<{
    metafieldDefinitions: {
      nodes: Array<{ id: string }>;
    };
  }>(
    admin,
    `#graphql
    query BootstrapCompanyPriceListMetafieldDefinition {
      metafieldDefinitions(
        first: 1
        ownerType: COMPANY
        namespace: "custom"
        key: "price_list"
      ) {
        nodes {
          id
        }
      }
    }`,
  );

  if (!existingResult.ok) {
    throw new Error(
      `Failed to read company metafield definition custom.price_list: ${existingResult.errors.join(" | ")}`,
    );
  }

  if (existingResult.data.metafieldDefinitions.nodes.length > 0) return "exists";

  const createWithValidation = await adminGraphql<{
    metafieldDefinitionCreate: {
      createdDefinition: { id: string } | null;
      userErrors: UserError[];
    };
  }>(
    admin,
    `#graphql
    mutation BootstrapCreateCompanyPriceListMetafield($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
        }
        userErrors {
          field
          message
          code
        }
      }
    }`,
    {
      definition: {
        name: "Price List",
        namespace: "custom",
        key: "price_list",
        ownerType: "COMPANY",
        type: "metaobject_reference",
        validations: [
          {
            name: "metaobject_definition_id",
            value: headerDefinitionId,
          },
        ],
      },
    },
  );

  if (!createWithValidation.ok) {
    throw new Error(
      `Failed to create company metafield definition custom.price_list: ${createWithValidation.errors.join(" | ")}`,
    );
  }

  assertNoUserErrors(
    createWithValidation.data.metafieldDefinitionCreate.userErrors,
    "Failed to create company metafield definition custom.price_list",
  );

  if (!createWithValidation.data.metafieldDefinitionCreate.createdDefinition?.id) {
    throw new Error(
      "Create company metafield definition custom.price_list returned no id.",
    );
  }

  return "created";
}

export async function ensureRopeDefaultConfigurationMetafieldDefinition(
  admin: any,
): Promise<BootstrapStatus> {
  const existingResult = await adminGraphql<{
    metafieldDefinitions: {
      nodes: Array<{ id: string; type: { name: string } }>;
    };
  }>(
    admin,
    `#graphql
    query BootstrapRopeDefaultConfigurationMetafieldDefinition {
      metafieldDefinitions(
        first: 1
        ownerType: PRODUCTVARIANT
        namespace: "$app"
        key: "is_default_configuration"
      ) {
        nodes {
          id
          type {
            name
          }
        }
      }
    }`,
  );

  if (!existingResult.ok) {
    throw new Error(
      `Failed to read variant metafield definition $app.${ROPE_DEFAULT_CONFIGURATION_KEY}: ${existingResult.errors.join(" | ")}`,
    );
  }

  const existing = existingResult.data.metafieldDefinitions.nodes[0];
  if (existing) {
    if (existing.type.name !== "boolean") {
      throw new Error(
        `Variant metafield $app.${ROPE_DEFAULT_CONFIGURATION_KEY} exists with type ${existing.type.name}; expected boolean.`,
      );
    }
    return "exists";
  }

  const createResult = await adminGraphql<{
    metafieldDefinitionCreate: {
      createdDefinition: { id: string } | null;
      userErrors: UserError[];
    };
  }>(
    admin,
    `#graphql
    mutation BootstrapCreateRopeDefaultConfigurationMetafield($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition {
          id
        }
        userErrors {
          field
          message
          code
        }
      }
    }`,
    {
      definition: {
        name: "Default rope configuration",
        namespace: ROPE_DEFAULT_CONFIGURATION_NAMESPACE,
        key: ROPE_DEFAULT_CONFIGURATION_KEY,
        ownerType: "PRODUCTVARIANT",
        type: "boolean",
        access: {
          admin: "MERCHANT_READ_WRITE",
        },
      },
    },
  );

  if (!createResult.ok) {
    throw new Error(
      `Failed to create variant metafield definition $app.${ROPE_DEFAULT_CONFIGURATION_KEY}: ${createResult.errors.join(" | ")}`,
    );
  }

  assertNoUserErrors(
    createResult.data.metafieldDefinitionCreate.userErrors,
    `Failed to create variant metafield definition $app.${ROPE_DEFAULT_CONFIGURATION_KEY}`,
  );

  if (!createResult.data.metafieldDefinitionCreate.createdDefinition?.id) {
    throw new Error(
      `Create variant metafield definition $app.${ROPE_DEFAULT_CONFIGURATION_KEY} returned no id.`,
    );
  }

  return "created";
}

export async function ensureSurfaceDefinitions(
  admin: unknown,
): Promise<SurfaceDefinitionsResult> {
  const existingResult = await adminGraphql<{
    metaobjectDefinitionByType: {
      id: string;
      displayNameKey: string | null;
      access: { storefront: string };
      fieldDefinitions: Array<{ key: string; type: { name: string }; required: boolean }>;
    } | null;
    metafieldDefinitions: {
      nodes: Array<{
        type: { name: string };
        access: { storefront: string };
        validations: Array<{ name: string; value: string }>;
      }>;
    };
  }>(
    admin,
    `#graphql
    query BootstrapSurfaceDefinitions {
      metaobjectDefinitionByType(type: "enattoberflaeche") {
        id
        displayNameKey
        access { storefront }
        fieldDefinitions { key type { name } required }
      }
      metafieldDefinitions(
        first: 1
        ownerType: PRODUCT
        namespace: "custom"
        key: "oberflaeche"
      ) {
        nodes {
          type { name }
          access { storefront }
          validations { name value }
        }
      }
    }`,
  );
  if (!existingResult.ok) {
    throw new Error(`Failed to read surface definitions: ${existingResult.errors.join(" | ")}`);
  }

  const existingMetaobject = existingResult.data.metaobjectDefinitionByType;
  const existingMetafield = existingResult.data.metafieldDefinitions.nodes[0];
  if (existingMetaobject) {
    const valueField = existingMetaobject.fieldDefinitions.find((field) => field.key === "value");
    if (
      valueField?.type.name !== "single_line_text_field" ||
      valueField.required ||
      existingMetaobject.displayNameKey !== "value" ||
      existingMetaobject.access.storefront !== "PUBLIC_READ"
    ) {
      throw new Error(
        "Metaobject enattoberflaeche exists with an incompatible definition. Expected optional single-line text field value, display name value and PUBLIC_READ storefront access. No existing definition was changed.",
      );
    }
  }
  if (
    existingMetafield &&
    (
      !existingMetaobject ||
      existingMetafield.type.name !== "metaobject_reference" ||
      existingMetafield.access.storefront !== "PUBLIC_READ" ||
      !existingMetafield.validations.some(
        (validation) =>
          validation.name === "metaobject_definition_id" &&
          validation.value === existingMetaobject.id,
      )
    )
  ) {
    throw new Error(
      "Product metafield custom.oberflaeche exists with an incompatible definition. Expected a single reference to enattoberflaeche with PUBLIC_READ storefront access. No existing definition was changed.",
    );
  }

  let metaobjectId = existingMetaobject?.id;
  if (!metaobjectId) {
    const result = await adminGraphql<{
      metaobjectDefinitionCreate: {
        metaobjectDefinition: { id: string } | null;
        userErrors: UserError[];
      };
    }>(
      admin,
      `#graphql
      mutation BootstrapCreateSurfaceMetaobject($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition { id }
          userErrors { field message code }
        }
      }`,
      {
        definition: {
          name: "enAttOberfläche",
          type: "enattoberflaeche",
          description: "Oberfläche",
          displayNameKey: "value",
          access: { storefront: "PUBLIC_READ" },
          fieldDefinitions: [
            { key: "value", name: "Value", type: "single_line_text_field", required: false },
          ],
        },
      },
    );
    if (!result.ok) {
      throw new Error(`Failed to create enattoberflaeche: ${result.errors.join(" | ")}`);
    }
    assertNoUserErrors(result.data.metaobjectDefinitionCreate.userErrors, "Create enattoberflaeche");
    metaobjectId = result.data.metaobjectDefinitionCreate.metaobjectDefinition?.id;
    if (!metaobjectId) throw new Error("Create enattoberflaeche returned no id.");
  }

  if (!existingMetafield) {
    const result = await adminGraphql<{
      metafieldDefinitionCreate: {
        createdDefinition: { id: string } | null;
        userErrors: UserError[];
      };
    }>(
      admin,
      `#graphql
      mutation BootstrapCreateSurfaceProductMetafield($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id }
          userErrors { field message code }
        }
      }`,
      {
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
    );
    if (!result.ok) {
      throw new Error(`Failed to create custom.oberflaeche: ${result.errors.join(" | ")}`);
    }
    assertNoUserErrors(result.data.metafieldDefinitionCreate.userErrors, "Create custom.oberflaeche");
    if (!result.data.metafieldDefinitionCreate.createdDefinition?.id) {
      throw new Error("Create custom.oberflaeche returned no id.");
    }
  }
  return {
    metaobject: existingMetaobject ? "exists" : "created",
    productMetafield: existingMetafield ? "exists" : "created",
  };
}

export async function ensurePricingBootstrap(admin: any): Promise<BootstrapResult> {
  const headerDefinition = await ensurePriceListHeaderDefinition(admin);
  const lineDefinition = await ensurePriceListLineDefinition(admin, headerDefinition.id);
  const companyMetafieldDefinition = await ensureCompanyPriceListMetafieldDefinition(
    admin,
    headerDefinition.id,
  );
  const ropeDefaultConfigurationMetafield =
    await ensureRopeDefaultConfigurationMetafieldDefinition(admin);

  return {
    headerDefinition: headerDefinition.status,
    lineDefinition,
    companyMetafieldDefinition,
    ropeDefaultConfigurationMetafield,
  };
}
