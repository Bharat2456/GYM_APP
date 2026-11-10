#!/usr/bin/env bash
# Downloads the MoveNet Lightning (int8) pose model into assets/models/. Needs internet. Run once locally and in CI before building.
# Source: Google MoveNet SinglePose Lightning, Apache-2.0 (TensorFlow Hub / Kaggle Models).
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/assets/models/movenet_lightning.tflite"
mkdir -p "$(dirname "$DEST")"
if [ -s "$DEST" ] && [ "$(wc -c < "$DEST")" -gt 1000000 ]; then echo "Model already present: $DEST"; exit 0; fi
URLS=(
  "https://tfhub.dev/google/lite-model/movenet/singlepose/lightning/tflite/int8/4?lite-format=tflite"
  "https://www.kaggle.com/api/v1/models/google/movenet/tfLite/singlepose-lightning-tflite-int8/1/download"
)
for u in "${URLS[@]}"; do
  echo "Trying $u"
  if curl -fsSL --retry 3 -o "$DEST.tmp" "$u"; then
    # Kaggle may return a .tar.gz; TFHub returns the raw .tflite
    if tar -tzf "$DEST.tmp" >/dev/null 2>&1; then d=$(mktemp -d); tar -xzf "$DEST.tmp" -C "$d"; f=$(find "$d" -name '*.tflite' | head -1); [ -n "$f" ] && mv "$f" "$DEST.tmp"; fi
    if [ "$(wc -c < "$DEST.tmp")" -gt 1000000 ]; then mv "$DEST.tmp" "$DEST"; echo "Saved $DEST ($(wc -c < "$DEST") bytes)"; exit 0; fi
  fi
done
echo "ERROR: could not download the pose model. Download a MoveNet Lightning .tflite manually and save it as $DEST" >&2; exit 1
