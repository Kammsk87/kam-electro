#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Kammsk87/kam-electro.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/botalin}"
PROFILE="${BOTALIN_SERVER_PROFILE:-training}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
FIREBASE_API_KEY="${FIREBASE_API_KEY:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root:"
  echo "  sudo FIREBASE_PROJECT_ID=botalin FIREBASE_API_KEY=<key> bash $0"
  exit 1
fi

echo "Installing Botalin server runner"
echo "Repo: ${REPO_URL}"
echo "Dir:  ${INSTALL_DIR}"
echo "Profile: ${PROFILE}"

if ! command -v git >/dev/null 2>&1; then
  apt-get update
  apt-get install -y git ca-certificates curl
fi

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o /etc/apt/keyrings/nodesource.asc
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.asc] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  git -C "${INSTALL_DIR}" fetch --all --prune
  git -C "${INSTALL_DIR}" checkout main
  git -C "${INSTALL_DIR}" pull --ff-only
else
  rm -rf "${INSTALL_DIR}"
  git clone "${REPO_URL}" "${INSTALL_DIR}"
fi

# Write Firebase credentials to env file (readable only by root)
cat > /etc/botalin.env <<EOF
FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
FIREBASE_API_KEY=${FIREBASE_API_KEY}
EOF
chmod 600 /etc/botalin.env

cp "${INSTALL_DIR}"/share/strategy-lab-7q4m2v/vps/botalin-* /etc/systemd/system/
# Override profile if explicitly provided
if [[ "${PROFILE}" != "training" ]]; then
  sed -i "s/^Environment=BOTALIN_SERVER_PROFILE=.*/Environment=BOTALIN_SERVER_PROFILE=${PROFILE}/" /etc/systemd/system/botalin-autobot.service
fi

systemctl daemon-reload

# Main coordinator (all strategies, every 3 min)
systemctl enable --now botalin-autobot.timer

# Individual strategy timers (each every 5 min, staggered by 1 min on boot)
for strategy in trend pullback scalping rsi-reversal breakout vwap-reversion; do
  systemctl enable --now "botalin-${strategy}.timer"
done

systemctl enable --now botalin-health.timer

echo
echo "Running health check"
node "${INSTALL_DIR}/share/strategy-lab-7q4m2v/server-health.mjs" || true

echo
echo "=== Installed. Useful commands ==="
echo "  systemctl list-timers 'botalin-*'                        # all timers"
echo "  journalctl -u botalin-autobot.service -f                 # coordinator log"
echo "  journalctl -u botalin-trend.service -f                   # trend bot log"
echo "  journalctl -u 'botalin-*.service' -f                     # all bots live"
echo "  systemctl start botalin-trend.service                    # run manually"
echo "  node ${INSTALL_DIR}/share/strategy-lab-7q4m2v/server-autobot.mjs --dry-run"
