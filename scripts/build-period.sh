#!/bin/sh
# Build every plain-code step for one time slice (downloads are cached, so re-running is cheap).
# Usage: sh scripts/build-period.sh <time_ma> "<pbdb intervals>" "<label>"
set -e
cd "$(dirname "$0")/.."
py=.venv/bin/python
t=$1
[ -f data/slice-$t.json ] || $py scripts/build-slice.py "$t" "$2" "$3"
[ -d data/terrain/$t ] || $py scripts/make-terrain-tiles.py "$t"
[ -f data/terrain/$t-flat.jpg ] || $py scripts/make-flat-terrain.py "$t"
[ -f data/genus-info-$t.json ] || $py scripts/fetch-genus-info.py "$t"
[ -f data/life-$t.json ] || $py scripts/fetch-life-history.py "$t"
[ -f data/life-images-$t.json ] || $py scripts/fetch-life-images.py "$t"
echo "slice $t done"
