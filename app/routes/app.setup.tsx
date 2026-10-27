import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  getRopeConfiguratorConfig,
  saveRopeConfiguratorSetup,
} from "../services/rope-configurator-setup.server";
import { adminGraphql } from "../services/shopify-graphql.server";
import { initializeRopePositions } from "../services/rope-position-init.server";

const AUTO_PRODUCT_TYPE = "__none__";

async function loadProductTypes(admin: unknown) {
  const result = await adminGraphql<{
    productTypes: { nodes: string[] };
  }>(
    admin,
    `#graphql
    query RopeConfiguratorProductTypes {
      productTypes(first: 250) {
        nodes
      }
    }`,
  );

  if (!result.ok) {
    throw new Error(result.errors.join(" | "));
  }

  return result.data.productTypes.nodes
    .map((productType) => productType.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "de"));
}

function parseScaledDecimal(
  value: FormDataEntryValue | null,
  decimals: number,
  label: string,
) {
  const normalized = String(value || "")
    .trim()
    .replace(",", ".");
  const match = normalized.match(
    new RegExp(`^(\\d+)(?:\\.(\\d{1,${decimals}}))?$`),
  );
  if (!match) throw new Error(`${label} ist ungültig.`);
  const result =
    Number(match[1]) * 10 ** decimals +
    Number((match[2] || "").padEnd(decimals, "0"));
  if (!Number.isSafeInteger(result)) throw new Error(`${label} ist zu groß.`);
  return result;
}

