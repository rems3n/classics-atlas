# Classics Atlas — portable v1

## Public web edition

The repository's root `index.html` is the self-contained website entry point for GitHub Pages. The complete editable source tree, saved data, build scripts, tests, and optional Railway configuration are included in `classics-atlas-source.zip`. Extract that archive before following the development instructions below. Raw network caches are intentionally excluded.

A functional, local-first literary atlas with a searchable Penguin Classics title index, interactive world map and globe, shared filters, 50-year timeline controls, a map-first docked UI with subtle glass controls, light/dark themes, personal shelves and ratings.

### V1.1 layout revision

The promotional headline has been removed completely. Search sits in a toolbar above the map; filters are closed by default and open into a left dock on desktop. The book list uses a right dock, and the timeline occupies a slim strip below the map. The projection resizes to the actual available map canvas when either dock changes. Small zoom/projection controls retain the glass treatment. Mobile starts with books closed and opens them below the map, rather than on top of it. Dense count markers group nearby countries and deduplicate work IDs; click a dashed-ring group to zoom in. Country fills remain individual country counts.

## Run

Open `dist/classics-atlas.html` in a modern browser. It contains its scripts, map geometry, and catalog. No API keys, server, package installation, or build step is required. Cover images and optional Google Fonts need internet; system fonts and labeled title art are automatic fallbacks. For reliable browser storage, a local server or hosted static origin is preferable to `file://`.

