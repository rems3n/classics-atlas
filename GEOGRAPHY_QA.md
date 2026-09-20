# Geography QA and historical maps — 20 September 2026

## Geographic review

Screened all 1,479 catalog entries; changed the primary mapping or displayed author of 298. This includes separating previously valid secondary associations from origin, not 298 independently proven factual errors. All entries remain dated and mapped, with stable IDs and preserved reading records.

1,262 works now use explicit source-backed origin or work-context decisions (including previously documented anonymous-work decisions). The remaining 217 retain labeled geographic fallbacks; they are **not independently verified birthplaces**. The full before/after list and remaining fallbacks are in `data/geography-audit.json`. Broader imported life/work/travel associations still need editorial review.

The default now prefers author birthplace or origin, then a documented career or original literary region. Anonymous texts and anthologies retain work-specific decisions rather than inheriting their modern editor’s birthplace. Modern geographic codes do not claim modern nationality. The optional broader-association view preserves documented residence, exile and travel connections separately. Sources and uncertainty are visible in book details.

Examples:

| Author | Primary origin / fallback | Reason for previous discrepancy |
|---|---|---|
| Seneca | Córdoba, Spain | Corsican exile appeared under modern France; Rome remains a career association |
| Ovid | Sulmona, Italy | Exile at Tomis appeared under Romania |
| Marcus Aurelius | Rome, Italy | Danube campaign locations appeared as origin |
| James Joyce | Ireland | Imported residences omitted Dublin origin |
| Joris-Karl Huysmans | France | Dutch travel locations dominated the import |
| Fernando de Rojas | Spain | Erroneous Kingdom of France association removed |
| Albert Cohen | Corfu, Greece | Geneva was erroneously coded as France; corrected to Switzerland in broader associations |
| Ngũgĩ wa Thiong’o | Kenya | US residence had displaced Kenyan origin |
| Heraclitus | Ephesus, modern Turkey | Persian imperial rule does not establish Iranian birthplace |

Octavia is now displayed as Pseudo-Seneca (unknown author) and mapped to its Roman literary context. The combined source-index attribution “Petronius and Seneca” is separated for The Satyricon and The Apocolocyntosis. IDs remain unchanged.

## Historical map choices

A civilization is not one fixed map. Each option therefore names an actual source snapshot year; no interpolated boundaries or falsely relabeled 117 AD/565 AD maps are used.

| Date | Preset |
|---|---|
| 1500 BC | Egypt / New Kingdom |
| 500 BC | Persia and early Greece |
| 400 BC | Classical Greece |
| 323 BC | Alexander’s empire |
| 100 BC | Roman Republic and Gaul |
| AD 100 | Roman and Han empires |
| AD 400 | Late antiquity |
| AD 600 | Byzantium and Sasanian Persia |
| AD 800 | Abbasid and Tang worlds |
| AD 1300 | Mali, Yuan and medieval world |
| AD 1492 | Americas and the world |
| AD 1600 | Ottoman, Mughal and Ming worlds |

These global snapshots add African, Asian and American context alongside Mediterranean empires. Gaul and classical Greece comprise multiple communities/polities rather than a fabricated single nation.

Source: [Historical Basemaps](https://github.com/aourednik/historical-basemaps), Alexandre Ourednik and contributors, revision `da7a4b735ecef70aebdc9c73e409d8a2500d50f3`, retrieved 20 September 2026. Data license: GPL-3.0; full license and original GeoJSON are included under `data/historical`. `scripts/historical_maps.py` normalizes coordinates to six decimal places and retains display attributes for embedding; no boundaries are invented. The source archive includes the corresponding inputs and transformation script. This is an aggregate of separately attributed data and application code.

The dataset is a community-maintained global/continental reconstruction, not an authoritative or uniformly precise atlas. Coverage and quality vary by period and region; some labels or frontiers may contain errors. Colors distinguish source political groupings. Unnamed regions remain neutral land; blank does not mean uninhabited. Cultural regions are not necessarily unified states. Clicking a historical polygon, or selecting it in map notes, shows source political/cultural grouping and the source precision flag.

**Book markers and country filters continue to refer to modern geographic regions. They do not purport to count historical empire membership.** There are no sufficiently precise, independently reviewed author coordinates for that claim. Historical land clicks inspect the reconstructed region; numbered markers open books. This distinction is stated in the map legend, notes and About. Border year is independent of the book timeline; “Browse books near this date” explicitly selects a 200-year window snapped to the existing 50-year ruler.

The historical selector sits in the search toolbar, not across the map. Light/dark themes, flat/globe projections, source notes, a marker-visibility switch and shareable state are supported. Country metric shading is disabled while historical colors identify polities.

## Validation

13 data tests, 25 core tests, and the simulated-DOM integration suite passed. New checks cover Seneca origin versus exile; named geographic regressions; all assigned codes rendering on the modern map; preserved IDs; exact historical years and source files; all 12 layers generating paths; no unintended book filtering on border changes; book-date shortcut; flat/globe/theme wiring; mobile marker toggle; and share serialization. Packaged polygon winding and orthographic clipping were checked across every named feature in all 12 snapshots at three globe rotations. A live globe check exposed tiny-ring precision errors; six-decimal normalization fixes those cases, with regression coverage on the embedded geometry.

These checks validate application behavior and documented corrections, not every historical boundary or every biographical claim. Real-device touch and exhaustive cross-browser testing remain outstanding.
