#!/bin/bash

# Script to run local LLM with proper logging and options

echo "Starting Local LLM Server..."
echo "This may take 10-30 minutes on first run to download the model"
echo ""

# Check if user wants GPU or CPU
read -p "Use GPU acceleration? (y/n): " USE_GPU

# Select model
echo ""
echo "Select model:"
echo "1) OpenAI GPT-OSS-20B (40GB download, 48GB+ RAM needed)"
echo "2) Mistral 7B Instruct (13GB download, 16GB RAM needed) - Recommended for testing"
echo "3) TinyLlama 1.1B (2GB download, 4GB RAM needed) - Fast, for testing"
echo "4) Custom model"
read -p "Choice (1-4): " MODEL_CHOICE

case $MODEL_CHOICE in
  1)
    MODEL_ID="openai/gpt-oss-20b"
    MAX_INPUT=2048
    MAX_TOTAL=4096
    ;;
  2)
    MODEL_ID="mistralai/Mistral-7B-Instruct-v0.2"
    MAX_INPUT=2048
    MAX_TOTAL=4096
    ;;
  3)
    MODEL_ID="TinyLlama/TinyLlama-1.1B-Chat-v1.0"
    MAX_INPUT=1024
    MAX_TOTAL=2048
    ;;
  4)
    read -p "Enter model ID (e.g., meta-llama/Llama-2-7b-hf): " MODEL_ID
    MAX_INPUT=2048
    MAX_TOTAL=4096
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

# Build docker command
DOCKER_CMD="docker run --rm -it"

if [ "$USE_GPU" = "y" ]; then
  DOCKER_CMD="$DOCKER_CMD --gpus all"
  echo "Using GPU acceleration"
else
  echo "Using CPU only (will be slower)"
fi

DOCKER_CMD="$DOCKER_CMD \
  --shm-size 1g \
  -p 8080:80 \
  -v $HOME/.cache/huggingface:/data \
  -e HUGGING_FACE_HUB_TOKEN=${HUGGING_FACE_HUB_TOKEN:-} \
  ghcr.io/huggingface/text-generation-inference:latest \
  --model-id $MODEL_ID \
  --max-input-length $MAX_INPUT \
  --max-total-tokens $MAX_TOTAL"

echo ""
echo "Starting server with model: $MODEL_ID"
echo "Cache directory: $HOME/.cache/huggingface"
echo ""
echo "Command: $DOCKER_CMD"
echo ""
echo "========================================="
echo "WHAT TO EXPECT:"
echo "1. Docker image download (first time only)"
echo "2. Model download (first time only) - this can take 10-30 minutes"
echo "3. Model loading into memory - 1-5 minutes"
echo "4. Server ready message"
echo ""
echo "Look for: 'Connected' or 'Serving on' message"
echo "Test with: curl http://localhost:8080/health"
echo "========================================="
echo ""

# Run the docker command
eval $DOCKER_CMD