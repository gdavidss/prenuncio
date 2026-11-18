#!/bin/bash
# Deploys web/ and nothing else. Stops at the first error: a failed step must never let `vercel deploy`
# run from another folder (the repository root holds data that must not be uploaded).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHIP="$(mktemp -d)/web"
rsync -a "$ROOT/web/" "$SHIP/"
cd "$SHIP"
# a function lives in api/ (geo.js), and the host then serves nothing static from that folder:
# the static API moves to /v1 and vercel.json rewrites /api/v1/* to it
[ -d api/v1 ] && mv api/v1 v1
[ "$(basename "$PWD")" = "web" ] && [ -f index.html ] && [ -f .vercel/project.json ] && [ ! -d data/raw ] || { echo "refusing: not the site folder"; exit 1; }
~/.claude/hooks/deploy-secret-guard.sh scan "$SHIP"
D=""
for try in 1 2 3; do
  vercel deploy --prod --yes > /tmp/pn_deploy.log 2>&1 || true
  D=$(grep -oE "https://prenuncio-[a-z0-9]+-guis-projects-[a-z0-9]+\.vercel\.app" /tmp/pn_deploy.log | head -1 || true)
  [ -n "$D" ] && break
done
[ -n "$D" ] || { echo "deploy failed"; tail -5 /tmp/pn_deploy.log; exit 1; }
echo "deployment: $D"
~/.claude/hooks/deploy-secret-guard.sh probe https://prenuncio.com "$SHIP"
for f in app.js style.css index.html; do
  [ "$(vercel curl /$f --deployment "$D" 2>/dev/null | shasum | cut -c1-10)" = "$(shasum "$ROOT/web/$f" | cut -c1-10)" ] && echo "$f live" || { echo "$f DIFFERS"; exit 1; }
done
vercel inspect "$D" 2>&1 | grep -c "prenuncio.com"
