import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getRopeConfiguratorConfig } from "../services/rope-configurator-setup.server";
import {
  importRopeReleaseCsv,
  copyMasterReleasesToCollectionProducts,
  loadRopeReleases,
  previewCollectionReleaseCopy,
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
    if (intent === "preview-collection-copy") {
      const collectionId = String(formData.get("collectionId") || "");
      const masterProductId = String(formData.get("masterProductId") || "");
      return {
        ok: true as const,
        intent: "preview-collection-copy" as const,
        collectionId,
        masterProductId,
        preview: await previewCollectionReleaseCopy(
          admin,
          config,
          collectionId,
          masterProductId,
        ),
      };
    }
    if (intent === "copy-collection-releases") {
      const result = await copyMasterReleasesToCollectionProducts(
        admin,
        config,
        String(formData.get("collectionId") || ""),
        String(formData.get("masterProductId") || ""),
      );
      return {
        ok: result.failures.length === 0,
        intent: "copy-collection-releases" as const,
        ...result,
      };
    }
    if (intent === "preview") {
      return {
        ok: true as const,
        intent: "preview" as const,
        preview: await previewRopeReleaseImport(admin, csv, config),
      };
    }
    if (intent === "import") {
      const result = await importRopeReleaseCsv(admin, csv, config);
      return {
        ok: result.failures.length === 0,
        intent: "import" as const,
        created: result.created,
        updated: result.updated,
        failures: result.failures,
      };
    }
    return { ok: false as const, intent, message: "Unbekannte Aktion." };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Die Freigaben konnten nicht verarbeitet werden.";
    console.error("Rope release management failed", {
      shop: session.shop,
      intent,
      error: message,
    });
    if (intent === "copy-collection-releases")
      return {
        ok: false as const,
        intent: "copy-collection-releases" as const,
        message,
      };
    if (intent === "preview-collection-copy")
      return {
        ok: false as const,
        intent: "preview-collection-copy" as const,
        collectionId: String(formData.get("collectionId") || ""),
        masterProductId: String(formData.get("masterProductId") || ""),
        message,
      };
    if (intent === "preview")
      return { ok: false as const, intent: "preview" as const, message };
    if (intent === "import")
      return { ok: false as const, intent: "import" as const, message };
    return {
      ok: false as const,
      intent,
      message,
    };
  }
};

const CSV_TEMPLATE = `mapping_id,product_title,product_handle,product_id,position_label,position_code,component_product_title,component_variant_title,component_sku,component_variant_id,label,quantity,sort_order,active
,Seil A,seil-a,,Endverbindung 1,end_1,Kauschen,Kausche Edelstahl,K-100,,Kausche Edelstahl,1,10,true`;

