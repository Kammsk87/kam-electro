# Botalin VPS runner

This folder contains a systemd setup for running the Botalin server paper-autobot on a VPS.

Recommended VPS mode:

Fast install on Ubuntu/Debian:

1. Copy this repository to the VPS or clone it.
2. Run:
   `sudo BOTALIN_SERVER_PROFILE=balanced bash share/strategy-lab-7q4m2v/vps/install-botalin.sh`
3. Check timers:
   `systemctl list-timers 'botalin-*'`
4. Check bot logs:
   `journalctl -u botalin-autobot.service -n 100 --no-pager`
5. Check health logs:
   `journalctl -u botalin-health.service -n 50 --no-pager`

Manual install:

1. Clone the repository into `/opt/botalin`.
2. Install Node.js 20+.
3. Copy the systemd files:
   `sudo cp share/strategy-lab-7q4m2v/vps/botalin-* /etc/systemd/system/`
4. Choose profile in `/etc/systemd/system/botalin-autobot.service`:
   - `protective` - fewer trades, stricter filters.
   - `balanced` - more trades with risk limits. Recommended for current paper testing.
   - `active` - more frequent entries, smaller trade size, higher test risk.
5. Enable timer:
   `sudo systemctl daemon-reload`
   `sudo systemctl enable --now botalin-autobot.timer`
6. Enable health check:
   `sudo systemctl enable --now botalin-health.timer`
7. Check bot logs:
   `journalctl -u botalin-autobot.service -n 100 --no-pager`
8. Check health logs:
   `journalctl -u botalin-health.service -n 50 --no-pager`

Manual checks:

- Run one bot cycle:
  `node share/strategy-lab-7q4m2v/server-autobot.mjs --once --profile=balanced`
- Dry-run without writing trades:
  `node share/strategy-lab-7q4m2v/server-autobot.mjs --dry-run --profile=balanced`
- Check infrastructure:
  `node share/strategy-lab-7q4m2v/server-health.mjs`

Supabase 522/timeouts:

1. Run `node share/strategy-lab-7q4m2v/server-health.mjs`.
2. If Supabase fails but Bybit is OK, open Supabase SQL Editor.
3. Run `share/strategy-lab-7q4m2v/supabase-maintenance.sql`.
4. Re-run health check.
5. If it still fails, check Supabase project health, database compute/burst limits, and recent REST/API incidents.

This runner is still paper/demo mode. Do not add real exchange keys here until testnet rules and secret storage are separated.
