# Classics Atlas — reader beta

The next release adds ten curated reading paths, thirteen featured books, private reader accounts, cross-device synchronization, personal reading atlases, editable collections, related-book discovery, and edition/library guidance. The catalog now contains 1,492 dated and mapped records. Existing work IDs and local shelf backups remain compatible.

Public account edition: https://atlas-web-production-b852.up.railway.app

## Reader features

- **Book guidance:** a consistent “Before you begin” section; original path annotations; general form-based reading advice; translation/edition checks; private notes; favorites; related works and stable book links.
- **Reading paths:** Oxford/Balliol preparation, St. John’s-inspired Eastern and Middle Eastern selections, Harvard world-literature and ChinaX selections, Yale Don Quixote, named African and Latin American expert selections, China’s four novels, and a passage-based starter path. Source scope, adaptation, excerpt/abridgment status and unmatched items are explicit. Completing an assignment never marks an entire book read.
- **Accounts and My Atlas:** optional accounts with Google sign-in or username/password; recovery codes for password accounts; cloud shelf, ratings, notes, favorites and path progress; explicit guest-data migration; private reading statistics and map/timeline views.
- **Collections:** create, reorder, annotate, copy, save books, map and share. Private by default; unlisted and public require an account. Private notes and ratings are excluded. Public discovery and server-rendered title/description previews are supported.
- **Discovery:** filter by tradition/form, exclude read books, or find metadata-based connections from a known book. “Similar to The Odyssey” and unread phrase searches work. This is not an LLM or an external ratings service.
- **Edition and availability guidance:** source-linked course edition notes, completeness/translation guidance, and library/edition search links. Individual availability and external ratings are not fabricated.

## Development and hosting

Editable source now lives directly in the repository. Node 24.14+ runs the backend without runtime npm dependencies. Python 3 rebuilds the self-contained public app:

```sh
python3 scripts/build.py
npm test
npm start
```

`npm start` opens port 3000. `ATLAS_DB` chooses the SQLite database file; in production it is required and must point to persistent storage. Railway uses one replica and a volume at `/data`, with `ATLAS_DB=/data/atlas.sqlite`. Docker initializes ownership and runs Node as the unprivileged `node` user. The same `index.html` remains usable on static hosting; accounts and published collections require the backend.

Google sign-in uses OAuth 2.0 with PKCE, a one-time state bound to the browser by cookie, and ID-token issuer, audience, expiry and nonce checks. It requests only the `openid` scope and stores only Google's account ID; Google accounts get a random `reader-xxxxxx` username so public collections never show an email address. It is off unless `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; see DEPLOY.md. Password authentication uses scrypt password hashes, random hashed session tokens in HttpOnly SameSite cookies, recovery-code rotation, expiry, mutation-origin checks and rate limiting. Per-user state uses optimistic revisions to prevent silent overwrite across devices. Failed writes are retained in a local pending backup; conflicts require an explicit choice. Account deletion removes cloud data and published collections. Guest JSON backups remain supported; v2 export includes paths, favorites, notes and private collections.

Hourly SQLite backups retain the latest seven daily snapshots on the same volume, written atomically with owner-only permissions. These are recovery aids, not an independent disaster-recovery backup. Export volume snapshots off-service before a wider public launch. Server database files, credentials and user data are excluded from Git.

## Validation and remaining scope

`npm test` covers the filter/map regressions, backend account and privacy integration, and server checks for health, caching, compression, origin checks and input validation. `npm run test:ui` runs the jsdom UI suite, and `python3 tests/data.test.py` runs the source-data checks. See [DEPLOY.md](DEPLOY.md) for production verification, backups and restore. `npm run test:reader` runs the new Playwright flows; set `ATLAS_PLAYWRIGHT_PATH`, `ATLAS_CHROMIUM_PATH` and `ATLAS_BROWSER_EXECUTABLE` for your installed browser runtime. It checks excerpt progress, map filters, notes, favorites, atlas, collection editing, sign-up, guest migration, reload sync, anonymous collection access, dark theme and mobile overflow.

Known limits: the source lists are accurately scoped selections, not complete Oxford/Harvard degrees. Seven course resources/topics remain unmatched to standalone catalog entries. General reading guidance is not an independently rated difficulty score. Full translation comparisons, public-review moderation, email recovery, Goodreads import, custom share images and LLM search remain future work. The thirteen path additions do not yet have verified cover matches; existing cover coverage is preserved.

