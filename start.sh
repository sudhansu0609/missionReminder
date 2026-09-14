#!/usr/bin/env bash
# Start Mission Reminder (macOS / Linux). Mirrors start.ps1.
#   ./start.sh            desktop app
#   ./start.sh mobile     Expo dev server
#   ./start.sh test       behaviour tests
#   ./start.sh typecheck
#   ./start.sh build
set -euo pipefail
cd "$(dirname "$0")"

target="${1:-desktop}"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js 20 or newer is required. https://nodejs.org" >&2; exit 1
fi
major="$(node -v | sed 's/^v//' | cut -d. -f1)"
if [ "$major" -lt 20 ]; then
  echo "ERROR: Node $(node -v) found; 20 or newer is required." >&2; exit 1
fi
echo "Node $(node -v) / npm $(npm -v)"

for app in desktop mobile; do
  [ -f "apps/$app/.env" ] || echo "  no apps/$app/.env -> running fully local (no account, no sync)"
done

if [ ! -d node_modules ] || [ "${2:-}" = "--install" ]; then
  echo; echo "==> Installing dependencies"; npm install
fi

echo; echo "==> Building @mission/core and @mission/data"
npm run build:core

case "$target" in
  desktop)   echo; echo "==> Starting the desktop app";   exec npm run dev -w @mission/desktop ;;
  mobile)    echo; echo "==> Starting Expo";              exec npm start -w @mission/mobile ;;
  test)      echo; echo "==> Running behaviour tests";    exec npm test -w @mission/core ;;
  typecheck) echo; echo "==> Typechecking";               exec npm run typecheck ;;
  build)     echo; echo "==> Building the desktop app";   exec npm run build -w @mission/desktop ;;
  *) echo "Unknown target: $target (desktop|mobile|test|typecheck|build)" >&2; exit 2 ;;
esac
