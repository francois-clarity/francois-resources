#!/usr/bin/env bash
# Safe deploy for resources.francoisesterhuizen.com.
#
# Why this exists: two Claude sessions work in this folder at the same time.
# `wrangler pages deploy .` uploads whatever is on disk, committed or not, so a
# deploy fired while the other session is mid-edit would publish their unfinished
# work to the live site. This refuses to do that.
#
# Usage:  ./deploy.sh            normal, guarded deploy
#         ./deploy.sh --force    deploy anyway with a dirty tree (say why out loud)

set -euo pipefail
cd "$(dirname "$0")"

FORCE=no
[ "${1:-}" = "--force" ] && FORCE=yes

echo "==> 1. Is anyone else mid-edit?"
DIRTY="$(git status --porcelain)"
if [ -n "$DIRTY" ]; then
  echo "$DIRTY"
  if [ "$FORCE" = "no" ]; then
    cat <<'MSG'

STOPPED. There are uncommitted changes in this folder.

Deploying now would publish the files listed above exactly as they are on disk,
including anything the other session has half-finished.

Do one of these:
  - commit the work that is ready, then run ./deploy.sh again
  - wait for the other session to finish
  - if you are certain the above is safe to publish: ./deploy.sh --force
MSG
    exit 1
  fi
  echo "(--force given: publishing the above anyway)"
else
  echo "clean"
fi

echo
echo "==> 2. Do the pages still say what they claim to?"
python3 check-gates.py

echo
echo "==> 3. Publishing"
npx wrangler pages deploy . --project-name=francois-resources --branch=main --commit-dirty=true

echo
echo "==> 4. Checking the live site (a 200 proves nothing, so this reads content)"
sleep 12
if python3 check-gates.py --live; then
  echo
  echo "Live and verified."
else
  echo
  echo "LIVE CHECK FAILED. The deploy went out but a page is not serving what it should."
  echo "Roll back in the Cloudflare dashboard: Pages > francois-resources > Deployments."
  exit 1
fi
