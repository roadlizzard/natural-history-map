#!/bin/sh
# After a period is built: mark it ready, queue its agent jobs, queue the tours once every period
# is in, and redeploy the site. Several builds can call this at once; they take turns.
# Usage: sh scripts/publish.sh <time_ma>
set -e
cd "$(dirname "$0")/.."
until mkdir cache/publish.lock 2>/dev/null; do sleep 5; done
trap 'rmdir cache/publish.lock' EXIT
py=.venv/bin/python
$py scripts/fetch-life-history.py "$1"   # from cached articles: fast, and always the current card format
$py scripts/fetch-life-images.py "$1"    # the current restoration search (searches are cached)
$py scripts/make-map-names.py "$1"
$py scripts/agent-jobs.py push "$1"
$py scripts/agent-jobs.py tours-if-complete
npx wrangler deploy
touch "cache/published-$1"
echo "published $1"
