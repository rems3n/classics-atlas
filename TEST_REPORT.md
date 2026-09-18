# Validation report — 2026-09-18

## Passed

- Timeline brush update: 17 core tests and simulated-DOM checks passed, including forward/reverse 50–500 AD drags, 1600 → 1500–1700 click, edge clamping, cancellation, secondary-pointer isolation, keyboard selection, result filtering, and preserved numeric controls. The browser cannot open local file previews in this environment; live-site verification follows publishing. Physical touch-device testing remains outstanding.

- Reproducible Python-standard-library build of the self-contained HTML.
- JavaScript syntax checks on core and UI sources.
- 16 Node tests: date-confidence display and complete date coverage, unique catalog IDs, 10-category bound, Greek poetry before the fourth century BC, before/after BC and AD century boundaries, uncertain date overlap, strict boundary exclusion, unknown metadata behavior, cross-border counting, private share serialization, malformed state normalization, fiction/nonfiction disambiguation, unsupported search requests, shelf filtering, keyword fallback, and translation grouping.
- jsdom simulated-browser integration: application initialization, 177 real country SVG paths, 1,430 title records, paginated book cards, local phrase search/undo, country/culture filtering and empty results, map color choice, theme switching, globe/map switching, shelf/status changes, personal ratings, persistence across a simulated reload, book-detail dialogs, share privacy, mobile filter controls, timeline/list switching, numeric date controls, result-panel close/reopen, and data-notes dialog.
- Geographic winding sanity checked against D3 spherical areas.
- V1.1 regression checks confirm that the headline was removed from the DOM, filters start closed, filter-toggle accessibility state updates, and mobile results start closed.
- Real Chromium desktop (1440×900) and mobile (390×844) tests passed after obtaining a bundled test browser: measured panel/map separation, automatic map expansion, no horizontal mobile overflow, filters, Greek-poetry search, themes, globe switching, shelves/ratings, timeline, and view switching. Screenshots were visually inspected in light/dark desktop and mobile with/without book results.
- Expanded-catalog build: 1,430 stable work IDs, 1,430 dates/ranges, zero undated entries, 641 geographic associations, 1,055 classifications, 1,000 language records, and 756 cover matches (638 Penguin-family editions).
- Eight Python source-data regression tests: empty infobox fields, original/composition dates versus later translations, non-Latin author identity, cover/edition integrity, coverage totals, early-AD/BC-century parsing, complete date coverage with no year zero, and explicit date-assignment provenance. These validate consistency, not the historical accuracy of every estimate.
- Node static-host checks: root HTML, health endpoint, ETag revalidation, HEAD, source/cache isolation, and disallowed HTTP methods.
- A real Middlemarch cover was retrieved from its recorded Covers API URL with HTTP 200 and verified as a 128×198 JPEG. Browser rendering, edition attribution, source disclosures, and broken-image fallback passed using that downloaded image as a test fixture.

## Network-related limitations

Direct remote-cover loading in this sandbox's Chromium timed out, including with its configured proxy. The separate HTTP download succeeded; the rendering test used the actual downloaded image, not fabricated cover art. All 756 remote images were **not** exhaustively downloaded or visually inspected. Open Library discourages bulk cover crawling, so normal browser lazy loading is retained.

Edition-detail endpoints did not produce usable page-count data during this run. The UI continues to display unknown page lengths; it does not substitute first-edition or work-level page counts.

## Not completed

- Exhaustive cross-browser, accessibility, and physical-device gesture testing. Chromium checks do not substitute for Safari/Firefox or physical touch-device validation.
- Authenticated accounts, cross-device sync, live AI, verified page lengths, and Goodreads integration. The public static app is hosted on GitHub Pages at https://rems3n.github.io/classics-atlas/; Railway configuration remains optional and unconfigured.
- Full editorial verification and complete geographic/cover coverage. Date coverage is complete through sourced dates and clearly labeled estimates, not exhaustive independent verification. Imported facts and automatic image matches expose their provenance and uncertainty; unresolved.json lists remaining non-date gaps.

This is a portable working prototype with Chromium layout/interaction coverage, not a complete production catalog or a fully cross-browser-certified release.
