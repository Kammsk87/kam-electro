# Botalin VPS runner

This folder contains a systemd setup for running the Botalin server paper-autobot on a VPS.

Recommended VPS mode:

1. Clone the repository into `/opt/botalin`.
2. Install Node.js 20+.
3. Copy the two systemd files:
   `sudo cp share/strategy-lab-7q4m2v/vps/botalin-autobot.* /etc/systemd/system/`
4. Choose profile in `/etc/systemd/system/botalin-autobot.service`:
   - `protective` - fewer trades, stricter filters.
   - `balanced` - more trades with risk limits. Recommended for current paper testing.
   - `active` - more frequent entries, smaller trade size, higher test risk.
5. Enable timer:
   `sudo systemctl daemon-reload`
   `sudo systemctl enable --now botalin-autobot.timer`
6. Check logs:
   `journalctl -u botalin-autobot.service -n 100 --no-pager`

This runner is still paper/demo mode. Do not add real exchange keys here until testnet rules and secret storage are separated.
