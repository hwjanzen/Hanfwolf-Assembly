import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getRopeConfiguratorConfig } from "../services/rope-configurator-setup.server";
import { loadConfigurationProduct } from "../services/rope-components.server";
import { ConfigurationInputError } from "../services/rope-configuration";

function formatHundredths(value: number) {
  return (Math.round(value / 10) / 10).toString();
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.public.appProxy(request);
  if (!session || !admin) {
    return Response.json(
      { ok: false, error: "App-Proxy-Sitzung fehlt." },
      { status: 401 },
    );
  }

  const config = await getRopeConfiguratorConfig(session.shop);
  const productId = new URL(request.url).searchParams.get("productId") || "";
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) {
    return Response.json(
      { ok: false, error: "Produkt-ID fehlt." },
      { status: 400 },
    );
  }
  try {
    const data = await loadConfigurationProduct(admin, productId, config);
    return Response.json(
      {
        ok: true,
        config: {
          minLengthMeters: formatHundredths(config.minLengthHundredths),
          maxLengthMeters: formatHundredths(config.maxLengthHundredths),
          defaultLengthMeters: formatHundredths(config.defaultLengthHundredths),
          minQuantity: config.minQuantity,
          maxQuantity: config.maxQuantity,
        },
        positions: data.positions.map((position) => ({
          ...position,
          options: data.mappings
            .filter((mapping) => mapping.positionId === position.id)
            .map((mapping) => ({
              id: mapping.id,
              label: mapping.label,
              image: data.componentImages.get(mapping.variantId) ?? null,
            })),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("Configurator options could not be loaded", error);
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Konfigurationsoptionen konnten nicht geladen werden.",
      },
      {
        status: error instanceof ConfigurationInputError ? 400 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
};
