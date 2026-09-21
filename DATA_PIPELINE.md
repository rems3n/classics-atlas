# Cover enrichment — September 21, 2026

`scripts/cover_editions.py` queries cached, throttled Open Library metadata for the 514 uncovered entries. Queries constrain publisher to Penguin and normalize main titles while verifying authors for attributed books. Searches produced 175 candidates. Review excluded ten wrong or unresolved volume/translation/selection matches, retaining 165. Existing cover links and work IDs were preserved. Final coverage: 1,130 of 1,479; 349 remain without confident covers.

Candidate, accepted, and rejected audit files are `data/cover-review-2026-09-21.json`, `data/cover-accepted-2026-09-21.json`, and `data/cover-rejected-2026-09-21.json`. The accepted records are merged into `data/online-covers.json`; rebuilding uses this saved input. Running the research script only writes candidates and does not automatically accept them. Metadata matching is not a claim that every cover image has been visually reviewed. Publisher-family metadata does not guarantee the Classics imprint. Artwork stays linked to Open Library, loads lazily, and falls back to explicit title art on failure.

# Catalog enrichment

The full supplied Wikipedia index is retained. Dates now have explicit sourced or editorial assignments, with probable dates and estimated ranges visibly distinguished. Every work also has a geographic association: documented residence/work locations, author origin/birthplace, or a labeled original-work/anthology regional fallback. Origin is not presented as residence. Other metadata gaps remain explicit, including edition page counts and ratings.

## Reproducible build

`python3 scripts/build.py` combines the catalog snapshot, editorial seed rows, saved Wikipedia facts, saved Wikidata work/residence facts, and saved cover matches. It requires no network and writes catalog.json, coverage.json, unresolved.json, and the portable HTML. Existing work IDs are preserved, including IDs already used by personal shelves.

The build first runs `compile_date_decisions.py`: `date-decisions.json` contains explicit assignments for the 505 previously undated IDs; `date-verification.json` records source-supported exceptions to the default estimated/probable labels. The compiler produces `date-overrides.json` and `DATE_AUDIT.md`, including a separate Satyricon correction. The build fails if any catalog record remains undated. Edit the decision/verification inputs, not the generated catalog. `research_dates.py` is an optional, cached Wikipedia research helper; its results in `date-research.json` do not automatically establish dates.

## Refresh public sources

```sh
python3 scripts/enrich.py fetch-wiki
python3 scripts/enrich.py reparse
python3 scripts/enrich.py fetch-places
python3 scripts/enrich.py fetch-works
python3 scripts/enrich.py fetch-covers
python3 scripts/enrich.py rematch-covers
python3 scripts/enrich.py fetch-editions
python3 scripts/build.py
```

Requests are cached and throttled. HTTP 429 responses honor a numeric Retry-After header or wait at least 30 seconds. Failed batches are retained for later review. Cover-attempts records completed search attempts; clear selected IDs only after reviewing why a fresh lookup is needed. The optional edition-details step can be skipped: it was unable to retrieve usable page records in this environment and no page counts were imported.

Images are **not bulk downloaded**. The browser loads visible covers directly from the Covers API as Open Library requests: https://openlibrary.org/dev/docs/api/covers . A single Middlemarch image was downloaded solely for a rendering smoke test.

## Known limitations

- Wikipedia's list is not a publisher-backed inventory of every current Penguin edition.
- Title-level records group some editions/translations, not every alternate title and overlapping collection.
- Date intervals use available composition/publication evidence. Linked principal-work dates can stand in for collected-volume dates and are flagged; a complete component-work timeline is not modeled.
- Author residence/work statements can cover different life stages. Country counts are associations, not assertions that every book was written in every listed country.
- Natural Earth's coarse polygons omit some small/coastal places; unresolved coordinates are not snapped to a guessed neighboring country.
- Genre and tradition rules are browsing aids, not independent scholarly classification.
- Cover matching is automated; long anonymous-title matches and author-initial/name-variant matches are marked. Selected-edition publisher metadata can describe Penguin Random House imprints other than Penguin Classics.
- Covers are externally hosted and may fail. Their availability and copyright are not guaranteed by the catalog metadata.
- Missing fields, scores, and page counts remain unknown. See unresolved.json for the remaining work.

