#!/bin/bash
set -euo pipefail

# ── VoxTape LLM Model Downloader ────────────────────────────────
# Downloads Mistral-7B-Instruct GGUF (~4.4GB) from HuggingFace

MODELS_DIR="$(cd "$(dirname "$0")/.." && pwd)/models"
LLM_DIR="$MODELS_DIR/llm"

MODEL_NAME="Mistral-7B-Instruct-v0.3-Q4_K_M.gguf"
MODEL_URL="https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/$MODEL_NAME"

echo "╔══════════════════════════════════════════════════╗"
echo "║       VoxTape — LLM Model Downloader             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

mkdir -p "$LLM_DIR"

if [ -f "$LLM_DIR/$MODEL_NAME" ]; then
  echo "✓ $MODEL_NAME already downloaded"
else
  echo "⬇ Downloading $MODEL_NAME (~4.4GB)..."
  echo "  This may take a while depending on your connection..."
  echo ""
  curl -fL --progress-bar -o "$LLM_DIR/$MODEL_NAME.tmp" "$MODEL_URL"
  mv "$LLM_DIR/$MODEL_NAME.tmp" "$LLM_DIR/$MODEL_NAME"
  echo "✓ $MODEL_NAME downloaded"
fi

echo ""
echo "── LLM Model Status ────────────────────────────────"
echo "LLM:  $([ -f "$LLM_DIR/$MODEL_NAME" ] && echo "✓ Ready ($(du -h "$LLM_DIR/$MODEL_NAME" | cut -f1))" || echo '✗ Missing')"
echo ""
