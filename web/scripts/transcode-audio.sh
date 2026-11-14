#!/usr/bin/env bash
#
# Transcode the legacy ear-training WAVs to Ogg Opus for the PWA.
#
# The source clips (../audio/*.wav) are 22050 Hz mono, ~16 s each, ~19 MB in
# total. They are deliberately NOT committed: this script regenerates
# web/public/audio/*.opus from them, and only the Opus output ships.
#
# Why Opus at 24 kbps mono:
#   - The whole set has to fit inside the installed PWA so ear training works
#     offline, and the budget for that is 1-2 MB.
#   - These are "name that opening" clips. What matters is melodic contour,
#     rhythm and orchestration, all of which survive 24 kbps Opus. Opus is
#     also the only common codec that still sounds like music down there.
#   - libopus always encodes at 48 kHz internally, so upsampling from 22050 Hz
#     costs nothing; it is what the encoder does anyway.
#
# Filename stems are preserved, because `parts[].id` in ear_training.json is
# both the clip id and the file stem: id "moldau" -> /audio/moldau.opus.
#
# Usage:  bash scripts/transcode-audio.sh [source-dir] [out-dir]

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src="${1:-$here/../../audio}"
out="${2:-$here/../public/audio}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found on PATH" >&2
  exit 1
fi

if [ ! -d "$src" ]; then
  echo "source directory not found: $src" >&2
  exit 1
fi

mkdir -p "$out"

count=0
for wav in "$src"/*.wav; do
  [ -e "$wav" ] || continue
  stem="$(basename "$wav" .wav)"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$wav" \
    -map_metadata -1 \
    -ac 1 \
    -c:a libopus -b:a 24k -vbr on -compression_level 10 -application audio \
    "$out/$stem.opus"
  count=$((count + 1))
done

total=$(find "$out" -name '*.opus' -type f -printf '%s\n' | awk '{s += $1} END {print s + 0}')
echo "transcoded $count clip(s) -> $out"
echo "total opus bytes: $total"