export default function RopeReleasesPage() {
  const { releases, positions, exportCsv, collections } =
    useLoaderData<typeof loader>();
  const previewFetcher = useFetcher<typeof action>();
  const importFetcher = useFetcher<typeof action>();
  const collectionPreviewFetcher = useFetcher<typeof action>();
  const collectionCopyFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const { revalidate } = useRevalidator();
  const revalidatedCopyRef = useRef<unknown>(null);
  const [csv, setCsv] = useState("");
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [collectionId, setCollectionId] = useState("");
  const [masterProductId, setMasterProductId] = useState("");
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
                `${"line" in failure && failure.line ? `Zeile ${failure.line}: ` : ""}${failure.message}`,
            )
          : [];
      shopify.toast.show(
        errors.length ? `${summary} ${errors.join(" ")}` : summary,
        { isError: errors.length > 0 || !importFetcher.data.ok },
      );
    }
  }, [importFetcher.data, importFetcher.state, shopify]);

  useEffect(() => {
    if (
      collectionCopyFetcher.state === "idle" &&
      collectionCopyFetcher.data?.intent === "copy-collection-releases" &&
      "copiedProducts" in collectionCopyFetcher.data &&
      collectionCopyFetcher.data !== revalidatedCopyRef.current
    ) {
      revalidatedCopyRef.current = collectionCopyFetcher.data;
      collectionPreviewFetcher.reset();
      revalidate();
    }
  }, [
    collectionCopyFetcher.data,
    collectionCopyFetcher.state,
    collectionPreviewFetcher,
    revalidate,
  ]);

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
  const collectionPreview =
    collectionPreviewFetcher.data?.intent === "preview-collection-copy" &&
    collectionPreviewFetcher.data.ok &&
    collectionPreviewFetcher.data.collectionId === collectionId &&
    collectionPreviewFetcher.data.masterProductId === masterProductId
      ? collectionPreviewFetcher.data.preview
      : null;
  const selectedCollection = collections.find(
    (collection) => collection.id === collectionId,
  );
  const masterProducts =
    selectedCollection?.products.filter(
      (product) => product.releaseCount > 0,
    ) ?? [];
  const collectionPreviewError =
    collectionPreviewFetcher.data?.intent === "preview-collection-copy" &&
    !collectionPreviewFetcher.data.ok &&
    collectionPreviewFetcher.data.collectionId === collectionId &&
    collectionPreviewFetcher.data.masterProductId === masterProductId
      ? collectionPreviewFetcher.data.message
      : null;
  const collectionCopyResult =
    collectionCopyFetcher.data?.intent === "copy-collection-releases" &&
    "copiedProducts" in collectionCopyFetcher.data
      ? collectionCopyFetcher.data
      : null;
  const collectionCopyError =
    collectionCopyFetcher.data?.intent === "copy-collection-releases" &&
    "message" in collectionCopyFetcher.data
      ? collectionCopyFetcher.data.message
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
            Der Export enthält neben den technischen IDs auch lesbare Artikel-,
            Positions- und Variantenangaben. Diese Info-Spalten helfen beim
            Bearbeiten und können unverändert bleiben. Für neue Freigaben können
            Sie product_handle und component_sku verwenden und product_id sowie
            component_variant_id leer lassen; die SKU muss eindeutig sein. Eine
            leere mapping_id legt eine neue Freigabe an oder aktualisiert eine
            eindeutig passende Kombination. Zum Bearbeiten einer bestehenden
            Freigabe die exportierte mapping_id in derselben Zeile stehen
            lassen. Der Import löscht keine nicht enthaltenen Freigaben.
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
                      <th>Komponente</th>
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
                        <td>
                          {row.componentDescription || "Variante erkannt"}
                        </td>
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
                  <s-paragraph key={index}>
                    {"line" in failure && failure.line
                      ? `Zeile ${failure.line}: `
                      : ""}
                    {failure.message}
                  </s-paragraph>
                ))}
            </s-banner>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Masterfreigaben auf Collection übertragen">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Wählen Sie das Masterprodukt einer Collection. Seine
            Konfigurationsfreigaben und Konfigurationspositionen werden für
            Seilartikel in derselben Collection neu angelegt, sofern diese noch
            keine Konfiguration haben. Artikel mit vorhandenen Freigaben oder
            Positionszuordnungen werden nicht verändert.
          </s-paragraph>
          <collectionPreviewFetcher.Form method="post">
            <input
              type="hidden"
              name="intent"
              value="preview-collection-copy"
            />
            <s-stack direction="block" gap="base">
              <label>
                Collection{" "}
                <select
                  name="collectionId"
                  value={collectionId}
                  onChange={(event) => {
                    setCollectionId(event.currentTarget.value);
                    setMasterProductId("");
                    collectionPreviewFetcher.reset();
                    collectionCopyFetcher.reset();
                  }}
                  required
                >
                  <option value="">Collection auswählen</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Masterprodukt{" "}
                <select
                  name="masterProductId"
                  value={masterProductId}
                  onChange={(event) => {
                    setMasterProductId(event.currentTarget.value);
                    collectionPreviewFetcher.reset();
                    collectionCopyFetcher.reset();
                  }}
                  required
                  disabled={!masterProducts.length}
                >
                  <option value="">Masterprodukt auswählen</option>
                  {masterProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title} ({product.releaseCount} Freigaben)
                    </option>
                  ))}
                </select>
              </label>
              <s-button
                type="submit"
                loading={collectionPreviewFetcher.state !== "idle"}
                disabled={
                  collectionPreviewFetcher.state !== "idle" ||
                  collectionCopyFetcher.state !== "idle" ||
                  !collectionId ||
                  !masterProductId
                }
              >
                Zielartikel anzeigen
              </s-button>
            </s-stack>
          </collectionPreviewFetcher.Form>
          {!masterProducts.length && collectionId && (
            <s-paragraph>
              In dieser Collection ist kein Seilprodukt mit Freigaben als Master
              verfügbar.
            </s-paragraph>
          )}
          {collectionPreviewError && (
            <s-banner
              heading="Übertragung kann nicht vorbereitet werden"
              tone="critical"
            >
              {collectionPreviewError}
            </s-banner>
          )}
          {collectionPreview && (
            <>
              <s-banner heading="Übertragungsvorschau" tone="info">
                Master: {collectionPreview.masterProductTitle}.{" "}
                {collectionPreview.releaseCount} Freigaben pro Zielartikel.{" "}
                {collectionPreview.targets.length} unkonfigurierte Artikel in{" "}
                {collectionPreview.collectionTitle} werden bearbeitet.
                Konfigurierte Artikel werden übersprungen.
              </s-banner>
              {collectionPreview.targets.length > 0 && (
                <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                  <ul>
                    {collectionPreview.targets.map((target) => (
                      <li key={target.id}>
                        {target.title} ({target.handle})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <collectionCopyFetcher.Form method="post">
                <input
                  type="hidden"
                  name="intent"
                  value="copy-collection-releases"
                />
                <input type="hidden" name="collectionId" value={collectionId} />
                <input
                  type="hidden"
                  name="masterProductId"
                  value={masterProductId}
                />
                <s-button
                  type="submit"
                  variant="primary"
                  loading={collectionCopyFetcher.state !== "idle"}
                  disabled={
                    collectionCopyFetcher.state !== "idle" ||
                    collectionPreviewFetcher.state !== "idle" ||
                    !collectionPreview.targets.length
                  }
                >
                  {collectionPreview.targets.length} Artikel übertragen
                </s-button>
              </collectionCopyFetcher.Form>
            </>
          )}
          {collectionCopyResult && (
            <s-banner
              heading={
                collectionCopyResult.ok
                  ? "Übertragung abgeschlossen"
                  : "Übertragung teilweise fehlgeschlagen"
              }
              tone={collectionCopyResult.ok ? "success" : "critical"}
            >
              {collectionCopyResult.copiedProducts} von{" "}
              {collectionCopyResult.targetCount} Artikeln erhalten{" "}
              {collectionCopyResult.copiedReleases} neue Freigaben.
              {collectionCopyResult.failures.map((failure) => (
                <s-paragraph key={failure.productTitle}>
                  {failure.productTitle}: {failure.message}
                </s-paragraph>
              ))}
            </s-banner>
          )}
          {collectionCopyError && (
            <s-banner heading="Übertragung fehlgeschlagen" tone="critical">
              {collectionCopyError}
            </s-banner>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}
