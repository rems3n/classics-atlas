# Current validation — September 20, 2026

- 26 core tests pass, including all exact historical cutoffs, linked era selections, preserved 50-year brush behavior and embedded spherical geometry at three globe rotations.
- 13 source-data checks pass. All 1,479 stable catalog entries still have dates and renderable locations; coverage is now 965 cover links.
- Simulated desktop/mobile UI regression covers default-open filters, all 12 maps applying book cutoffs, automatic era highlighting, six African center markers, date dialog opening/closing, drag/click ranges, chronology, search, shelves/ratings, and sharing. Live Chromium verification confirmed the sidebar/date-dialog layout, AD 1600 filtering to 367 works, visible African centers and hatching, light/dark themes, and the wide date picker. Live pointer checks confirmed a 1600 click selects 1500–1700 and a forward drag selects 50–500 AD; Medieval selects AD 500–1500 and the available 1492 map. A narrow-sidebar era overflow was found and corrected with wrapped buttons.
- Three newly matched cover files were fetched and visually inspected. The alternate Seneca volume did not sufficiently match and was replaced with a sourced Penguin edition record. This is a sample review, not an exhaustive image-content audit.
- This environment blocks local-file browser previews. This release does not claim new physical mobile, Safari, or Firefox verification. Earlier reports below describe earlier releases and should not be interpreted as current layout evidence.

---

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
- Expanded-catalog build: 1,430 stable work IDs, 1,430 dates/ranges, zero undated entries, 1,430 mapped works (zero unplaced), 1,055 classifications, 1,000 language records, and 756 cover matches (638 Penguin-family editions).
- Eight Python source-data regression tests: empty infobox fields, original/composition dates versus later translations, non-Latin author identity, cover/edition integrity, coverage totals, early-AD/BC-century parsing, complete date coverage with no year zero, and explicit date-assignment provenance. These validate consistency, not the historical accuracy of every estimate.
- Node static-host checks: root HTML, health endpoint, ETag revalidation, HEAD, source/cache isolation, and disallowed HTTP methods.
- A real Middlemarch cover was retrieved from its recorded Covers API URL with HTTP 200 and verified as a 128×198 JPEG. Browser rendering, edition attribution, source disclosures, and broken-image fallback passed using that downloaded image as a test fixture.

## Network-related limitations

Direct remote-cover loading in this sandbox's Chromium timed out, including with its configured proxy. The separate HTTP download succeeded; the rendering test used the actual downloaded image, not fabricated cover art. All 756 remote images were **not** exhaustively downloaded or visually inspected. Open Library discourages bulk cover crawling, so normal browser lazy loading is retained.

Edition-detail endpoints did not produce usable page-count data during this run. The UI continues to display unknown page lengths; it does not substitute first-edition or work-level page counts.

## Not completed

- Exhaustive cross-browser, accessibility, and physical-device gesture testing. Chromium checks do not substitute for Safari/Firefox or physical touch-device validation.
- Authenticated accounts, cross-device sync, live AI, verified page lengths, and Goodreads integration. The public static app is hosted on GitHub Pages at https://rems3n.github.io/classics-atlas/; Railway configuration remains optional and unconfigured.
- Full independent editorial verification and complete cover coverage. Geographic coverage is complete through documented associations and labeled origin/tradition fallbacks. Date coverage is complete through sourced dates and clearly labeled estimates, not exhaustive independent verification. Imported facts and automatic image matches expose their provenance and uncertainty; unresolved.json lists remaining non-date gaps.

This is a portable working prototype with Chromium layout/interaction coverage, not a complete production catalog or a fully cross-browser-certified release.

## Complete geographic coverage update

- 9 data tests, 17 core tests, UI integration checks and static-host checks passed.
- Every one of 1,430 works contributes to country counts; every assigned code has a map polygon or point marker.
- Translator-origin regressions cover Egyptian texts, the Quran and The Tale of the Heike.
- Small-territory checks cover Bermuda results; Guernsey and Saint Kitts and Nevis have explicit marker coordinates.
- No IDs or dates changed; shelves remain compatible. Covers remain 756.
- Mapping decisions and source notes are reproducible through scripts/complete_mapping.py and documented in MAPPING_AUDIT.md.

## Story-origin review

- 14 reviewed entries use source-tradition or original-composition ranges, with later versions separate.
- 10 data tests, 18 core tests, and the UI integration suite pass.
- Regression checks place Manas in a medieval query, African Myths in an ancient query, and Narayan’s Rama source tradition before the Common Era; later publication windows do not match those primary dates.
- Book details show separate version dates and uncertain component origins. Explore this period updates the date filters and closes the dialog.
- 1,430 unique IDs, 1,430 mapped works, 1,430 dated works and 756 covers remain.

## World-classics expansion

- 11 data tests, 21 core tests, and the UI integration suite pass.
- All 1,479 entries are dated and mapped; all 1,430 baseline IDs remain.
- New checks cover all four Chinese novels, alternate English titles, apostrophes, collection filters, share round-trips, and geographic counts.
- UI checks include all four title searches, 100 Years of Solitude, the Four Great Classics collection, Murty filtering, selected-edition page counts, and existing desktop/mobile controls and shelves.
- Coverage: 49 additions, 787 cover links (31 new publisher covers), 12 selected-edition page counts; unavailable metadata remains explicit.

## Geography QA and historical maps — 20 September 2026

13 data tests, 25 core tests, and extended UI integration checks passed. All 12 historical snapshots generate real SVG geometry. Origin versus association filtering/counts, Seneca regression, map-year independence, historical source dialog/date shortcut, share state, modern-mode restoration, dark/globe mode and mobile marker controls are covered. Every named source polygon was checked for inverted winding. See GEOGRAPHY_QA.md for audit scope and limitations. Live-site checks verified the Borders control, source dialog, 200-year date shortcut, Seneca’s Spain origin, zero Seneca matches in France in origin mode, and three in broader-association mode. Light flat-map and dark globe renders were inspected; a tiny-ring globe artifact was corrected and covered by a new packaged-geometry regression. Full historical accuracy is not claimed.

Live QA also found and corrected the stale combined-author overview/search alias for The Apocolocyntosis / The Satyricon, and Reset now clears the search input and reply as well as the active filters.
