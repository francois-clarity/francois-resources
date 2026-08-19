#!/bin/bash
# The ONLY way shorts reach media/shorts/ and the live host.
# Born 18 Aug 2026 after seven silent shorts were published to Instagram
# and Facebook: the Remotion render is video-only by design, audio is muxed
# in from the source afterwards, and two ad-hoc "fix" rounds skipped the
# mux and the audio gate. Francois: "build it into your checklist".
# This script refuses any file that is silent, has no audio stream, or
# has the wrong duration, and only then copies and deploys.
set -euo pipefail
SITE="$HOME/francois-resources"
DEST="$SITE/media/shorts"
fail=0
for f in "$@"; do
  [ -f "$f" ] || { echo "MISSING $f"; fail=1; continue; }
  astream=$(ffprobe -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$f" | head -1)
  if [ -z "$astream" ]; then echo "NO AUDIO STREAM  $(basename "$f")"; fail=1; continue; fi
  ffmpeg -v error -i "$f" -vn -ac 1 -ar 16000 -f wav /tmp/_ps.wav -y
  rms=$(python3 -c "import wave,audioop;w=wave.open('/tmp/_ps.wav');print(audioop.rms(w.readframes(w.getnframes()),2))")
  if [ "$rms" -lt 200 ]; then echo "SILENT (rms $rms)  $(basename "$f")"; fail=1; continue; fi
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  echo "ok  $(basename "$f")  rms=$rms  ${dur%.*}s"
done
[ "$fail" = 0 ] || { echo; echo "REFUSED: fix the files above. Nothing was published."; exit 1; }
for f in "$@"; do cp "$f" "$DEST/"; done
cd "$SITE" && npx wrangler pages deploy . --project-name=francois-resources --branch=main --commit-dirty=true 2>&1 | tail -1
# verify the LIVE bytes, not the local ones
for f in "$@"; do
  n=$(basename "$f"); u="https://resources.francoisesterhuizen.com/media/shorts/$n"
  # Cloudflare takes a little while to serve fresh bytes on the custom
  # domain; retry before calling it a failure (19 Aug 2026: a clean deploy
  # read as "LIVE FETCH FAILED" on the first try, all six were fine).
  ok=0
  for try in 1 2 3 4 5 6; do
    code=$(curl -s -o /tmp/_live.mp4 -w "%{http_code}" "$u")
    if [ "$code" = 200 ] && ffmpeg -v error -i /tmp/_live.mp4 -vn -ac 1 -ar 16000 -f wav /tmp/_ps.wav -y 2>/dev/null; then ok=1; break; fi
    sleep 10
  done
  [ "$ok" = 1 ] || { echo "LIVE FETCH FAILED $n (after 6 tries)"; exit 1; }
  rms=$(python3 -c "import wave,audioop;w=wave.open('/tmp/_ps.wav');print(audioop.rms(w.readframes(w.getnframes()),2))")
  [ "$rms" -ge 200 ] && echo "LIVE ok  $n  rms=$rms" || { echo "LIVE SILENT  $n"; exit 1; }
done
