#!/bin/bash

echo "Testing Local LLM Endpoints..."
echo ""

# Test common endpoints
endpoints=(
  "http://localhost:8080/health"
  "http://localhost:8080/v1/completions"
  "http://localhost:11434/api/version"
  "http://localhost:3001/v1/completions"
)

for endpoint in "${endpoints[@]}"; do
  echo -n "Testing $endpoint: "
  if curl -s --connect-timeout 2 "$endpoint" > /dev/null 2>&1; then
    echo "✅ ACTIVE"
  else
    echo "❌ Not responding"
  fi
done

echo ""
echo "Quick test with dummy data:"
echo ""

# Test text generation inference format
echo "Testing TGI format (port 8080):"
curl -s --connect-timeout 2 -X POST http://localhost:8080/generate \
  -H "Content-Type: application/json" \
  -d '{"inputs": "What is AI?", "parameters": {"max_new_tokens": 10}}' || echo "Not available"

echo ""
echo ""

# Test Ollama format  
echo "Testing Ollama format (port 11434):"
curl -s --connect-timeout 2 -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-oss-20b", "prompt": "What is AI?", "stream": false}' || echo "Not available"

echo ""
echo ""

# Show what models we have locally
echo "Local model directory:"
ls -la gpt-oss-20b/ 2>/dev/null || echo "gpt-oss-20b directory not found"

echo ""
echo "To configure Agentic Soup, set these environment variables:"
echo "LOCAL_LLM_ENABLED=1"
echo "LOCAL_LLM_PROVIDER=huggingface  # or ollama"
echo "LOCAL_LLM_ENDPOINT=http://localhost:8080/v1/completions  # or 11434 for ollama"
echo "LLM_PROVIDER=local"