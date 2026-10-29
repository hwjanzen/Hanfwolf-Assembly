import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getRopeConfiguratorConfig } from "../services/rope-configurator-setup.server";
import {
  importRopeReleaseCsv,
  loadRopeReleases,
  previewRopeReleaseImport,
  ropeReleasesToCsv,
} from "../services/rope-releases.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const config = await getRopeConfiguratorConfig(session.shop);
  const board = await loadRopeReleases(admin, config);
  return {
    ...board,
    exportCsv: ropeReleasesToCsv(board.releases),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const csv = String(formData.get("csv") || "");

  try {
    const config = await getRopeConfiguratorConfig(session.shop);
    if (intent === "preview") {
      return {
        ok: true as const,
        intent,
        preview: await previewRopeReleaseImport(admin, csv, config),
      };
    }
    if (intent === "import") {
      const result = await importRopeReleaseCsv(admin, csv, config);
      return {
        ok: result.failures.length === 0,
        intent,
        created: result.created,
        updated: result.updated,
        failures: result.failures,
      };
    }
    return { ok: false as const, intent, message: "Unbekannte Aktion." };
  } catch (error) {
    console.error("Rope release management failed", {
      shop: session.shop,
      intent,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false as const,
      intent,
      message:
        error instanceof Error
          ? error.message
          : "Die Freigaben konnten nicht verarbeitet werden.",
    };
  }
};

const CSV_TEMPLATE = `mapping_id,product_id,position_code,component_variant_id,label,quantity,sort_order,active
,gid://shopify/Product/123456789,end_1,gid://shopify/ProductVariant/123456789,Kausche verzinkt,1,10,true`;

export default function RopeReleasesPage() {
  const { releases, positions, exportCsv } = useLoaderData<typeof loader>();
  const previewFetcher = useFetcher<typeof action>();
  const importFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [csv, setCsv] = useState("");
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const preview =
    previewFetcher.data?.intent === "preview" && previewFetcher.data.ok
      ? previewFetcher.data.preview
      : null;

  useEffect(() => {
    if (
      importFetcher.state === "idle" &&
      importFetcher.data?.intent === "import"
    ) {
      const summary =
        `Import abgeschlossen: ${importFetcher.data.created ?? 0} neu, ` +
        `${importFetcher.data.updated ?? 0} aktualisiert.`;
      const errors =
        "failures" in importFetcher.data
          ? (importFetcher.data.failures ?? []).map(
              (failure) =>
                `${failure.line ? `Zeile ${failure.line}: ` : ""}${failure.message}`,
            )
          : [];
      shopify.toast.show(
        errors.length ? `${summary} ${errors.join(" ")}` : summary,
        { isError: errors.length > 0 || !importFetcher.data.ok },
      );
    }
  }, [importFetcher.data, importFetcher.state, shopify]);

  const visibleReleases = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de");
    return releases.filter((release) => {
      const matchesSearch =
        !query ||
        [
          release.productTitle,
          release.productHandle,
          release.positionLabel,
          release.positionCode,
          release.componentProductTitle,
          release.componentVariantTitle,
          release.componentSku,
          release.label,
        ]
          .join(" ")
          .toLocaleLowerCase("de")
          .includes(query);
      const matchesPosition =
        !positionFilter || release.positionCode === positionFilter;
      const matchesActive =
        activeFilter === "all" ||
        (activeFilter === "active" && release.active) ||
        (activeFilter === "inactive" && !release.active);
      return matchesSearch && matchesPosition && matchesActive;
    });
  }, [activeFilter, positionFilter, releases, search]);

  const isPreviewing = previewFetcher.state !== "idle";
  const isImporting = importFetcher.state !== "idle";
  const previewError =
    previewFetcher.data && !previewFetcher.data.ok
      ? previewFetcher.data.message
      : null;
  const importError =
    importFetcher.data?.intent === "import" &&
    "message" in importFetcher.data &&
    !importFetcher.data.ok
      ? importFetcher.data.message
      : null;

  const downloadCsv = () => {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", exportCsv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "seilfreigaben.csv";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <s-page heading="Seilfreigaben" inlineSize="large">
      <s-section heading={`Freigaben (${releases.length})`}>
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Verwalten Sie die freigegebenen Komponenten zentral. CSV-Importe
            ergänzen oder aktualisieren Freigaben und synchronisieren die
            Zulässige-Komponenten-Liste am jeweiligen Seilartikel. Nicht
            importierte Freigaben bleiben erhalten.
          </s-paragraph>
          <s-stack direction="inline" gap="base">
            <label>
              Suche{" "}
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="Artikel, SKU, Komponente ..."
              />
            </label>
            <label>
              Position{" "}
              <select
                value={positionFilter}
                onChange={(event) =>
                  setPositionFilter(event.currentTarget.value)
                }
              >
                <option value="">Alle Positionen</option>
                {positions.map((position) => (
                  <option key={position.id} value={position.code}>
                    {position.label} ({position.code})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status{" "}
              <select
                value={activeFilter}
                onChange={(event) => setActiveFilter(event.currentTarget.value)}
              >
                <option value="all">Alle</option>
                <option value="active">Aktiv</option>
                <option value="inactive">Inaktiv</option>
              </select>
            </label>
            <button type="button" onClick={downloadCsv}>
              CSV exportieren
            </button>
          </s-stack>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  {[
                    "Basisartikel",
                    "Position",
                    "Komponentenvariante",
                    "Anzeige",
                    "Menge",
                    "Reihenfolge",
                    "Status",
                    "Produktzuordnung",
                  ].map((heading) => (
                    <th
                      key={heading}
                      style={{
                        borderBottom: "1px solid #dfe3e8",
                        padding: "8px",
                        textAlign: "left",
                      }}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleReleases.map((release) => (
                  <tr key={release.id}>
                    <td
                      style={{
                        borderBottom: "1px solid #dfe3e8",
                        padding: "8px",
                      }}
                    >
                      {release.productTitle}
                    </td>
                    <td
                      style={{
                        borderBottom: "1px solid #dfe3e8",
                        padding: "8px",
                      }}
                    >
                      {release.positionLabel} ({release.positionCode || "?"})
                    </td>
                    <td
                      style={{
                        borderBottom: "1px solid #dfe3e8",
                        padding: "8px",
                      }}
                    >
                      {release.componentProductTitle} /{" "}
                      {release.componentVariantTitle}
                      {release.componentSku ? ` · ${release.componentSku}` : ""}
                    </td>
                    <td
                      style={{
                        borderBottom: "1px solid #dfe3e8",
                        padding: "8px",
                      }}
                    >
                      {release.label}
                    </td>
                    <td
                      style={{
                        borderBottom: "1px solid #dfe3e8",
                        padding: "8px",
                      }}
                    >
                      {release.quantity}
                    </td>
                    <td
                      style={{
                        borderBottom: "1px solid #dfe3e8",
                        padding: "8px",
                      }}
                    >
                      {release.sortOrder}
                    </td>
                    <td
                      style={{
                        borderBottom: "1px solid #dfe3e8",
                        padding: "8px",
                      }}
                    >
                      {release.active ? "Aktiv" : "Inaktiv"}
                    </td>
                    <td
                      style={{
                        borderBottom: "1px solid #dfe3e8",
                        padding: "8px",
                      }}
                    >
                      {release.linked ? "Zugeordnet" : "Nicht zugeordnet"}
                    </td>
                  </tr>
                ))}
                {visibleReleases.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: "12px" }}>
                      Keine passenden Freigaben gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </s-stack>
      </s-section>

      <s-section heading="CSV-Import">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Verwenden Sie die Shopify-GIDs aus dem Export. Eine leere mapping_id
            legt eine neue Freigabe an oder aktualisiert eine eindeutig passende
            bestehende Kombination. Mit mapping_id können bestehende Einträge
            auch geändert oder einem anderen Seilartikel zugeordnet werden. Der
            Import löscht keine nicht enthaltenen Freigaben.
          </s-paragraph>
          <details>
            <summary>CSV-Spalten und Beispiel anzeigen</summary>
            <pre style={{ overflowX: "auto", whiteSpace: "pre-wrap" }}>
              {CSV_TEMPLATE}
            </pre>
          </details>
          <previewFetcher.Form method="post">
            <input type="hidden" name="intent" value="preview" />
            <label htmlFor="rope-release-csv">CSV-Inhalt</label>
            <textarea
              id="rope-release-csv"
              name="csv"
              value={csv}
              onChange={(event) => setCsv(event.currentTarget.value)}
              rows={8}
              style={{
                display: "block",
                width: "100%",
                fontFamily: "monospace",
              }}
              required
            />
            <s-button
              type="submit"
              loading={isPreviewing}
              disabled={isPreviewing || isImporting || !csv.trim()}
            >
              CSV prüfen
            </s-button>
          </previewFetcher.Form>
          {previewError && (
            <s-banner heading="Importprüfung fehlgeschlagen" tone="critical">
              {previewError}
            </s-banner>
          )}
          {preview && (
            <>
              <s-banner heading="Vorschau" tone="success">
                {preview.validCount} Zeilen sind gültig. {preview.invalidCount}{" "}
                Zeilen enthalten Fehler. Änderungen werden erst nach Bestätigung
                gespeichert.
              </s-banner>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Zeile</th>
                      <th>Artikel</th>
                      <th>Position</th>
                      <th>Komponentenvariante</th>
                      <th>Anzeige</th>
                      <th>Ergebnis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.line}>
                        <td>{row.line}</td>
                        <td>{row.productTitle}</td>
                        <td>{row.positionCode}</td>
                        <td>{row.componentVariantId}</td>
                        <td>{row.label}</td>
                        <td>{row.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.errors.length > 0 && (
                <s-banner heading="Zeilen mit Fehlern" tone="critical">
                  {preview.errors.map((error) => (
                    <s-paragraph key={`${error.line}-${error.message}`}>
                      Zeile {error.line}: {error.message}
                    </s-paragraph>
                  ))}
                </s-banner>
              )}
              <importFetcher.Form method="post">
                <input type="hidden" name="intent" value="import" />
                <input type="hidden" name="csv" value={csv} />
                <s-button
                  type="submit"
                  variant="primary"
                  loading={isImporting}
                  disabled={
                    isImporting ||
                    isPreviewing ||
                    !preview.validCount ||
                    preview.invalidCount > 0
                  }
                >
                  {preview.validCount} Freigaben übernehmen
                </s-button>
              </importFetcher.Form>
            </>
          )}
          {importError && (
            <s-banner heading="Import teilweise fehlgeschlagen" tone="critical">
              {importError}
              {importFetcher.data &&
                "failures" in importFetcher.data &&
                (importFetcher.data.failures ?? []).map((failure, index) => (
                  <s-paragraph key={`${failure.line}-${index}`}>
                    {failure.line ? `Zeile ${failure.line}: ` : ""}
                    {failure.message}
                  </s-paragraph>
                ))}
            </s-banner>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
