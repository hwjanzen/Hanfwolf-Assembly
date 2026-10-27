import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getRopeConfiguratorConfig } from "../services/rope-configurator-setup.server";
import {
  ConfigurationInputError,
  normalizeConfigurationInput,
} from "../services/rope-configuration";
import {
  getConfigurationStatus,
  prepareConfiguration,
} from "../services/rope-variant.server";

function failure(error: unknown) {
  if (error instanceof Response) throw error;
  console.error("Configuration proxy request failed", error);
  return Response.json(
    {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Konfiguration konnte nicht vorbereitet werden.",
    },
    {
      status: error instanceof ConfigurationInputError ? 400 : 502,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    if (!admin || !session)
      return Response.json(
        { ok: false, error: "App-Proxy-Sitzung fehlt." },
        { status: 401 },
      );
    const config = await getRopeConfiguratorConfig(session.shop);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ConfigurationInputError("Ungültige JSON-Anfrage.");
    }
    const input = normalizeConfigurationInput(body, config);
    const url = new URL(request.url);
    const customerId = url.searchParams.get("logged_in_customer_id");
    return Response.json(
      await prepareConfiguration(
        admin,
        session.shop,
        input,
        config,
        customerId,
      ),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return failure(error);
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);
    if (!admin || !session)
      return Response.json(
        { ok: false, error: "App-Proxy-Sitzung fehlt." },
        { status: 401 },
      );
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new ConfigurationInputError("Ungültige Konfigurations-ID.");
    return Response.json(
      await getConfigurationStatus(admin, session.shop, id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
};
