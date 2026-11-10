# Natural History Map

An interactive world map of Earth's natural history. A time slider runs from the Cambrian (~540 million years ago) to today. As you move it, the continents redraw in their reconstructed positions and the map shows where real fossils of each age were found.

- Fossil sites are grouped into hexagon cells and coloured by major group (trilobites, fish, reptiles, mammals, plants and so on).
- Click a cell to see the groups found there. Click a group to see its genera, with age range, rock formation and a link to the Paleobiology Database record.
- Each genus shows a PhyloPic silhouette, and a Wikipedia image with its artist and license credited where one exists.

## Data sources

| Need | Source |
|---|---|
| Fossil occurrences and ancient coordinates | [Paleobiology Database](https://paleobiodb.org) |
| Coastlines and plate reconstructions | [GPlates Web Service](https://gws.gplates.org) |
| Silhouettes | [PhyloPic](https://www.phylopic.org) |
| Reconstructions and fossil photos | Wikipedia and Wikimedia Commons |

The data keeps the license of its source. Image credits and licenses are stored with each image and shown on the page.

## Layout

- `index.html`, `map.js`, `card.js`, `place.js`, `styles.css`: the static front end
- `scripts/`: Python scripts that fetch, clean, bin and build the data
- `worker/`: a Cloudflare Worker that serves the site and runs a scheduled job queue (D1 + Workers AI)
- `data/`: built output. Only `data/slices.json`, the list of time slices, is in the repo. The rest is about 1 GB and is rebuilt by the scripts.

## Building the data

```sh
python3 -m venv .venv
.venv/bin/python scripts/build-all.py 2   # builds every slice in data/slices.json, 2 at a time
```

Raw downloads are cached in `cache/`, so nothing is fetched twice. Please keep the request pacing in the scripts so the source services aren't overloaded.

## Running and deploying

```sh
npm install
npx wrangler dev      # local preview
npx wrangler deploy   # deploy to Cloudflare
```

To deploy your own copy, create your own D1 database and put its ID in `wrangler.jsonc`.

## License

The code is under the [MIT License](LICENSE). The data and images keep the licenses of their sources.
