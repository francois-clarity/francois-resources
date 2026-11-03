#!/usr/bin/env bash
# Publish this folder to Cloudflare Pages without the private files in it.
#
# Why this exists: `wrangler pages deploy .` uploads every file on disk. On
# 3 Nov 2026 the AI-key PDFs, draft copy, handover notes and the site's own
# scripts were all found public, put there by the daily 05:10 events job.
# deploy.sh, publish-shorts.sh and the events job now all publish through
# this: a copy of the site minus deploy-exclude.txt, built from hard links so
# it takes no extra disk, and only that copy goes up.

set -euo pipefail
export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"

SITE="$(cd "$(dirname "$0")" && pwd)"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/francois-resources-deploy.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

rsync -a --link-dest="$SITE/" --exclude-from="$SITE/deploy-exclude.txt" "$SITE/" "$STAGE/"
cd "$STAGE"
npx wrangler pages deploy . --project-name=francois-resources --branch=main --commit-dirty=true
