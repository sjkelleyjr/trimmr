#!/usr/bin/env bash
# Regenerate binary samples under apps/web/tests/fixtures (requires ffmpeg).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/apps/web/tests/fixtures"
mkdir -p "$OUT"

# Prefer SVT-AV1 (fast); fall back to libaom when SVT is not built in (some CI images).
av1_video_args() {
  if ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libsvtav1; then
    echo "libsvtav1 -crf 40 -preset 8"
  else
    echo "libaom-av1 -crf 40 -cpu-used 8"
  fi
}
read -r -a AV1_VENC <<< "$(av1_video_args)"

ffmpeg -y -f lavfi -i color=c=green:s=320x240:d=0.55 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=0.55 \
  -c:v libvpx-vp9 -crf 45 -b:v 0 -c:a libopus -shortest "$OUT/sample.webm"

ffmpeg -y -f lavfi -i color=c=blue:s=320x240:d=0.55 -f lavfi -i sine=frequency=330:sample_rate=44100:duration=0.55 \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "$OUT/sample.mp4"

# Same A/V as sample.mp4; exercises QuickTime container + .m4v extension in pickers and sniffers.
ffmpeg -y -i "$OUT/sample.mp4" -c copy -f mov "$OUT/sample.mov"
ffmpeg -y -i "$OUT/sample.mp4" -c copy "$OUT/sample.m4v"

ffmpeg -y -f lavfi -i color=c=purple:s=320x240:r=30 -f lavfi -i sine=frequency=220:sample_rate=48000:duration=0.55 \
  -c:v libx264 -pix_fmt yuv420p -vsync vfr -c:a aac -shortest "$OUT/sample-vfr.mp4"

ffmpeg -y -f lavfi -i color=c=orange:s=320x240:d=0.55 \
  -c:v libx264 -pix_fmt yuv420p -an "$OUT/sample-no-audio.mp4"

ffmpeg -y -f lavfi -i color=c=red:s=64x64:d=0.15 -f lavfi -i color=c=yellow:s=64x64:d=0.15 \
  -filter_complex "[0:v][1:v]concat=n=2:v=1,fps=8" -frames:v 16 "$OUT/sample.gif"

ffmpeg -y -i "$OUT/sample.gif" -c:v libwebp -quality 55 -loop 0 "$OUT/sample-animated.webp"

ffmpeg -y -i "$OUT/sample.gif" -plays 0 "$OUT/sample.apng"

# Big-Buck-Bunny-style WebM: VP9 Profile 0, 1080p60, yuv420p, Opus 5.1 @ 48 kHz (short clip).
# Real BBB file also used Lavf57 and ~10 min duration; we only reproduce codec/layout/fps class.
ffmpeg -y -f lavfi -i color=c=black:s=1920x1080:r=60:d=2 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=2 \
  -filter_complex "[1:a]pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0[aout]" -map 0:v -map "[aout]" \
  -c:v libvpx-vp9 -crf 42 -b:v 0 -cpu-used 4 -row-mt 1 -c:a libopus -mapping_family 1 -b:a 160k -shortest \
  "$OUT/sample-vp9-1080p60-opus51.webm"

# Legacy WebM stack (VP8 + Vorbis) — different Matroska CodecIDs than VP9/Opus.
ffmpeg -y -f lavfi -i color=c=navy:s=320x240:r=30:d=0.55 -f lavfi -i sine=frequency=330:sample_rate=48000:duration=0.55 \
  -c:v libvpx -crf 32 -b:v 0 -c:a libvorbis -q:a 4 -shortest "$OUT/sample-vp8-vorbis.webm"

# HEVC in MP4 (hvc1) — hardware / Safari support varies vs AVC.
ffmpeg -y -f lavfi -i color=c=teal:s=320x240:r=25:d=0.55 -f lavfi -i sine=frequency=220:sample_rate=44100:duration=0.55 \
  -c:v libx265 -pix_fmt yuv420p -crf 28 -tag:v hvc1 -c:a aac -shortest "$OUT/sample-hevc.mp4"

# AV1 + Opus in WebM — decode support varies by browser/OS.
ffmpeg -y -f lavfi -i color=c=gray:s=320x240:r=25:d=0.5 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=0.5 \
  -c:v "${AV1_VENC[0]}" "${AV1_VENC[1]}" "${AV1_VENC[2]}" -c:a libopus -shortest "$OUT/sample-av1.webm"

# AV1 + AAC in MP4 (av01) — different container + tag than WebM AV1.
ffmpeg -y -f lavfi -i color=c=gray:s=320x240:r=25:d=0.5 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=0.5 \
  -c:v "${AV1_VENC[0]}" "${AV1_VENC[1]}" "${AV1_VENC[2]}" -c:a aac -shortest "$OUT/sample-av1.mp4"

# AAC 5.1 in MP4 (stereo-class uploads vs surround).
ffmpeg -y -f lavfi -i color=c=maroon:s=320x240:r=25:d=0.55 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=0.55 \
  -filter_complex "[1:a]pan=5.1|c0=c0|c1=c0|c2=c0|c3=c0|c4=c0|c5=c0[aout]" -map 0:v -map "[aout]" \
  -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest "$OUT/sample-aac51.mp4"

# Variable frame rate VP9 WebM (mux timing class; complements sample-vfr.mp4).
ffmpeg -y -f lavfi -i color=c=purple:s=320x240:r=30 -f lavfi -i sine=frequency=220:sample_rate=48000:duration=0.55 \
  -c:v libvpx-vp9 -crf 45 -b:v 0 -vsync vfr -c:a libopus -shortest "$OUT/sample-vfr.webm"

# VP9 WebM without audio track.
ffmpeg -y -f lavfi -i color=c=lime:s=320x240:r=25:d=0.55 \
  -c:v libvpx-vp9 -crf 45 -b:v 0 -an "$OUT/sample-no-audio.webm"

# Long GOP H.264 (~4s between keyframes at 30fps) — seek / scrub stress shape.
ffmpeg -y -f lavfi -i color=c=brown:s=320x240:r=30:d=2.5 -f lavfi -i sine=frequency=330:sample_rate=44100:duration=2.5 \
  -c:v libx264 -pix_fmt yuv420p -g 120 -keyint_min 120 -sc_threshold 0 -c:a aac -shortest "$OUT/sample-long-gop.mp4"

echo "Wrote fixtures to $OUT"