Alternatively, from the project folder:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/classics-atlas.html`.

In the extracted source folder, `npm start` serves the app at http://localhost:3000 (or `$PORT`). A Dockerfile and railway.json are included; see DEPLOY.md. Railway deployment remains optional and has not been configured.

## Features

- Pan/zoom world map; rotate and zoom globe; clickable countries and count markers.
- Ten categories, fiction/nonfiction, cultural tradition, original language, country, and date filters.
- Country shading by count, leading category, earliest work, or leading language.
- Schematic Ancient Greek cross-border highlight, clearly distinguished from historical borders.
- Drag across the timeline ruler in either direction to select a range; release to filter the map and books. Click any year for a centered 200-year window (1600 selects 1500–1700), shifted inward at the timeline edges. A live selection preview, 50-year snapping, touch/pointer support, and Escape-to-cancel are included. Existing handles, numeric inputs, era shortcuts, and chronological list remain available. Keyboard users can focus the ruler, choose a year with arrow keys, and press Enter for a 200-year window.
- All 1,430 catalog entries have a date or range; unlocated entries remain searchable. Missing non-date metadata is explicit.
- Read status (Want to read, Reading, Read), personal 1–5-star ratings; click a selected star again to clear.
- Browser-local persistence plus JSON backup export/import. Selecting Remove from shelf removes that item and its rating; exports are recommended.
- Shareable URL state when hosted; portable view codes when opened as a file. Shelf and ratings are excluded.
- Local phrase search, editable filter chips, and Undo. Try `Greek poetry before the 4th century BC`, `Japanese novels`, `French nonfiction`, or an author/title. This is a deterministic parser, **not a connected LLM**. Unsupported page-count and similarity requests explain the limitation.
- Responsive docked panels, light/dark themes, reduced-transparency option, keyboard-accessible controls.

## Data boundaries — important

The complete **linked Wikipedia list**, not the complete current Penguin catalog, was imported on 2026-09-18. Some known books are absent from that source. Known exact duplicate titles/translations and the Gilgamesh/Divine Comedy groups are consolidated; broader equivalence across differently named selections needs further editorial reconciliation. The index contains **1,430 records**. This build has **1,430 dated works, 641 mapped works, 1,055 classified works, and 756 online cover matches**. Of those cover matches, 638 reference Penguin-family edition records; 118 are explicitly labeled alternate editions. This is not complete metadata coverage. See data/coverage.json and data/unresolved.json for exact machine-readable coverage.

The data is **not a finished, independently verified bibliographic dataset**. Wikipedia infoboxes and short descriptions, structured Wikidata work facts, and Open Library records supplement the 62 editorial seed annotations. Each imported book exposes source links and extraction methods. Classifications and broad literary-tradition groups are rule-mapped and need review. New map associations use explicit Wikidata residence/work locations intersected with modern Natural Earth polygons, or inherit a documented association from another annotated work by the same author. These are not exhaustive lifetime itineraries and are not verified as the composition location of each volume. Birthplace, citizenship, and story setting are not used as geographic substitutes. Several works have more than one associated country, so country counts must not be added to derive a global total. Small territories such as Guernsey may be selectable but lack a separate polygon at this map scale.

Dates are original publication/composition ranges and match on interval overlap. They are not Penguin edition dates. All 505 previously undated records now have individually assigned dates or ranges, and an invalid year-zero interval has been corrected. **c.** identifies estimated ranges; **Likely** identifies probable publication dates. Details explain the assignment and link references. Anthologies and letters generally use spans of the original writings, not a modern editor's lifetime. Some oral traditions use approximate recording/transmission spans where composition cannot be dated. These are browsing estimates, not a claim of bibliographic certainty. Collected works count as one catalog item; complete component-work/edition modeling remains future work. See `DATE_AUDIT.md` for all 506 reviewed assignments. The optional undated filter is retained for future imports, but currently no entries are undated.

Cover images are lazy-loaded directly from Open Library, with source attribution and selected-edition publisher, date, and ISBN where provided. Matches use normalized title and author names; carefully limited long-title-only matches for unattributed collections are flagged for review. Covers may differ across printings. Penguin-family publisher metadata does not guarantee a Penguin Classics imprint. A failed or unmatched image falls back to **clearly labeled title art**. Edition-detail endpoints did not return usable page-count data during this run, so page lengths and Goodreads scores remain unavailable; neither is fabricated.

The Aegean overlay is a schematic circular cultural lens, not a reconstructed historical frontier, and does not imply that a work was composed everywhere it covers. Natural Earth represents modern generalized de facto boundaries, not ancient states. Era shortcuts are browsing conveniences and are not universal periodizations of all cultures.

## Privacy and persistence

There is no backend, authentication, account synchronization, telemetry, or cloud shelf storage. Browser storage can be cleared, blocked, or tied to a specific local-file path. Export backups from Data notes. Import merges known IDs and validates values; incoming valid records replace the same IDs. Shared searches never include your reading data. External reference links open third-party websites. Loading covers sends ordinary image requests to Open Library; optional Google Fonts requests expose ordinary connection metadata to Google. Shelf data is never sent with these requests.

## Rebuild and test

The app uses plain HTML/CSS/JavaScript and bundled D3 7.9.0. A Python-standard-library build embeds the data and source into one HTML file.

```sh
python3 scripts/build.py
node --test tests/core.test.cjs
```

For the simulated-DOM integration checks, run `npm install` and then `npm run test:ui`. These tests verify UI event wiring, not real browser rendering or touch ergonomics. See `TEST_REPORT.md` for the actual validation performed.

Edit `src/style.css` for shared components, `src/layout.css` for the revised docked shell and responsive layout, `src/app.js` for UI/map, `src/core.js` for tested filter/search/share logic, and `data/enrichment.tsv` for starter metadata. The saved source HTML makes catalog builds reproducible. `data/catalog.json` is regenerated by the build. The build prints unmatched seed records rather than silently adding books absent from the supplied catalog.

Real-browser checks are in `tests/browser.test.cjs`. They use Playwright plus an optional `@sparticuz/chromium` binary. Provide the documented environment paths in the test or install those optional test dependencies. Set `ATLAS_SCREENSHOT_DIR` to an existing directory to capture desktop light/dark and mobile screenshots. These dependencies are not needed to run the delivered website.

## Production roadmap

1. Reconcile the Wikipedia index against a publisher-backed inventory, model works/collections/editions/translations separately, and audit sources field by field.
2. Review automatic cover/ISBN matches and resolve remaining gaps. Obtain reliable selected-edition page counts and integrate external ratings only through a permitted source.
3. Replace schematic cultural lenses with sourced, time-aware geographic associations and independently review disputed/uncertain locations.
4. Connect server-side structured AI search that validates outputs against the same filter schema. Never put secret API keys in this HTML.
5. Add account authentication and per-user database policies for private cross-device shelves; provide export/delete controls.
6. Complete real-browser visual/accessibility/performance QA, then publish to a static host or migrate to an application framework as backend requirements grow.

## Attribution

- Catalog: https://en.wikipedia.org/wiki/List_of_Penguin_Classics — Wikimedia contributors, CC BY-SA 4.0. The title index was parsed and normalized; translations grouped as documented. Full snapshot retained in `data/penguin-list.html`.
- Geography: Natural Earth `ne_110m_admin_0_countries.geojson`, fetched from https://github.com/nvkelso/natural-earth-vector — public domain; properties trimmed and coordinates rounded for packaging. Source file retained.
- D3: https://d3js.org — copyright Mike Bostock, ISC license; see `vendor/LICENSE-D3.txt`.
- Original application code and editorial summaries were created for this project. Cover artwork is linked from Open Library, not embedded or bulk-downloaded; copyright remains with the respective rights holders. The project does not claim a redistribution license for artwork. This independent project is not affiliated with or endorsed by Penguin Random House.
