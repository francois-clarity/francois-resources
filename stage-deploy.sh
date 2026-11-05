#!/usr/bin/env bash
# Publish this site to Cloudflare Pages: committed work only.
#
# Francois's rule (5 Nov 2026): only finished work goes live, and "finished"
# means committed. Until then this published whatever was on disk, so every
# session's half-done work reached the live site with the 05:10 events job.
# Now the copy that goes up is built from the last commit (git archive HEAD),
# never from the working folder.
#
# Two folders are the exception, because they're kept out of git on purpose
# and still have to be served: media/ (1.2 GB of video) and files/d/ (the
# paid ebooks; this repo is public). They come from disk, as hard links.
#
# deploy-exclude.txt still applies (added 3 Nov 2026, when the AI-key PDFs,
# drafts and handover notes were found public), because some of those files
# are committed.

set -euo pipefail
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"

SITE="$(cd "$(dirname "$0")" && pwd)"
BUILD="$(mktemp -d "${TMPDIR:-/tmp}/francois-resources-build.XXXXXX")"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/francois-resources-deploy.XXXXXX")"
trap 'rm -rf "$BUILD" "$STAGE"' EXIT

git -C "$SITE" archive HEAD | tar -x -C "$BUILD"
for d in media files/d; do
  [ -d "$SITE/$d" ] && mkdir -p "$BUILD/$d" && rsync -a --link-dest="$SITE/$d/" "$SITE/$d/" "$BUILD/$d/"
done
rsync -a --link-dest="$BUILD/" --exclude-from="$SITE/deploy-exclude.txt" "$BUILD/" "$STAGE/"

# Say out loud what stayed behind, so nobody wonders why a change isn't live.
LEFT="$(git -C "$SITE" status --porcelain --untracked-files=normal | grep -v -E '^.. \.wrangler/' || true)"
if [ -n "$LEFT" ]; then
  echo "Not published (not committed yet):"
  echo "$LEFT" | sed 's/^/  /'
fi

echo "Publishing commit $(git -C "$SITE" rev-parse --short HEAD)"
cd "$STAGE"
npx wrangler pages deploy . --project-name=francois-resources --branch=main --commit-dirty=true