## Complete geographic mapping

The merge ends with `scripts/complete_mapping.py`. It preserves established associations, applies explicit work/author decisions from `data/mapping-decisions.json`, and resolves remaining named authors from cached biography origin fields. Historical empire labels are not treated as modern borders. Translated and anonymous texts use original source traditions. The generated `data/mapping-overrides.json` and `MAPPING_AUDIT.md` record methods and sources. The build fails if any work has no location or a country code lacks a polygon/point. `data/map-places.json` supplies small-territory markers.

## Story origins and later versions

`data/tradition-dates.json` overrides 14 reviewed traditional narratives and retellings after the older date decisions compile. The main date drives the existing timeline, sorting and filtering; `textDate` keeps a later version/recording reference separate. Optional `dateLayers` provide a partial source-tradition breakdown with notes and references. Their titles are searchable and dated layers have an Explore this period action. They do not create duplicate catalog records. Undated individual oral roots are explicit; no modern collection date is substituted for them. See `TRADITION_DATE_AUDIT.md` for old/new dates and limitations.

## Curated world-classics extension

After legacy mapping, `scripts/expand_catalog.py` applies title aliases and merges `data/expanded-catalog.json`. Coverage is calculated after this merge. `data/baseline-ids.json` protects the 1,430 original reading IDs. New works must have source provenance, a documented original date interval, a renderable country code, categories, and a collection label. Publisher cover links come from product-page metadata and are separately identified from Open Library matches. See EXPANSION_AUDIT.md for all 49 additions and limitations.

## Geography QA and historical context layers

After catalog expansion, `scripts/geography_qa.py` applies `data/origin-decisions.json` while preserving anonymous/anthology work overrides. It separates primary countries from associationCountries, records notes/sources, corrects three display attributions without changing IDs, and writes `data/geography-audit.json`. Saved explicit decisions avoid rerunning a nationality-word parser on historical empire names. Retained fallbacks are labeled in book details.

`scripts/historical_maps.py` embeds 12 pinned-source snapshots from `data/historical`, normalizing coordinates to six decimal places and trimming unused attributes. Original input geometry, license and revision are bundled. No historical book-country equivalence is inferred: book filters/counts use modern codes. Historical polygons provide a separate contextual layer with inspectable metadata. See GEOGRAPHY_QA.md.

## September 20: coverage, time controls, and cover enrichment

- `data/historical/review-1600.json` records six supplemental African centers and seven omitted anachronistic source labels, with historical references. `historical_maps.py` preserves original source files and incorporates those annotations only in the AD 1600 display. Gaps receive a distinct hatch on the modern coastline backdrop; no new borders are fabricated.
- `src/core.js` centralizes snapshot dates and era ranges. Map selection sets the inclusive upper date bound; custom range editing keeps its exact interval and selects an available snapshot. Book date ranges continue matching on overlap. Historic book counts are not claimed as imperial membership.
- Time & borders moves into the default-open sidebar. The wide date brush is in a dialog; the chronological book list has its own central view. Mobile filters occupy a bounded, scrollable section above the map.
- `scripts/more_covers.py` searches cached, rate-limited Open Library metadata. This pass searched all 692 entries that lacked cover links. Title annotations are normalized; author identity must match (or an anonymous long title must have a Penguin-family edition). Non-Penguin anthology matches with uncertain contents were withheld. Seneca’s rejected alternate volume was replaced by the verified Penguin ISBN 9780140442106 record.
- `data/cover-review-2026-09-20.json` contains 178 accepted new matches; the rejection file records 24 candidate rejections including the superseded Seneca image. No catalog IDs, original dates, shelf data, or existing cover choices changed. Cover updates also apply to the later-added world-classics records.
- Build totals: 1,479 works, 1,479 dates/ranges, 1,479 mapped works, 965 cover links. Image links are sourced metadata matches, not an assertion that all remote files remain available. Three actual sampled cover images were fetched and visually checked; the alternate Seneca volume was rejected. Covers remain lazy-loaded with explicit failure placeholders.
