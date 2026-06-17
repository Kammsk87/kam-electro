# Botalin VPS runner

This folder contains a systemd setup for running the Botalin server paper-autobot on a VPS.

Recommended VPS mode:

Fast install on Ubuntu/Debian:

1. Copy this repository to the VPS or clone it.
2. Run:
   `sudo BOTALIN_SERVER_PROFILE=training bash share/strategy-lab-7q4m2v/vps/install-botalin.sh`
3. Check the continuous runner:
   `systemctl status botalin-runner.service`
4. Watch bot logs:
   `journalctl -u botalin-runner.service -f`
5. Check timers:
   `systemctl list-timers 'botalin-*'`
6. Check health logs:
   `journalctl -u botalin-health.service -n 50 --no-pager`

Manual install:

1. Clone the repository into `/opt/botalin`.
2. Install Node.js 20+.
3. Copy the systemd files:
   `sudo cp share/strategy-lab-7q4m2v/vps/botalin-* /etc/systemd/system/`
4. Choose profile in `/etc/systemd/system/botalin-runner.service`:
   - `protective` - fewer trades, stricter filters.
   - `balanced` - more trades with risk limits. Recommended for current paper testing.
   - `active` - more frequent entries, smaller trade size, higher test risk.
   - `training` - frequent paper trades for learning and strategy comparison.
5. Enable the continuous runner:
   `sudo systemctl daemon-reload`
   `sudo systemctl enable --now botalin-runner.service`
6. Enable health check:
   `sudo systemctl enable --now botalin-health.timer`
7. Check runner logs:
   `journalctl -u botalin-runner.service -n 100 --no-pager`
8. Check health logs:
   `journalctl -u botalin-health.service -n 50 --no-pager`

Legacy systemd timers are still included. Keep them disabled while `botalin-runner.service` is active, otherwise the same strategies can enter duplicate paper trades. To enable the legacy timers intentionally, install with `BOTALIN_ENABLE_LEGACY_TIMERS=1`.

Manual checks:

- Run one bot cycle:
  `node share/strategy-lab-7q4m2v/server-autobot.mjs --once --profile=balanced`
- Run the continuous runner once:
  `BOTALIN_RUNNER_STRATEGIES=scalping node share/strategy-lab-7q4m2v/server-runner.mjs --once --dry-run`
- Dry-run without writing trades:
  `node share/strategy-lab-7q4m2v/server-autobot.mjs --dry-run --profile=balanced`
- Check infrastructure:
  `node share/strategy-lab-7q4m2v/server-health.mjs`
- Analyze weak and strong journal patterns:
  `node share/strategy-lab-7q4m2v/journal-analysis.mjs`

Supabase 522/timeouts:

1. Run `node share/strategy-lab-7q4m2v/server-health.mjs`.
2. If Supabase fails but Bybit is OK, open Supabase SQL Editor.
3. Run `share/strategy-lab-7q4m2v/supabase-maintenance.sql`.
4. Re-run health check.
5. If it still fails, check Supabase project health, database compute/burst limits, and recent REST/API incidents.

This runner is still paper/demo mode. Do not add real exchange keys here until testnet rules and secret storage are separated.