Download the current complete source from [GitHub](https://github.com/rems3n/classics-atlas/archive/refs/heads/main.zip). Historical data license and original snapshots are included under `data/historical/`.

---

## Earlier v1 reference (historical)

The following records describe the pre-reader release and its data pipeline. Current behavior and counts are above.

### Portable v1 archive notes

## Public web edition

The repository's root `index.html` is the self-contained website entry point for GitHub Pages. The complete editable source tree, saved data, build scripts, tests, and optional Railway configuration are included in `classics-atlas-source.zip`. Extract that archive before following the development instructions below. Raw network caches are intentionally excluded.

A functional, local-first literary atlas with a searchable Penguin Classics index and wider world-classics collection, interactive world map and globe, shared filters, 50-year timeline controls, a map-first docked UI with subtle glass controls, light/dark themes, personal shelves and ratings.

### Current layout

The promotional headline has been removed completely. Search sits in a toolbar above the map; filters start open in a left dock on desktop. The book list uses a right dock with an Expand collection / Collapse collection button. Expanding reveals a wider multi-column grid on large screens, a full reading area on tablets, and an unrestricted list below the map on mobile; selected country and filters stay intact. Book notes follow a consistent reading order: overview and key facts, reading controls, date history, geography, edition details, then expandable provenance. Time & borders lives at the top of the left sidebar; its date card opens a large draggable date picker. There is no bottom timeline strip. Mobile uses a bounded, scrollable filter section above the map. The projection resizes to the actual available map canvas when either dock changes. Small zoom/projection controls retain the glass treatment. Mobile starts with books closed and opens them below the map, rather than on top of it. Dense count markers group nearby countries and deduplicate work IDs; click a dashed-ring group to zoom in. Country fills remain individual country counts.

## Geographic QA and historical borders

The Borders selector offers 12 actual dated snapshots, from Egypt in 1500 BC to the Ottoman, Mughal and Ming worlds in AD 1600. Selecting a historical map filters books up to its exact snapshot year. Era shortcuts and custom dates select the latest available snapshot at or before the end year (modern borders beyond 1700 or before the earliest snapshot). Custom date ranges remain exact even when no map matches their end year; the separate border date is always shown. Historical colors identify source polities; book markers still count modern geographic regions. Origin is now separated from broader residence/travel associations. See [GEOGRAPHY_QA.md](GEOGRAPHY_QA.md) for the full QA scope, corrections, period choices, sources, and limitations.

## Run

Open `dist/classics-atlas.html` in a modern browser. It contains its scripts, map geometry, and catalog. No API keys, server, package installation, or build step is required. Cover images and optional Google Fonts need internet; system fonts and labeled title art are automatic fallbacks. For reliable browser storage, a local server or hosted static origin is preferable to `file://`.

Alternatively, from the project folder:

```sh
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/classics-atlas.html`.

In the extracted source folder, `npm start` serves the app at http://localhost:3000 (or `$PORT`). A Dockerfile and railway.json are included; see DEPLOY.md. Railway deployment remains optional and has not been configured.

## Features

- Pan/zoom world map; drag to rotate the globe and pinch with two fingers to zoom on a trackpad or touchscreen. Mouse-wheel and +/− controls also work. Countries and count markers remain clickable.
- Ten categories, fiction/nonfiction, cultural tradition, original language, source collection, country, and date filters.
- Country shading by count, leading category, earliest work, or leading language.
- Twelve sourced historical basemaps with dated snapshots, inspectable political/cultural regions, explicit hatching for coverage gaps, six additional African historical centers in AD 1600, and source notes; a schematic Greek lens remains available only in modern mode.
- Drag across the timeline ruler in either direction to select a range; release to filter the map and books. Click any year for a centered 200-year window (1600 selects 1500–1700), shifted inward at the timeline edges. A live selection preview, 50-year snapping, touch/pointer support, and Escape-to-cancel are included. Existing handles, numeric inputs, era shortcuts, and chronological list remain available. Keyboard users can focus the ruler, choose a year with arrow keys, and press Enter for a 200-year window.
- All 1,479 catalog entries have dates/ranges and map locations. Missing classification, cover and edition metadata remains explicit.
- Read status (Want to read, Reading, Read), personal 1–5-star ratings; click a selected star again to clear.
- Browser-local persistence plus JSON backup export/import. Selecting Remove from shelf removes that item and its rating; exports are recommended.
- Shareable URL state when hosted; portable view codes when opened as a file. Shelf and ratings are excluded.
- Local phrase search, editable filter chips, and Undo. Try `Greek poetry before the 4th century BC`, `Japanese novels`, `French nonfiction`, or an author/title. This is a deterministic parser, **not a connected LLM**. Unsupported page-count and similarity requests explain the limitation.
- Responsive docked panels, light/dark themes, reduced-transparency option, keyboard-accessible controls.

## Data boundaries — important

The complete **linked Wikipedia list**, not the complete current Penguin catalog, was imported on 2026-09-18. Some known books are absent from that source. Known exact duplicate titles/translations and the Gilgamesh/Divine Comedy groups are consolidated; broader equivalence across differently named selections needs further editorial reconciliation. The expanded index contains **1,479 records**: the original 1,430 plus 49 curated additions. This build has **1,479 dated works, 1,479 mapped works, 1,105 classified works, and 1,130 cover links**. The expansion adds 31 publisher-listed covers and 12 selected-edition page counts. See [EXPANSION_AUDIT.md](EXPANSION_AUDIT.md) for every new title, date, region, and source. The September 21 cover pass searches the 514 remaining gaps and adds 165 Penguin-family edition matches after rejecting 10 wrong or unresolved volume/translation candidates. Coverage is now 1,130 (1,099 Open Library links plus 31 publisher-listed covers), with 349 still unmatched. 845 selected-edition records reference Penguin-family publishers. The previous September 20 pass added 178 matches. Other editions are labeled explicitly. This is not complete metadata coverage. See data/coverage.json and data/unresolved.json for exact machine-readable coverage.

The data is **not a finished, independently verified bibliographic dataset**. Wikipedia infoboxes and short descriptions, structured Wikidata work facts, and Open Library records supplement the 62 editorial seed annotations. Each imported book exposes source links and extraction methods. Classifications and broad literary-tradition groups are rule-mapped and need review. All 1,479 entries now have mapped locations. The default uses author origin or birthplace where resolved, then documented career or original literary/cultural context. Broader residence/travel associations are separately selectable. This review changed 298 records; 217 retained geographic fallbacks are explicitly not independently verified birthplaces. Anonymous works and anthologies follow source traditions, not translator or editor nationality. Ambiguous and representative regional choices are explained in book notes and MAPPING_AUDIT.md. These are discovery associations, not exhaustive itineraries or verified composition locations. Several works have more than one associated country, so country counts must not be added to derive a global total. Guernsey, Bermuda and Saint Kitts and Nevis have clickable point markers where the generalized map omits their polygons.

Dates are original publication/composition ranges and match on interval overlap. They are not Penguin edition dates. All 505 previously undated records now have individually assigned dates or ranges, and an invalid year-zero interval has been corrected. **c.** identifies estimated ranges; **Likely** identifies probable publication dates. Details explain the assignment and link references. Anthologies and letters generally use spans of the original writings, not a modern editor's lifetime. Reviewed oral tales and retellings use estimated source-tradition ranges. Later recording, compilation and adaptation dates remain separately visible; partial story/tradition breakdowns explain mixed-age collections. First tellings may be unknowable, and editorial contextual ranges are explicitly tentative. These are browsing estimates, not a claim of bibliographic certainty. Collected works count as one catalog item; complete component-work/edition modeling remains future work. See `DATE_AUDIT.md` for the current reviewed assignments and `TRADITION_DATE_AUDIT.md` for the story-origin review. The optional undated filter is retained for future imports, but currently no entries are undated.

Cover images are lazy-loaded from publisher product-page image hosts or Open Library, with source attribution and selected-edition publisher, date, and ISBN where provided. Matches use normalized title and author names; carefully limited long-title-only matches for unattributed collections are flagged for review. Covers may differ across printings. Penguin-family publisher metadata does not guarantee a Penguin Classics imprint. A failed or unmatched image falls back to **clearly labeled title art**. Twelve publisher-backed page counts are available for selected editions. The remaining page lengths and all Goodreads scores remain unavailable; neither is fabricated.

The Aegean overlay is a schematic circular cultural lens, not a reconstructed historical frontier, and does not imply that a work was composed everywhere it covers. Natural Earth represents modern generalized de facto boundaries, not ancient states. Era shortcuts are browsing conveniences and are not universal periodizations of all cultures.

## Privacy and persistence

There is no backend, authentication, account synchronization, telemetry, or cloud shelf storage. Browser storage can be cleared, blocked, or tied to a specific local-file path. Export backups from Data notes. Import merges known IDs and validates values; incoming valid records replace the same IDs. Shared searches never include your reading data. External reference links open third-party websites. Loading covers sends ordinary image requests to Open Library or publisher image hosts; optional Google Fonts requests expose ordinary connection metadata to Google. Shelf data is never sent with these requests.

## Rebuild and test

The app uses plain HTML/CSS/JavaScript and bundled D3 7.9.0. A Python-standard-library build embeds the data and source into one HTML file.

```sh
python3 scripts/build.py
node --test tests/core.test.cjs
```

For the simulated-DOM integration checks, run `npm install` and then `npm run test:ui`. These tests verify UI event wiring, not real browser rendering or touch ergonomics. See `TEST_REPORT.md` for the actual validation performed.

Edit `src/style.css` for shared components, `src/layout.css` for the revised docked shell and responsive layout, `src/app.js` for UI/map, `src/core.js` for tested filter/search/share logic, and `data/enrichment.tsv` for starter metadata. The saved source HTML makes catalog builds reproducible. `data/catalog.json` is regenerated by the build. The build reports unmatched legacy seeds. Curated additions live in `data/expanded-catalog.json`; `scripts/expand_catalog.py` applies them and stable alternate-title annotations after the original import.

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
- Original application code and editorial summaries were created for this project. Cover artwork is linked from publishers and Open Library, not embedded or bulk-downloaded; copyright remains with the respective rights holders. The project does not claim a redistribution license for artwork. This independent project is not affiliated with or endorsed by Penguin Random House.

Historical data: Alexandre Ourednik and contributors, Historical Basemaps, GPL-3.0. Original snapshots, full license, pinned revision and transformation script are included in the source archive.
