#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Kammsk87/kam-electro.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/botalin}"
PROFILE="${BOTALIN_SERVER_PROFILE:-balanced}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo BOTALIN_SERVER_PROFILE=${PROFILE} bash $0"
  exit 1
fi

echo "Installing Botalin server runner"
echo "Repo: ${REPO_URL}"
echo "Dir: ${INSTALL_DIR}"
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

cp "${INSTALL_DIR}"/share/strategy-lab-7q4m2v/vps/botalin-* /etc/systemd/system/
sed -i "s/^Environment=BOTALIN_SERVER_PROFILE=.*/Environment=BOTALIN_SERVER_PROFILE=${PROFILE}/" /etc/systemd/system/botalin-autobot.service

systemctl daemon-reload
systemctl enable --now botalin-autobot.timer
systemctl enable --now botalin-health.timer

echo
echo "Running health check"
node "${INSTALL_DIR}/share/strategy-lab-7q4m2v/server-health.mjs" || true

echo
echo "Installed. Useful commands:"
echo "  systemctl list-timers 'botalin-*'"
echo "  journalctl -u botalin-autobot.service -n 100 --no-pager"
echo "  journalctl -u botalin-health.service -n 50 --no-pager"
echo "  node ${INSTALL_DIR}/share/strategy-lab-7q4m2v/server-autobot.mjs --dry-run --profile=${PROFILE}"
