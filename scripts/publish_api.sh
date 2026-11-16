#!/bin/sh
# Pushes web/api/v1 (written by pipeline/api.py) to the `api` branch of the repository as a single commit,
# so the API has a mirror at raw.githubusercontent.com. Usage: scripts/publish_api.sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cp -R "$ROOT/web/api/v1" "$TMP/v1"
cd "$TMP"
git init -q -b api
git config user.name "$(git -C "$ROOT" config user.name)"; git config user.email "$(git -C "$ROOT" config user.email)"
git add v1 && git commit -q -m "API files, built $(date -u +%Y-%m-%d)"
git push -q --force "$(git -C "$ROOT" remote get-url origin)" api
echo "pushed $(git rev-parse --short HEAD) with $(find v1 -type f | wc -l | tr -d ' ') files"
