#!/bin/bash
set -euo pipefail

# ── VoxTape Model Downloader ─────────────────────────────────────
# Downloads Silero VAD + Whisper Turbo int8 models for sherpa-onnx

MODELS_DIR="$(cd "$(dirname "$0")/.." && pwd)/models"
VAD_DIR="$MODELS_DIR/vad"
STT_DIR="$MODELS_DIR/stt"

SHERPA_RELEASE="https://github.com/k2-fsa/sherpa-onnx/releases/download"

echo "╔══════════════════════════════════════════════════╗"
echo "║          VoxTape — Model Downloader              ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── Download VAD ──────────────────────────────────────────────────
mkdir -p "$VAD_DIR"
if [ -f "$VAD_DIR/silero_vad.onnx" ]; then
  echo "✓ Silero VAD already downloaded"
else
  echo "⬇ Downloading Silero VAD..."
  curl -L --progress-bar -o "$VAD_DIR/silero_vad.onnx" \
    "$SHERPA_RELEASE/asr-models/silero_vad.onnx"
  echo "✓ Silero VAD downloaded"
fi

# ── Download Whisper Turbo (multilingual, ~538MB) ───────────
mkdir -p "$STT_DIR"
if [ -f "$STT_DIR/turbo-encoder.int8.onnx" ]; then
  echo "✓ Whisper Turbo already downloaded"
else
  MODEL_TAR="sherpa-onnx-whisper-turbo.tar.bz2"
  MODEL_URL="$SHERPA_RELEASE/asr-models/$MODEL_TAR"

  echo "⬇ Downloading Whisper Turbo (~538MB)..."
  echo "   This may take a few minutes..."
  curl -fL --progress-bar -o "/tmp/$MODEL_TAR" "$MODEL_URL"

  echo "📦 Extracting model..."
  tar -xjf "/tmp/$MODEL_TAR" -C "$MODELS_DIR/"

  # Move files from extracted dir to stt/
  EXTRACTED_DIR="$MODELS_DIR/sherpa-onnx-whisper-turbo"
  if [ -d "$EXTRACTED_DIR" ]; then
    cp "$EXTRACTED_DIR"/*.onnx "$STT_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/*.txt "$STT_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/*.bin "$STT_DIR/" 2>/dev/null || true
    rm -rf "$EXTRACTED_DIR"
    echo "✓ Whisper Turbo downloaded and extracted"
  else
    echo "✗ Extraction failed — check /tmp/$MODEL_TAR"
  fi

  rm -f "/tmp/$MODEL_TAR"
fi

echo ""
echo "── Model Status ──────────────────────────────────"
echo "VAD:  $([ -f "$VAD_DIR/silero_vad.onnx" ] && echo '✓ Ready' || echo '✗ Missing')"
echo "STT:  $([ -f "$STT_DIR/turbo-encoder.int8.onnx" ] && echo '✓ Ready (Turbo)' || echo '✗ Missing')"
echo ""
