#!/usr/bin/env bash
# TASK-MX-003 — install the quote collector on a dedicated host.
#
# Read-only research collector: public MOEX ISS market data in, JSONL out. No
# credential, no account, no order path. Run as root on the collection host.
#
# Idempotent. Safe to re-run.
set -euo pipefail

DIR=/opt/moex-collector

echo "== packages =="
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-tz rsync >/dev/null
python3 -c "import pytz; print('pytz', pytz.__version__)"

echo "== unprivileged user =="
id -u collector >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin collector

echo "== layout =="
mkdir -p "$DIR/quotes"
chown -R collector:collector "$DIR/quotes"
chmod 755 "$DIR"

echo "== service =="
install -m 644 "$DIR/moex-quote-collector.service" /etc/systemd/system/moex-quote-collector.service
touch "$DIR/collector.log"; chown collector:collector "$DIR/collector.log"
systemctl daemon-reload
systemctl enable --now moex-quote-collector.service

sleep 12
echo "== status =="
systemctl --no-pager --lines=5 status moex-quote-collector.service || true
echo
echo "== first records =="
find "$DIR/quotes" -name quotes.jsonl -exec wc -l {} + 2>/dev/null || echo "  none yet"
echo
echo "stop with:  systemctl stop moex-quote-collector"
echo "logs with:  journalctl -u moex-quote-collector -f"
