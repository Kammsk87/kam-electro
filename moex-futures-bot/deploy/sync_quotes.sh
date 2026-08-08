#!/usr/bin/env bash
# Pull the collected cohort back to the workstation. Read-only on the server.
# Usage: deploy/sync_quotes.sh <host>
set -euo pipefail
HOST="${1:?usage: sync_quotes.sh <host>}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/data/market/moex_iss/quotes"
mkdir -p "$DEST"
rsync -avz --ignore-existing "root@${HOST}:/opt/moex-collector/quotes/" "$DEST/"
echo
echo "== cohort validity after sync =="
cd "$(dirname "$0")/.." && .venv/bin/python tools/check_quote_cohort.py --write
