# Natural history map: project brief

## Goal
An interactive world map of Earth's natural history. A time slider runs from the Cambrian (~540 Ma) to today. As it moves, the continents redraw in their reconstructed positions, the geological period changes, and the map shows where real fossils of each age were found.

## Decisions already made
- **Data-driven, not curated.** Plot actual fossil occurrences from the Paleobiology Database (PBDB) at their ancient coordinates.
- **Details hidden until clicked.** Nothing is listed on the map by default.
  - Map shows fossil sites aggregated into hexagon cells, coloured by major group (e.g. trilobites, fish, reptiles, mammals, plants).
  - Click a cell → side panel lists the groups present there, with counts.
  - Click a group → list of genera: age range, rock formation, link to the PBDB record.
  - Group filter chips are collapsed by default.
- **Images for each genus.**
  - PhyloPic silhouette wherever one exists (light, consistent, used in lists).
  - Wikipedia lead image (artist reconstruction or fossil photo) in the detail view only, with artist and licence credited. Fall back to the silhouette when there's none.
- **Flat world map** (assumed; not a globe unless the user says otherwise).
- **Precompute and bundle the data.** No live API calls from the finished page.

## Data sources (all on the network allowlist)
| Need | Source | Notes |
|---|---|---|
| Fossil occurrences + ancient coordinates | `paleobiodb.org/data1.2/occs/list.json` | Use `show=paleoloc,class` (plus whatever else is needed). Check which plate model PBDB uses for paleocoordinates (`pgm` parameter). |
| Coastlines / plate polygons per time step | `gws.gplates.org/reconstruct/coastlines/` | Pick a model that covers the full ~540 Ma range. Use the **same plate model** as the fossil paleocoordinates, or the fossils won't sit on the right landmasses. Verify both before building. |
| Silhouettes | `api.phylopic.org`, `images.phylopic.org` | Store each image's licence and contributor. |
| Reconstruction / fossil photos | `en.wikipedia.org` REST summary API, `upload.wikimedia.org` | Send a descriptive User-Agent (project name, no personal email) and pace the requests, or you'll get 429s. Pull licence and author from Commons metadata. |

Cache every raw download locally so nothing gets fetched twice.

## Suggested build
- Python scripts in `scripts/` for fetching, cleaning, hex-binning and image lookup. Output goes to per-time-step JSON in `data/`.
- Front end: static HTML/JS with d3-geo and an equal-area projection. Load each time step's JSON on demand.
- Time steps: one per geological epoch or stage midpoint, roughly every 10–20 Myr. Label each with its period name and a one-line description.
- Keep the total bundle reasonable: thin out occurrences per cell and resize images to thumbnails.

## Milestones
1. **One slice.** Jurassic, ~150 Ma: coastlines plus hex-binned fossils, with click-to-reveal panels. Show the user before going further.
2. **All slices and the time slider.**
3. **Images:** silhouettes first, then Wikipedia images with credits.
4. **Polish:** period labels and blurbs, filter chips, mobile layout, credits/sources page.

## Working rules for this user
- Ask clarifying questions before complex steps. Show a plan or output before making file changes, and wait for approval.
- Keep replies short and concrete; no buzzwords.
- Use lowercase-hyphen filenames.

## Still open
- Audience: personal exploration, a class/iCLA showcase, or the public. This affects how much explanatory text goes on the page.
- Whether to add a globe view later.