function formatScaledDecimal(value: number, decimals: number) {
  return (
    (value / 10 ** decimals).toFixed(decimals).replace(/\.?0+$/, "") || "0"
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [productTypes, config] = await Promise.all([
    loadProductTypes(admin),
    getRopeConfiguratorConfig(session.shop),
  ]);

  return { productTypes, config };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  try {
    if (formData.get("intent") === "initialize-positions") {
      const result = await initializeRopePositions(admin);
      return {
        ok: true,
        message: `${result.created} Standardpositionen angelegt, ${result.reused} vorhandene beibehalten.`,
      };
    }
    const [productTypes, config] = await Promise.all([
      loadProductTypes(admin),
      getRopeConfiguratorConfig(session.shop),
    ]);
    const submittedProductType = String(
      formData.get("ropeProductType") || "",
    ).trim();
    const ropeProductType =
      !submittedProductType || submittedProductType === AUTO_PRODUCT_TYPE
        ? null
        : (productTypes.find(
            (productType) => productType === submittedProductType,
          ) ?? null);
    if (
      submittedProductType &&
      submittedProductType !== AUTO_PRODUCT_TYPE &&
      !ropeProductType
    ) {
      throw new Error(
        "Seil-Produkttyp: Der ausgewählte Produkttyp ist nicht mehr verfügbar. Bitte die Seite neu laden.",
      );
    }

    const minLengthHundredths =
      parseScaledDecimal(formData.get("minLengthMeters"), 1, "Minimale Länge") *
      10;
    const maxLengthHundredths =
      parseScaledDecimal(formData.get("maxLengthMeters"), 1, "Maximale Länge") *
      10;
    const defaultLengthHundredths =
      parseScaledDecimal(
        formData.get("defaultLengthMeters"),
        1,
        "Vorgabelänge",
      ) * 10;
    if (
      minLengthHundredths <= 0 ||
      maxLengthHundredths < minLengthHundredths ||
      maxLengthHundredths > 2_147_483_647
    ) {
      throw new Error("Der Längenbereich ist ungültig.");
    }
    if (
      defaultLengthHundredths < minLengthHundredths ||
      defaultLengthHundredths > maxLengthHundredths
    ) {
      throw new Error(
        "Die Vorgabelänge muss innerhalb des Längenbereichs liegen.",
      );
    }
    const minQuantity = Number(formData.get("minQuantity"));
    const maxQuantity = Number(formData.get("maxQuantity"));
    if (
      !Number.isSafeInteger(minQuantity) ||
      !Number.isSafeInteger(maxQuantity) ||
      minQuantity < 1 ||
      maxQuantity < minQuantity ||
      maxQuantity > 999
    )
      throw new Error("Die Stückzahlgrenzen müssen zwischen 1 und 999 liegen.");
    await saveRopeConfiguratorSetup(session.shop, {
      ...config,
      minLengthHundredths,
      maxLengthHundredths,
      defaultLengthHundredths,
      minQuantity,
      maxQuantity,
      ropeProductType,
    });

    return { ok: true, message: "Setup wurde gespeichert." };
  } catch (error) {
    console.error("Rope configurator setup failed", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Setup konnte nicht gespeichert werden.",
    };
  }
};

export default function RopeConfiguratorSetupPage() {
  const { productTypes, config } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      shopify.toast.show(fetcher.data.message, { isError: !fetcher.data.ok });
    }
  }, [fetcher.data, fetcher.state, shopify]);

  return (
    <s-page heading="RopeConfigurator Setup" inlineSize="base">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="initialize-positions" />
        <s-section heading="Standardpositionen initialisieren">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Legt Endverbindung 1 (end_1), Endverbindung 2 (end_2) und
              Aufmachung (presentation) als aktive, optionale Positionen an.
              Vorhandene Einträge mit diesen Codes bleiben unverändert. Nach
              einer Neuinstallation erneut ausführbar.
            </s-paragraph>
            <s-button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              Standardpositionen initialisieren
            </s-button>
          </s-stack>
        </s-section>
      </fetcher.Form>
      <fetcher.Form method="post">
        <s-section heading="Seil-Konfigurator">
          <s-stack direction="block" gap="base">
            <s-select
              label="Seil-Produkttyp"
              name="ropeProductType"
              value={config.ropeProductType ?? AUTO_PRODUCT_TYPE}
            >
              <s-option value={AUTO_PRODUCT_TYPE}>
                Automatisch: Produkttyp beginnt mit Spezialseil
              </s-option>
              {productTypes.map((productType) => (
                <s-option key={productType} value={productType}>
                  {productType}
                </s-option>
              ))}
            </s-select>

            <s-banner heading="Shopify-Stammdaten" tone="info">
              Preis und Versandgewicht der Stammdatenvariante werden je 1 dm
              gepflegt. Komponenten werden mit ihrem jeweiligen Variantenpreis
              und Gewicht berechnet. Fertige Konfigurationen erhalten eine
              eigene, unveränderliche Variante mit Stückpreis und Stückgewicht.
              Die Warenkorbmenge ist Stück; Bestandsverfolgung bleibt
              deaktiviert.
            </s-banner>
          </s-stack>
        </s-section>

        <s-section heading="Grenzwerte">
          <s-grid gridTemplateColumns="repeat(2, minmax(0, 1fr))" gap="base">
            <s-number-field
              label="Minimale Länge (m)"
              name="minLengthMeters"
              min={0.1}
              step={0.1}
              value={formatScaledDecimal(
                Math.round(config.minLengthHundredths / 10) * 10,
                2,
              )}
              required
            ></s-number-field>
            <s-number-field
              label="Maximale Länge (m)"
              name="maxLengthMeters"
              min={0.1}
              step={0.1}
              value={formatScaledDecimal(
                Math.round(config.maxLengthHundredths / 10) * 10,
                2,
              )}
              required
            ></s-number-field>
            <s-number-field
              label="Vorgabelänge (m)"
              name="defaultLengthMeters"
              min={0.1}
              step={0.1}
              value={formatScaledDecimal(
                Math.round(config.defaultLengthHundredths / 10) * 10,
                2,
              )}
              required
            ></s-number-field>
            <s-number-field
              label="Minimale Stückzahl"
              name="minQuantity"
              min={1}
              max={999}
              step={1}
              value={String(config.minQuantity)}
              required
            ></s-number-field>
            <s-number-field
              label="Maximale Stückzahl"
              name="maxQuantity"
              min={1}
              max={999}
              step={1}
              value={String(config.maxQuantity)}
              required
            ></s-number-field>
          </s-grid>
        </s-section>

        <s-section heading="Konfigurationspositionen und Komponentenfreigaben">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Nach dem App-Deployment stehen unter Inhalte → Metaobjekte die
              Definitionen Konfigurationsposition und Konfigurationsfreigabe
              bereit. Initialisieren Sie die Standardpositionen mit dem Button
              oben. Der technische Code wird vorgegeben, nicht frei eingegeben.
              Bezeichnung, Pflichtauswahl, Sortierung und Aktivstatus können Sie
              anschließend in Shopify anpassen.
            </s-paragraph>
            <s-paragraph>
              Jede Freigabe verbindet genau einen Basisartikel, eine Position
              und eine reale Komponentenvariante. Pflegen Sie Bezeichnung,
              Komponentenmenge, Sortierung und Aktivstatus. Es gibt keine
              automatische Zuordnung über Durchmesser.
            </s-paragraph>
            <s-paragraph>
              Ordnen Sie am Seilprodukt beide Metafeldlisten zu:
              Konfigurationspositionen und Zulässige Komponenten. Für optionale
              Positionen steht Ohne zur Verfügung. Haspel und Ring werden bei
              Bedarf als Komponenten geführt; ein pauschaler Haspelaufschlag
              wird nicht verwendet.
            </s-paragraph>
            <s-banner heading="Theme aktualisieren" tone="info">
              Kopieren Sie die Sections seile.liquid und
              rope-variant-status.liquid in das aktive Theme. Verwenden Sie für
              Seilartikel die Produktvorlage mit dem Konfigurator und entfernen
              Sie dort normale Variantenwahl, Mengenwahl, Kauf- und
              Express-Checkout-Buttons.
            </s-banner>
          </s-stack>
        </s-section>

        <s-stack direction="inline" gap="base">
          <s-button
            type="submit"
            variant="primary"
            icon="save"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Speichern
          </s-button>
        </s-stack>
      </fetcher.Form>
    </s-page>
  );
}
