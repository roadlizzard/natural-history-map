#!/bin/sh
# Deploy a refresh that scripts/refresh.py marked READY. Run only after a person has read its report and said yes.
# Re-checks the data first, makes browsers fetch the new files, queues agent jobs for new genera, deploys.
set -e
cd "$(dirname "$0")/.."
py=.venv/bin/python
[ -f cache/refresh/ready ] || { echo "nothing to deploy: no refresh is marked ready"; exit 1; }
$py scripts/check-data.py --against cache/last-good > /dev/null || { echo "checks fail now; not deploying"; exit 1; }
# A new cache-busting tag, so browsers fetch the new data instead of their saved copies.
tag="$(date +%Y-%m-%d)-refresh"
sed -i '' "s/^const BUILD = \".*\";/const BUILD = \"$tag\";/" map.js
times=$($py -I -c "import json; print(' '.join(f\"{s['time']:g}\" for s in json.load(open('data/slices.json'))))")
$py scripts/agent-jobs.py push $times
npx wrangler deploy
rm cache/refresh/ready
echo "deployed ($tag)"
