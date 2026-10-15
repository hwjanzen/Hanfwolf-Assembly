import { adminGraphql, type GraphqlResult } from "./shopify-graphql.server";

const STANDARD_POSITIONS = [
  { code: "end_1", label: "Endverbindung 1", sortOrder: 10 },
  { code: "end_2", label: "Endverbindung 2", sortOrder: 20 },
  { code: "presentation", label: "Aufmachung", sortOrder: 30 },
] as const;

export const POSITION_LIST_QUERY = `#graphql
  query StandardConfigurationPositions($after: String) {
    metaobjects(type: "$app:configuration_position", first: 100, after: $after) {
      nodes { handle code: field(key: "code") { value } }
      pageInfo { hasNextPage endCursor }
    }
  }`;

export const POSITION_UPSERT_MUTATION = `#graphql
  mutation InitializeConfigurationPosition($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject { id }
      userErrors { field message }
    }
  }`;

export async function initializeRopePositions(admin: unknown) {
  const entries: Array<{ handle: string; code: { value: string } | null }> = [];
  let after: string | null = null;
  do {
    const result: GraphqlResult<{
      metaobjects: {
        nodes: typeof entries;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    }> = await adminGraphql(admin, POSITION_LIST_QUERY, { after });
    if (!result.ok)
      throw new Error(
        `Positionen konnten nicht geladen werden: ${result.errors.join(" | ")}`,
      );
    entries.push(...result.data.metaobjects.nodes);
    const page: { hasNextPage: boolean; endCursor: string | null } =
      result.data.metaobjects.pageInfo;
    if (page.hasNextPage && (!page.endCursor || page.endCursor === after)) {
      throw new Error("Positionen konnten nicht vollstaendig geladen werden.");
    }
    after = page.hasNextPage ? page.endCursor : null;
  } while (after);

  for (const position of STANDARD_POSITIONS) {
    if (
      entries.filter((entry) => entry.code?.value === position.code).length > 1
    ) {
      throw new Error(
        `Code ${position.code} ist mehrfach vorhanden. Bitte doppelte Positionen zuerst bereinigen.`,
      );
    }
    if (
      !entries.some((entry) => entry.code?.value === position.code) &&
      entries.some(
        (entry) => entry.handle === position.code.replaceAll("_", "-"),
      )
    ) {
      throw new Error(
        `Der Handle fuer ${position.code} ist bereits mit einem anderen Code belegt.`,
      );
    }
  }

  let created = 0;
  for (const position of STANDARD_POSITIONS) {
    if (entries.some((entry) => entry.code?.value === position.code)) continue;
    const result = await adminGraphql<{
      metaobjectUpsert: {
        metaobject: { id: string } | null;
        userErrors: Array<{ field: string[] | null; message: string }>;
      };
    }>(admin, POSITION_UPSERT_MUTATION, {
      handle: {
        type: "$app:configuration_position",
        handle: position.code.replaceAll("_", "-"),
      },
      metaobject: {
        fields: [
          { key: "code", value: position.code },
          { key: "label", value: position.label },
          { key: "required", value: "false" },
          { key: "sort_order", value: String(position.sortOrder) },
          { key: "active", value: "true" },
        ],
      },
    });
    if (!result.ok)
      throw new Error(
        `Position ${position.code} konnte nicht angelegt werden: ${result.errors.join(" | ")}`,
      );
    const payload = result.data.metaobjectUpsert;
    if (payload.userErrors.length || !payload.metaobject) {
      throw new Error(
        `Position ${position.code}: ${payload.userErrors.map((error) => error.message).join("; ") || "Shopify hat keinen Eintrag bestaetigt."}`,
      );
    }
    created += 1;
  }
  return { created, reused: STANDARD_POSITIONS.length - created };
}
