# Hanfwolf Assembly - Shopify App (React Router)

This is a template for building a [Shopify app](https://shopify.dev/docs/apps/getting-started) using [React Router](https://reactrouter.com/). It was forked from the [Shopify Remix app template](https://github.com/Shopify/shopify-app-template-remix) and converted to React Router.

Rather than cloning this repo, follow the [Quick Start steps](https://github.com/Shopify/shopify-app-template-react-router#quick-start).

Visit the [`shopify.dev` documentation](https://shopify.dev/docs/api/shopify-app-react-router) for more details on the React Router app package.

## Upgrading from Remix

If you have an existing Remix app that you want to upgrade to React Router, please follow the [upgrade guide](https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix). Otherwise, please follow the quick start guide below.

## Quick start

### Prerequisites

Before you begin, you'll need to [download and install the Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) if you haven't already.

### Setup

```shell
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

### Local Development

```shell
shopify app dev
```

Press P to open the URL to your app. Once you click install, you can start development.

Local development is powered by [the Shopify CLI](https://shopify.dev/docs/apps/tools/cli). It logs into your account, connects to an app, provides environment variables, updates remote config, creates a tunnel and provides commands to generate extensions.

## Hanfwolf Assembly deployment

This project uses a separate Shopify app registration and Render service from the VP app. The Shopify config is linked to the `Hanfwolf-Assembly` app; use only that app's credentials in Render.

The public Render URL is `https://hanfwolf-assembly-dwlt.onrender.com`. If it changes, update `application_url`, the authentication redirect URLs, the app proxy URL in `shopify.app.toml`, and `SHOPIFY_APP_URL` in Render to match. Publish Shopify configuration changes with `shopify app deploy`; a Render deploy alone does not update them.

## Hanfwolf Assembly Workflow (Custom Variant Prices)

### Collection filter Theme assets

Copy [component-collection-filters.css](assets/component-collection-filters.css),
[component-collection-filters.js](assets/component-collection-filters.js) and
[collection-filter-enhancements.liquid](snippets/collection-filter-enhancements.liquid)
into the active theme's matching directories. Render
`{% render 'collection-filter-enhancements' %}` once in the collection section
after Dawn's filter CSS, replacing any separate inclusion of the custom CSS.
The local [collection section](sections/main-collection-product-grid.liquid)
includes this render; copy it or merge the integration into the active theme.
Deploying the app alone does not update these assets.

Desktop filter lists stay open on selection and close on outside clicks or
Escape, including after AJAX markup replacement. Mobile drawer behavior remains
with Dawn. Caption hover underlines and inner hover shadows are suppressed;
keyboard focus remains visible. The filter container does not move on hover.
The `HW20261022` mobile fix removes legacy relative-position/z-index overrides
and 300px submenu limits from `component-collection-filters.css`; Dawn must own
the fixed viewport overlay and absolute sliding panels for correct hit testing.
Upload that updated base file (merge existing merchant font sizes) together
with `collection-filter-design.css`. The native mobile filter/sort launcher
is intentional; it opens the styled drawer and each filter's values. The custom
outside-click/Escape handler remains desktop-only; no Dawn JavaScript is changed.
The subsequent `HW20261022` mobile finish in `collection-filter-design.css`
adds charcoal drawer/submenu headers, light value cards, green checked states
and larger rounded apply buttons below 990px. Drawer geometry, native checkbox
indicators and focus/close behavior remain managed by Dawn.
Text-filter squares and checkmarks share a centered grid cell on desktop/mobile,
so custom row padding/font sizes cannot displace the mark. Swatch/image filter
layouts and native checked/unchecked visibility are preserved.

The `HW20261021` design update loads
[collection-filter-design.css](assets/collection-filter-design.css) after the
existing custom CSS. Copy this additional asset and the updated enhancement
snippet and JavaScript into the active theme; keep the theme's existing
`component-collection-filters.css` with its customized font sizes.
The design overrides do not set font sizes. Desktop uses five columns from
990px and an auto-fit grid from 750px; the mobile Dawn drawer stays unchanged.
Dropdowns overlay the page instead of pushing the products down, and the native
product count, active filter chips and reset controls remain managed by Dawn.
German filter captions are normalized in the DOM (Surface → Oberfläche,
Art des Schlags → Schlagart, Mindestbruchkraft in kN → Mindestbruchkraft (kN)).
Only exact caption text is changed, also after AJAX updates; underlying filter
parameters, product data and other storefront languages stay unchanged.
The exact collection heading HaWo - Seile is displayed as HaWo – Seile.
No manual product-count calculation or replacement filtering logic is added.
Desktop filter buttons stretch to the tallest caption in their grid row,
including the wrapped minimum breaking force label, without changing font sizes.

### Configuration prices in product cards

Copy [card-product.liquid](snippets/card-product.liquid) into the active theme,
merging any theme-specific customizations. Cards for product type `Spezialseile`
show `Preis nach Konfiguration` instead of a native price or volume-pricing note.
Other product types and placeholder cards retain Dawn's price display, including
zero prices for ordinary products. The shared [price snippet](snippets/price.liquid),
product pages, cart, checkout and actual Shopify prices remain unchanged.

### Collection images as product-card fallbacks

Copy the updated [collection section](sections/main-collection-product-grid.liquid)
and [product card](snippets/card-product.liquid) into the active theme.
Set an image on each collection in Shopify Admin. The collection section passes
its own `collection.image` as `fallback_image`, so each collection uses its own
image for products without featured media. Real product media automatically takes
precedence once maintained. Without either image, Dawn's text card remains.
Other card callers (such as search or recommendations) are unchanged unless they
explicitly pass a fallback image. No product data or images are copied in Shopify.

### Storefront finishing pass (HW20261021)

Upload [hanfwolf-storefront-polish.css](assets/hanfwolf-storefront-polish.css)
and the updated [header](sections/header.liquid), which loads it once.
Also update [header design](assets/hanfwolf-header-design.css),
[header search](snippets/header-search.liquid), [product card](snippets/card-product.liquid),
[search section](sections/main-search.liquid), [cart items](sections/main-cart-items.liquid)
and [cart drawer](snippets/cart-drawer.liquid). Cards use square, uncropped image
areas, three-line title space and restrained hover outlines. Cart checkout uses
green, rounded actions; the existing footer/drawer summary receives a light panel.
Only piece configuration options containing `Zuschnitt ` are hidden when a
configuration ID and visible `Länge` property exist. Other options/properties,
quantity controls, discounts, checkout and underlying line data are preserved.
Header logo size and menu readability increase; German inline search receives a
descriptive label. Search headings use the native term/count translation and the
second form becomes smaller on desktop, remaining available on mobile.

For the home page, upload [hanfwolf-home-collections.liquid](sections/hanfwolf-home-collections.liquid),
[image-banner.liquid](sections/image-banner.liquid) and merge the updated
[index template](templates/index.json) into the active home template. Preserve
any newer theme-editor changes. The original banner image/settings are retained,
with an added discovery button and HaWo/DIEPA collection blocks linked to
`hawo-seile` and `diepa-seile`; these can be changed in the theme editor.
JSON templates cannot preserve replaced code in Liquid comments; the existing
banner remains intact and the changes are additive.

### Search filters and fallback images

The `HW20261025` caption sizing update in `collection-filter-design.css` doubles
desktop filter headings from 1.05rem to 2.1rem and mobile headings from 1.08rem
to 2.16rem. Labels wrap within their existing equal-height grid; filter values,
counts and sorting controls retain their sizes. The shared stylesheet also
applies to search filters. Upload only this stylesheet for the sizing update.

Copy [main-search.liquid](sections/main-search.liquid) and
[search-filter-design.css](assets/search-filter-design.css) into the active theme.
Search now loads the shared collection-filter enhancement snippet once after
its facets, followed by search-only overrides. Keep the existing shared filter
assets/snippet and updated product card in the theme too. Native availability
and price filters remain visible on search, as does native sorting; collection
behavior stays unchanged. Search & Discovery supplies `search.filters`: CSS
cannot create missing metafield filters. Verify those filters are configured
in the app, populated on matching products and enabled in the search template.
The grid adapts to the supplied number of filters. AJAX filtering stays native.

For product results without featured media, search passes the first assigned
collection with an image to the existing card fallback. If a product belongs to
multiple pictured collections, the first in Shopify's collection order wins.
Real product media takes precedence; articles/pages and products without either
image keep their existing rendering. No product data is changed.

### Individual rope inquiries

The `HW20261025` inquiry dialog uses Shopify's native contact form, not a cart
line or an unpriced order. HaWo/DIEPA collection grids offer a persistent callout
below results, including zero matches after native AJAX filtering. Each cut
offers its own inquiry button below the configuration fields. The dialog
collects name/email (required), optional company/phone and free text, alongside
read-only assortment, page URL, selected filters or the clicked cut's current
quantity/length/components. Names and product labels are escaped.

Upload `hanfwolf-inquiry.liquid` into snippets, `hanfwolf-inquiry.css` and
`hanfwolf-inquiry.js` into assets, and merge the updated
`main-collection-product-grid.liquid` and `seile.liquid` sections into the theme.
Deploy the updated app-served configurator script too: native contact submission
reloads the page, so it restores all cut inputs as unconfirmed drafts from
tab-scoped session storage. Finish/review/confirm again before checkout. Closing
the dialog without submission leaves the current configuration untouched.
No personal contact details are stored by our scripts. Storage failures are
logged; restoring after a reload requires browser session storage.

Shopify handles contact validation, spam challenges and delivery to the store's
configured contact recipient. Success is shown only when Liquid reports
`form.posted_successfully?`; validation errors reopen the dialog. Verify the
recipient and send a real inquiry from both entry points before publishing.
The local checks do not establish email delivery. No database migration, new
permissions or app reinstall is required.

### HANFWOLF theme header

The `HW20261025` product assortment update keeps HaWo/DIEPA collection menu
items highlighted on their products (dropdown, mega menu and drawer). The
configurator adds a linked breadcrumb; mobile shows only the return link.
Upload the shared [assortment resolver](snippets/hanfwolf-product-collection.liquid),
all three `header-*-menu`/`header-drawer` snippets, `hanfwolf-header-design.css`,
`seile.liquid` and `rope-configurator-design.css`. Collection menu entries must
be Shopify collection links to `hawo-seile` or `diepa-seile`, not custom URLs.
The resolver uses actual product collection membership, preferring the current
collection context when it matches. Direct visits work without browser history;
if a product belongs to both assortments and has no collection context, HaWo
wins deterministically. Products in neither assortment receive no extra marker
or breadcrumb. No backend deployment is needed for this navigation update.

Copy [hanfwolf-header-design.css](assets/hanfwolf-header-design.css),
[header.liquid](sections/header.liquid) and
[header-search.liquid](snippets/header-search.liquid) into the active theme,
merging existing customizations. The header's **HANFWOLF Header-Design** checkbox
enables the `HW20261021` charcoal/green layout and can restore the original Dawn
layout when disabled. Set the actual logo and menu in the existing theme settings;
no menu links or logo images are hardcoded. Desktop uses a light logo surface,
an inline native search, account/cart controls and a second navigation row.
Existing predictive search, dropdown/mega menus, desktop drawer mode and mobile
search/drawer remain managed by Dawn. Mobile retains the configured logo position.
Only these theme files need uploading; no app deployment/reinstall is required.

### Configurator charcoal/silver design

The `HW20261025` live preview adds illustrative end_1/material/end_2 tiles per
cut: horizontal on desktop, vertical below 750px. Component variant images take
precedence over component product images. Empty selections hide the end tile;
selected components without images show a labeled placeholder. Material uses the
current product image. A selected presentation (for example Haspel or Ring) adds
a separate preview below the three rope tiles using its mapped component image;
**Ohne** hides the entire presentation preview. Inputs appear first in two
fieldsets: quantity/length, then component configuration. Both groups are locked
and unlocked together by the existing finish/edit workflow. Deploy the updated
configurator script and upload `seile.liquid` and `rope-configurator-design.css`
together for this layout. The script remains compatible with the old input group.
Images are not to scale and do not enter pricing snapshots/hashes.
The unconfigured `end_1` and `end_2` selections are displayed as **Ende spitz**
(the standard cut end) in selectors, order summaries and cart properties.
Other optional positions retain **Ohne**. Standard ends still hide the end image
tile. Immutable snapshots/hashes and pricing remain unchanged; existing cart
lines are not rewritten.
Deploy the backend (config response and configurator script) and upload both
`seile.liquid` and `rope-configurator-design.css`. No app reinstall is required.

The `HW20261025` update displays the current product's full, escaped title
directly below the configurator heading, with a green accent and wrapping for
long names on mobile. Upload both the section and stylesheet for this update.

Copy [rope-configurator-design.css](assets/rope-configurator-design.css) and the
updated [seile section](sections/seile.liquid) into the active theme.
The `HW20261021` stylesheet adds a scoped charcoal surface, silver primary
actions, rounded secondary buttons, clear cut cards and a highlighted review.
Logo green (`#158d45`, sampled from the supplied screenshot) accents card tops
and the review border. A lighter green marks hover/focus, while the enabled
cart action uses a darker green for readable white text. Intermediate primary
actions retain their silver finish; disabled actions retain their muted style.
It preserves the original section styles and all configuration/cart behavior.
Hidden controls stay hidden, disabled fields remain readable, keyboard focus
is visible and mobile actions use the available width. Review tables scroll
inside their panel on narrow screens. Other Dawn sections remain unchanged.
No backend deployment or app reinstall is needed.

### Configured variant names in the cart

Copy [cart-configuration-option-value.liquid](snippets/cart-configuration-option-value.liquid),
[main-cart-items.liquid](sections/main-cart-items.liquid) and
[cart-drawer.liquid](snippets/cart-drawer.liquid) to the active theme, merging any
theme-specific customizations. Both cart views render the technical configuration
option as `Zuschnitt - 50dm` for a 5 m cut (`5dm` for 0.5 m).
The display derives from the per-piece `Länge` property, not the cart quantity.
Other variant options and ordinary products retain their existing values.
Existing configured cart lines also use this display after the theme update.
Shopify variant option values, hashes, SKUs, prices and checkout names remain
unchanged; no variants are renamed or created by this presentation change.

### Product attribute definitions

On authentication and when opening the app home, the bootstrap creates missing
merchant-owned definitions for the following attributes:

| Product metafield | Metaobject type | Metaobject display name |
| --- | --- | --- |
| `custom.oberflaeche` | `enattoberflaeche` | enAttOberfläche |
| `custom.durchmesser` | `enattdurchmesser` | enAttDurchmesser |
| `custom.schlagart` | `enattributschlagart` | enAttributSchlagart |
| `custom.festigkeitsklasse` | `enattfestigkeitsklasse` | enAttFestigkeitsklasse |

Each metaobject has the optional single-line text field `value` (label `Value`,
also used for entry display names). Each product metafield is a single reference.
`custom.mindestbruchkraft` is a direct `number_decimal` product field named
`Mindestbruchkraft kN`; no metaobject is created for it.

All definitions allow Storefront API reads. Existing
definitions are checked for compatible types, reference target, display field
and storefront access; conflicts are logged by the bootstrap callers without
overwriting existing definitions.

This runs separately before the pricing bootstrap, so a failure in one does not
prevent the other from running. Errors are recorded in the server logs and retried
on the next app-home load. It does not migrate
`custom.oberflache`, copy entries, assign product values, constrain definitions
to the Seile category, or configure Search & Discovery filters. Create entries
and assign them to products in Shopify, then select the product metafield as a
filter in Search & Discovery. Admin API filtering is a separate capability and
is not enabled by this bootstrap.
If an attribute fails, the attribute bootstrap stops and retries on the next load;
definitions already created remain in place and are reused.

### Wann welche Befehle ausfuehren

1. Nur Code geaendert (TS/TSX, UI, Preislogik, GraphQL in Routen):

  - npm run dev

2. Shopify-Konfiguration geaendert (shopify.app.toml), z. B. Scopes, Metaobject-/Metafield-Definitionen, Webhooks:

  - npm run deploy
  - npm run dev
  - Falls Scopes geaendert wurden: App im Store neu autorisieren

3. Nur Daten im Shopify Admin geaendert (Metaobject-Eintraege, Price List Lines):

  - Kein deploy notwendig
  - In der Regel reicht ein Reload der App

4. Neues Git-Update mit potenziellen Abhaengigkeiten/Migrationen:

  - npm install
  - npm run setup
  - npm run dev

### Hanfwolf Preislogik Status

- Company-Metafield custom.price_list verweist auf Price List Header
- Price List Lines werden nach Header, Variant, Menge und Gueltigkeit gefiltert
- Mengenstaffel: groesste Quantity kleiner/gleich Bestellmenge gewinnt
- Fallback: Variant-Preis, wenn keine gueltige Line gefunden wird

### Naechste Schritte

1. Entscheidungsregel fuer gleiche Quantity formal festschreiben (aktuell wird der hoehere Preis ausgegeben).
2. Logging fuer produktive Nachvollziehbarkeit ergaenzen (Header ID, Line ID, Regelpfad).
3. Preislogik an den echten Aufrufpunkt anbinden (z. B. API-Route fuer ERP/B2B-Frontend).
4. Zusatzt tests ergaenzen fuer Edge Cases (fehlender Fallback-Preis, ungueltige Decimal-Werte, leere Lines).

### Storefront Demo (collections/all und products/gift-card)

1. App Proxy ist auf `/apps/hanfwolf-pricing` konfiguriert.
2. Der Proxy-Endpunkt liegt in `app/routes/apps.hanfwolf-pricing.ts`.
3. Das Frontend-Demo-Skript wird ueber den App Proxy ausgeliefert: `/apps/hanfwolf-pricing/script`.

Einbau in Shopify Theme (Custom Liquid Block oder `theme.liquid`):

```liquid
<script
  src="/apps/hanfwolf-pricing/script"
  data-proxy-path="/apps/hanfwolf-pricing"
  data-company-id="20636336463"
  data-quantity="1"
  defer
></script>
```

Hinweise:

- `data-company-id` kann numerisch oder als GID angegeben werden.
- Alternativ statt Company eine feste Header-ID nutzen:

```liquid
<script
  src="/apps/hanfwolf-pricing/script"
  data-proxy-path="/apps/hanfwolf-pricing"
  data-header-id="536372248911"
  data-quantity="1"
  defer
></script>
```

- Auf `products/gift-card` wird eine Add-to-Cart-Preisbox gerendert.
- Auf `collections/all` werden fuer die ersten gefundenen Produktkarten Custom-Preise eingeblendet.

### Legacy-Draft-Order-API fuer Seile

Dieser separate API-Endpunkt wird vom Seil-Konfigurator nicht mehr verwendet.
Der Konfigurator nutzt native Shopify-Stueckvarianten pro Konfiguration (siehe
unten). Die API bleibt fuer bestehende externe Aufrufer verfuegbar:

Der signierte App-Proxy-Endpunkt `POST /apps/hanfwolf-pricing/draft-order`
erstellt fuer Produkte vom Typ `Spezialseile` einen Draft Order. Der
Variantenpreis wird als Meterpreis interpretiert. Der Preis je konfektioniertem
Seil wird auf volle Cent aufgerundet. Das an der Variante gepflegte Gewicht wird
als Gewicht pro Meter interpretiert und mit der Zuschnittlaenge multipliziert.
Die Draft-Order-Position wird als versandfaehiges Custom Line Item angelegt,
damit Shopify das berechnete Gewicht fuer die Versandkosten verwendet.

Beispielanfrage:

```json
{
  "items": [
    {
      "variantId": "gid://shopify/ProductVariant/123456789",
      "quantity": 3,
      "lengthMeters": "12",
      "presentation": "Ring"
    },
    {
      "variantId": "gid://shopify/ProductVariant/123456789",
      "quantity": 1,
      "lengthMeters": "1,3",
      "presentation": "Haspel"
    }
  ]
}
```

Voraussetzungen:

- App-Scope `write_draft_orders` ist autorisiert.
- Das Produkt hat den Produkttyp `Spezialseile`.
- An jeder verwendeten Variante sind Meterpreis und Gewicht pro Meter gepflegt.
- Fuer Aufmachung `Haspel` existiert am Produkt das Metafeld
  `custom.haspel_surcharge` vom Typ `number_decimal`. Der Wert ist der feste
  Aufpreis pro konfektioniertem Seil.
- Laengen liegen zwischen 0,5 und 500 m und haben maximal zwei Nachkommastellen.

Die Antwort enthaelt `checkoutUrl`; dorthin wird der Kunde nach erfolgreicher
Erstellung weitergeleitet. Preise und Gewichte aus dem Browser werden nicht
akzeptiert. Da Shopify individuelle Gewichte bei Variantenzeilen ignoriert,
werden Produkt- und Varianten-ID als interne Attribute am Custom Line Item
gespeichert; eine automatische Bestandsreduzierung der Originalvariante findet
dabei nicht statt.

Der Versandpreis wird serverseitig aus dem Gesamtgewicht aller Seilpositionen
berechnet und als eine Versandzeile `Standard` am Draft Order gesetzt:

- bis 10 kg: 15 EUR
- ueber 10 bis 50 kg: 30 EUR
- ueber 50 bis 200 kg: 50 EUR
- ueber 200 kg: 150 EUR

### Seil-Konfigurator: Komponenten und Stueckvarianten

Jeder fertiggestellte Zuschnitt erhaelt eine unveraenderliche Shopify-Variante
mit Stueckpreis und Versandgewicht je Stueck. Die Warenkorbmenge ist die
Stueckzahl: Menge 2 bei Laenge 2,5 m bedeutet zweimal 2,5 m, nicht 5 m am Stueck.
Die Laenge bleibt eine Line-Item-Property. Bestandsverfolgung ist fuer erzeugte
Varianten deaktiviert (`CONTINUE`, `tracked: false`).

**Preise:** Die Stammdatenvariante behaelt Preis und Gewicht **je 1 dm**.
Bei 0,10 EUR/dm kostet ein Zuschnitt von 2,5 m daher 2,50 EUR zuzueglich
Komponenten. Je Auswahl werden aktueller Komponentenvariantenpreis und
Komponentengewicht mit der gepflegten Komponentenmenge multipliziert und zum
Zuschnitt addiert. Fuer zwei identische Kauschen an zwei Positionen werden beide
berechnet. Stueckzahl multipliziert anschliessend den fertigen Stueckpreis.
Berechnung erfolgt serverseitig in ganzen Cent; Browserpreise sind keine Preisquelle.
Es gibt keinen festen Haspelaufschlag.

#### Einrichtung und Deployment

1. Backend deployen und `npm run setup` ausfuehren (Prisma-Client und Migrationen).
   Die SQLite-Datenbank muss auf persistentem Speicher liegen und von allen
   App-Instanzen gemeinsam verwendet werden. Bei mehreren Hosts eine gemeinsame,
   transaktionale Datenbank statt getrennter SQLite-Kopien verwenden.
2. `npx shopify app config validate --json`, danach `npm run deploy`:
   Die Definitionen aus [shopify.app.toml](shopify.app.toml) werden installiert.
   Erforderliche Produktscopes, Inventar-Lesezugriff und Metaobjektzugriff autorisieren.
3. Im **RopeConfigurator Setup → Standardpositionen initialisieren** klicken.
   Die App legt `end_1` / Endverbindung 1, `end_2` / Endverbindung 2 und
   `presentation` / Aufmachung aktiv und optional mit Sortierung 10/20/30 an.
   Vorhandene Eintraege werden anhand ihres Codes wiederverwendet, nicht
   ueberschrieben; fehlende werden ergaenzt. Nach einer Neuinstallation kann
   der Button erneut verwendet werden. Produktzuordnungen und Komponentenfreigaben
   werden dadurch nicht wiederhergestellt oder automatisch angelegt.
   Das Code-Feld hat nach Deployment der App-Konfiguration diese drei festen
   Auswahlwerte statt Freitext. Weitere Positionscodes fuer zukuenftige Produkte
   erfordern eine Erweiterung der App-Definition und Initialisierung.
   Vor Deployment vorhandene andere Codes pruefen: sie gehoeren nicht zur
   neuen Auswahlliste und muessen bewusst migriert werden.
   Unter **Inhalte → Metaobjekte → Konfigurationsposition** koennen Bezeichnung,
   Pflichtauswahl, Sortierung und Aktivstatus angepasst werden. Code und
   Bezeichnung muessen je Produkt eindeutig sein; Bezeichnungen duerfen weder
   `Länge` sein noch mit `_` beginnen.
4. Komponenten als reale Shopify-Produkte/-Varianten mit aktuellen Preisen und
   Versandgewichten pflegen. Versandfaehige Komponenten brauchen positives Gewicht.
   Eine kostenfreie Ring-Auswahl kann eine nicht versandfaehige 0-EUR-Komponente
   sein; bei einer optionalen Position fuegt **Ohne** weder Kosten noch Gewicht hinzu.
5. Unter **Konfigurationsfreigabe** je erlaubter Kombination einen Eintrag anlegen:
   Basisartikel + Konfigurationsposition + Komponentenvariante, dazu angezeigte
   Bezeichnung, Komponentenmenge (1–999), Sortierung und Aktivstatus.
   Beispiel: A / Endverbindung 1 / Kausche A und A / Endverbindung 1 / Kausche B;
   fuer Artikel B duerfen separat A und D freigegeben werden. Endverbindung 2
   benoetigt eigene Freigaben. Durchmesser wird nicht automatisch ausgewertet.
6. Am Seilprodukt die beiden App-Metafelder **Konfigurationspositionen** und
   **Zulaessige Komponenten** mit den passenden Eintraegen befuellen.
   Nur dort referenzierte, aktive Freigaben werden angeboten. Fremde Basisartikel,
   fehlende Referenzen und leere Pflichtauswahlen werden explizit abgelehnt.
   Unterstuetzt sind 1–30 aktive Positionen und bis zu 100 Referenzen je Liste.
7. Genau eine Stammdatenvariante verwenden (bei mehreren Originalvarianten mit
   `$app.is_default_configuration = true` markieren). Preis/Gewicht je dm pflegen.
   Das Produkt muss aktiv und im Onlineshop veroeffentlicht sein; den erlaubten
   Produkttyp und Laengen-/Stueckzahlgrenzen im **RopeConfigurator Setup** speichern.
8. [sections/seile.liquid](sections/seile.liquid) **und**
   [sections/rope-variant-status.liquid](sections/rope-variant-status.liquid) in
   das aktive Theme kopieren. `seile` in die Seil-Produktvorlage einbinden und
   diese den Seilartikeln zuweisen. Normale Variantenwahl, Mengenwahl, Kauf-
   und Express-Checkout-Buttons dort entfernen: Konfigurationsvarianten sind
   technische Varianten, keine vom Kunden waehlbaren Stammdaten.
   Die Status-Section braucht keinen sichtbaren Block in der Produktvorlage.

Bestehende dm-Warenkorbpositionen werden **nicht** automatisch in Stueckpositionen
umgerechnet. Vor dem Umstieg alte Testwarenkoerbe leeren und neu konfigurieren.
Die unveraenderten Dawn-Warenkorbskripte behandeln neue Mengen bereits als Stueck;
eventuelle fruehere Anpassungen, die bei Mengenaenderung die Laengen-Property
umschreiben, aus dem aktiven Theme entfernen.

#### Ablauf und Fehlerbehandlung

Bei Positionsfehlern nennt die Antwort den betroffenen Eintrag und das Feld
(z. B. Code, Pflichtauswahl oder Sortierung). Die Typpruefung verwendet die
ueber `$app:configuration_position` und `$app:component_mapping` aufgeloesten
Definitionen statt Annahmen ueber Shopifys interne Typnamen. Bei korrekt
zugeordneten Eintraegen und der alten pauschalen Fehlermeldung das Backend
aktualisieren; Metaobjekte nicht allein deshalb loeschen oder neu anlegen.

- **Zuschnitt fertigstellen** sperrt die Eingaben und startet sofort die
  Vorbereitung. **Weiteren Zuschnitt hinzufuegen** ist danach verfuegbar,
  auch wenn Shopify noch vorbereitet. Es gibt keine zehn globalen Dummy-Slots.
- **Bestelluebersicht pruefen** zeigt Stueckzahl, Laenge, Komponenten,
  Stueckpreis, Positionspreis und Summe; noch ausstehende Preise sind markiert.
  Bearbeiten/Entfernen macht die abschliessende Bestaetigung ungueltig.
- **Konfiguration bestaetigen** bestaetigt die Zusammenstellung.
  **In den Warenkorb** wird erst freigegeben, wenn alle Varianten sowohl im
  Admin als auch tatsaechlich im Storefront kaufbar sind.
  Die gezielte Theme-Statusabfrage funktioniert auch jenseits der 250 Varianten
  im Produkt-AJAX-JSON. Aktuell wird nur die Shop-Waehrung ohne abweichende
  Markets-/B2B-Kontextpreise unterstuetzt; Abweichungen werden nicht verschwiegen.
- Vorbereitung ist begrenzt (90 Sekunden inkl. Requests; einzelne Requests mit
  Timeout). Bei Fehlern erscheint **Erneut versuchen**, kein endloser Ladezustand.
  Eine Datenbank-Lease verhindert parallele Neuerstellung derselben Konfiguration;
  nach abgebrochener Erstellung wird die vorhandene Variante anhand ihres Markers
  wiedergefunden. Eine unterbrochene Lease laeuft nach 120 Sekunden aus.
- Alle fertigen Zuschnitte werden gemeinsam mit einem `/cart/add.js`-Request
  hinzugefuegt. Stabile Zuschnitt-IDs und ein Warenkorbabgleich verhindern bei
  Wiederholung nach unklarer Netzwerkantwort doppelte Positionen. Nicht gleichzeitig
  denselben Browserwarenkorb aus mehreren Tabs abschicken.
- Erzeugte Varianten niemals nachtraeglich bepreisen oder umkonfigurieren.
  Die ID ist ein Hash aus Shop, Ausgangsvariante, Laenge, gewaehlten Komponenten,
  deren Preisen/Gewichten und Bezeichnungen. Identische Preisstaende werden
  wiederverwendet; Aenderungen erzeugen eine neue Variante. Shopifys Varianten-
  und taegliche Erstellungslimits gelten weiterhin; Fehler werden angezeigt.

`POST /apps/hanfwolf-pricing/prepare` nimmt `productId`, `quantity`, `lengthMeters`,
`selections: [{ positionId, mappingId }]` und eine stabile `requestId` entgegen.
`mappingId: null` ist nur fuer optionale Positionen erlaubt.
`GET .../prepare?id=<configurationId>` prueft Vorbereitung und Varianteninvarianten.
`GET .../config?productId=<Product-GID>` liefert die erlaubten Dropdownoptionen.
Alle Endpunkte verwenden den signierten App-Proxy und `Cache-Control: no-store`.

Snapshots werden in `RopeConfiguration`, Auswahlereignisse einschliesslich Shop,
Artikelbezug, signiertem Kundenbezug (falls angemeldet) und Stueckzahl in
`RopeConfigurationSelection` gespeichert. Die Auswahlhistorie ist **keine**
Bestellhistorie; ein Order-Webhook/Order-Link sowie Aufbewahrungs-/Loeschregeln
fuer Kundenanalysen sind vor produktiver Auswertung separat einzurichten.
Die Metaobjekte sind Stammdatenfreigaben, nicht mutable Kundenkonfigurationen.
Verschachtelte BOMs, wiederholbare Stranggruppen und Regeln zwischen zwei
Auswahlen sind noch nicht enthalten; weitere flache Positionen sind moeglich.

Das Theme-Skript stellt `HanfwolfPricing.addConfiguredCutsToCart(items)` und
`HanfwolfPricing.finalizeCart()` bereit. Warenkoerbe mit Konfigurationsmarkern
gehen nativ zum Shopify-Checkout; andere Warenkoerbe behalten den bisherigen
Draft-Order-Ablauf. Der direkte `cart-draft-order`-Endpunkt lehnt v3-Konfigurationen
explizit ab. Die separaten alten Meterpreis-/Haspel-Draft-Order-APIs sind nur fuer
bisherige externe Aufrufer bestimmt und nicht mit diesem Modell zu mischen.

### Authenticating and querying data

To authenticate and query data you can use the `shopify` const that is exported from `/app/shopify.server.js`:

```js
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);

  const response = await admin.graphql(`
    {
      products(first: 25) {
        nodes {
          title
          description
        }
      }
    }`);

  const {
    data: {
      products: { nodes },
    },
  } = await response.json();

  return nodes;
}
```

This template comes pre-configured with examples of:

1. Setting up your Shopify app in [/app/shopify.server.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/shopify.server.ts)
2. Querying data using Graphql. Please see: [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx).
3. Responding to webhooks. Please see [/app/routes/webhooks.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/webhooks.app.uninstalled.tsx).
4. Using metafields, metaobjects, and declarative custom data definitions. Please see [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx) and [shopify.app.toml](https://github.com/Shopify/shopify-app-template-react-router/blob/main/shopify.app.toml).

Please read the [documentation for @shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router) to see what other API's are available.

## Shopify Dev MCP

This template is configured with the Shopify Dev MCP. This instructs [Cursor](https://cursor.com/), [GitHub Copilot](https://github.com/features/copilot) and [Claude Code](https://claude.com/product/claude-code) and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) to use the Shopify Dev MCP.

For more information on the Shopify Dev MCP please read [the documentation](https://shopify.dev/docs/apps/build/devmcp).

## Deployment

### Application Storage

This template uses [Prisma](https://www.prisma.io/) to store session data, by default using an [SQLite](https://www.sqlite.org/index.html) database.
The database is defined as a Prisma schema in `prisma/schema.prisma`.

This use of SQLite works in production if your app runs as a single instance.
The database that works best for you depends on the data your app needs and how it is queried.
Here’s a short list of databases providers that provide a free tier to get started:

| Database   | Type             | Hosters                                                                                                                                                                                                                                    |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MySQL      | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mysql), [Planet Scale](https://planetscale.com/), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/mysql) |
| PostgreSQL | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-postgresql), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/postgres)                                   |
| Redis      | Key-value        | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-redis), [Amazon MemoryDB](https://aws.amazon.com/memorydb/)                                                                                                        |
| MongoDB    | NoSQL / Document | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mongodb), [MongoDB Atlas](https://www.mongodb.com/atlas/database)                                                                                                  |

To use one of these, you can use a different [datasource provider](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#datasource) in your `schema.prisma` file, or a different [SessionStorage adapter package](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/guides/session-storage.md).

### Build

Build the app by running the command below with the package manager of your choice:

Using yarn:

```shell
yarn build
```

Using npm:

```shell
npm run build
```

Using pnpm:

```shell
pnpm run build
```

## Hosting

When you're ready to set up your app in production, you can follow [our deployment documentation](https://shopify.dev/docs/apps/launch/deployment) to host it externally. From there, you have a few options:

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run): This tutorial is written specifically for this example repo, and is compatible with the extended steps included in the subsequent [**Build your app**](tutorial) in the **Getting started** docs. It is the most detailed tutorial for taking a React Router-based Shopify app and deploying it to production. It includes configuring permissions and secrets, setting up a production database, and even hosting your apps behind a load balancer across multiple regions.
- [Fly.io](https://fly.io/docs/js/shopify/): Leverages the Fly.io CLI to quickly launch Shopify apps to a single machine.
- [Render](https://render.com/docs/deploy-shopify-app): This tutorial guides you through using Docker to deploy and install apps on a Dev store.
- [Manual deployment guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service): This resource provides general guidance on the requirements of deployment including environment variables, secrets, and persistent data.

When you reach the step for [setting up environment variables](https://shopify.dev/docs/apps/deployment/web#set-env-vars), you also need to set the variable `NODE_ENV=production`.

### Render Setup For This App

This repository includes a `render.yaml` blueprint for quick deployment on Render.

Recommended setup for team testing:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint instance from the repository.
3. Confirm the web service is created from `render.yaml`.
4. Set these environment variables in Render:
  - `SHOPIFY_API_KEY`
  - `SHOPIFY_API_SECRET`
  - `SHOPIFY_APP_URL`
  - `SCOPES`
5. Keep the persistent disk mounted at `/opt/render/project/src/data`.
  - This app currently uses SQLite for Shopify session storage.
  - The mounted disk keeps `data/dev.sqlite` across restarts.
6. After the first successful deploy, copy the Render service URL.
7. Update `shopify.app.toml` with the Render URL for:
  - `application_url`
  - `auth.redirect_urls`
  - `app_proxy.url`
8. Run `npm run deploy` locally to publish the updated Shopify app config.
9. Install the app on the target shop.

Notes:

- `buildCommand` on Render runs `npm install && npm run build`.
- `startCommand` on Render can run `npm run start`; the `prestart` hook runs Prisma setup and session-table checks before server boot.
- For long-term production use, PostgreSQL is recommended over SQLite.

## Gotchas / Troubleshooting

### Database tables don't exist

If you get an error like:

```
The table `main.Session` does not exist in the current database.
```

Create the database for Prisma. Run the `setup` script in `package.json` using `npm`, `yarn` or `pnpm`.

### Navigating/redirecting breaks an embedded app

Embedded apps must maintain the user session, which can be tricky inside an iFrame. To avoid issues:

1. Use `Link` from `react-router` or `@shopify/polaris`. Do not use `<a>`.
2. Use `redirect` returned from `authenticate.admin`. Do not use `redirect` from `react-router`
3. Use `useSubmit` from `react-router`.

This only applies if your app is embedded, which it will be by default.

### Webhooks: shop-specific webhook subscriptions aren't updated

If you are registering webhooks in the `afterAuth` hook, using `shopify.registerWebhooks`, you may find that your subscriptions aren't being updated.

Instead of using the `afterAuth` hook declare app-specific webhooks in the `shopify.app.toml` file. This approach is easier since Shopify will automatically sync changes every time you run `deploy` (e.g: `npm run deploy`). Please read these guides to understand more:

1. [app-specific vs shop-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions)
2. [Create a subscription tutorial](https://shopify.dev/docs/apps/build/webhooks/subscribe/get-started?deliveryMethod=https)

If you do need shop-specific webhooks, keep in mind that the package calls `afterAuth` in 2 scenarios:

- After installing the app
- When an access token expires

During normal development, the app won't need to re-authenticate most of the time, so shop-specific subscriptions aren't updated. To force your app to update the subscriptions, uninstall and reinstall the app. Revisiting the app will call the `afterAuth` hook.

### Webhooks: Admin created webhook failing HMAC validation

Webhooks subscriptions created in the [Shopify admin](https://help.shopify.com/en/manual/orders/notifications/webhooks) will fail HMAC validation. This is because the webhook payload is not signed with your app's secret key.

The recommended solution is to use [app-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions) defined in your toml file instead. Test your webhooks by triggering events manually in the Shopify admin(e.g. Updating the product title to trigger a `PRODUCTS_UPDATE`).

### Webhooks: Admin object undefined on webhook events triggered by the CLI

When you trigger a webhook event using the Shopify CLI, the `admin` object will be `undefined`. This is because the CLI triggers an event with a valid, but non-existent, shop. The `admin` object is only available when the webhook is triggered by a shop that has installed the app. This is expected.

Webhooks triggered by the CLI are intended for initial experimentation testing of your webhook configuration. For more information on how to test your webhooks, see the [Shopify CLI documentation](https://shopify.dev/docs/apps/tools/cli/commands#webhook-trigger).

### Incorrect GraphQL Hints

By default the [graphql.vscode-graphql](https://marketplace.visualstudio.com/items?itemName=GraphQL.vscode-graphql) extension for will assume that GraphQL queries or mutations are for the [Shopify Admin API](https://shopify.dev/docs/api/admin). This is a sensible default, but it may not be true if:

1. You use another Shopify API such as the storefront API.
2. You use a third party GraphQL API.

If so, please update [.graphqlrc.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/.graphqlrc.ts).

### Using Defer & await for streaming responses

By default the CLI uses a cloudflare tunnel. Unfortunately cloudflare tunnels wait for the Response stream to finish, then sends one chunk. This will not affect production.

To test [streaming using await](https://reactrouter.com/api/components/Await#await) during local development we recommend [localhost based development](https://shopify.dev/docs/apps/build/cli-for-apps/networking-options#localhost-based-development).

### "nbf" claim timestamp check failed

This is because a JWT token is expired. If you are consistently getting this error, it could be that the clock on your machine is not in sync with the server. To fix this ensure you have enabled "Set time and date automatically" in the "Date and Time" settings on your computer.

### Using MongoDB and Prisma

If you choose to use MongoDB with Prisma, there are some gotchas in Prisma's MongoDB support to be aware of. Please see the [Prisma SessionStorage README](https://www.npmjs.com/package/@shopify/shopify-app-session-storage-prisma#mongodb).

### Unable to require(`C:\...\query_engine-windows.dll.node`).

Unable to require(`C:\...\query_engine-windows.dll.node`).
The Prisma engines do not seem to be compatible with your system.

query_engine-windows.dll.node is not a valid Win32 application.

**Fix:** Set the environment variable:

```shell
PRISMA_CLIENT_ENGINE_TYPE=binary
```

This forces Prisma to use the binary engine mode, which runs the query engine as a separate process and can work via emulation on Windows ARM64.

## Resources

React Router:

- [React Router docs](https://reactrouter.com/home)

Shopify:

- [Intro to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [Shopify App React Router docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge-library).
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components).
- [App extensions](https://shopify.dev/docs/apps/app-extensions/list)
- [Shopify Functions](https://shopify.dev/docs/api/functions)

Internationalization:

- [Internationalizing your app](https://shopify.dev/docs/apps/best-practices/internationalization/getting-started)
