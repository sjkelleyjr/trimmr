#!/usr/bin/env bash
# Regenerate binary samples under apps/web/tests/fixtures (requires ffmpeg).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/web/tests/fixtures"
mkdir -p "$OUT"

ffmpeg -y -f lavfi -i color=c=green:s=320x240:d=0.55 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=0.55 \
  -c:v libvpx-vp9 -crf 45 -b:v 0 -c:a libopus -shortest "$OUT/sample.webm"

ffmpeg -y -f lavfi -i color=c=blue:s=320x240:d=0.55 -f lavfi -i sine=frequency=330:sample_rate=44100:duration=0.55 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT/sample.mp4"

ffmpeg -y -f lavfi -i color=c=red:s=64x64:d=0.15 -f lavfi -i color=c=yellow:s=64x64:d=0.15 \
  -filter_complex "[0:v][1:v]concat=n=2:v=1,fps=8" -frames:v 16 "$OUT/sample.gif"

ffmpeg -y -i "$OUT/sample.gif" -c:v libwebp -quality 55 -loop 0 "$OUT/sample-animated.webp"

ffmpeg -y -i "$OUT/sample.gif" -plays 0 "$OUT/sample.apng"

echo "Wrote fixtures to $OUT"
