# Local LLM Setup Guide

This guide explains how to run Agentic Soup with local LLM models via Ollama.

## Supported Provider

The system supports **Ollama** for local LLM inference.

## Setup with Ollama

### Setup Steps

1. **Install Ollama:**

```bash
# macOS
brew install ollama

# Linux
curl -fsSL https://ollama.ai/install.sh | sh
```

2. **Download and run the model:**

```bash
# Start Ollama service
ollama serve

# In another terminal, pull the model
ollama pull gpt-oss-20b  # Note: Model name may vary

# Or use a smaller model for testing
ollama pull llama2:7b
```

3. **Configure Agentic Soup:**

```bash
LOCAL_LLM_ENABLED=1
LOCAL_MODEL_PATH=granite3.1-dense:8b  # or any model you have installed
LOCAL_LLM_ENDPOINT=http://localhost:11434/api/generate
LLM_PROVIDER=local
```

## Multi-Provider Setup

You can configure both local and cloud providers for fallback:

```bash
# Primary: Local, Fallback: Vertex AI
LLM_PROVIDER=auto
LOCAL_LLM_ENABLED=1
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
```

The system will automatically try providers in order:
1. Local LLM (if enabled and running)
2. Google Vertex AI (if configured)
3. Mock/fallback behavior

## Recommended Models

For good performance with reasonable resource requirements:

- **granite3.1-dense:8b**: IBM's 8B parameter model
- **llama2:7b**: Meta's 7B parameter model
- **mistral:7b**: Mistral AI's 7B parameter model
- **phi3:3.8b**: Microsoft's efficient 3.8B parameter model

## Monitoring & Debugging

Check provider status:

```bash
# View logs
pnpm --filter @soup/soup-runner dev

# Look for messages like:
# [LLMProvider] Primary: local, Fallback order: local -> vertex
# [LocalLLM] Initialized with provider: huggingface, model: openai/gpt-oss-20b
# [LLMPlanner] Generated LLM plan for web_research using local
```

Token usage is tracked per provider and per agent to stay within budget limits.

## Troubleshooting

### Connection refused
- Ensure the inference server is running
- Check the endpoint URL and port
- Verify firewall settings

### Out of memory
- Use quantized models (Q4, Q5)
- Reduce max tokens and batch size
- Consider using a smaller model

### Slow inference
- Enable GPU acceleration
- Use quantized models
- Reduce max_tokens in requests
- Consider using a dedicated inference server

## Resources

- [Hugging Face TGI Documentation](https://huggingface.co/docs/text-generation-inference)
- [Ollama Documentation](https://ollama.ai/docs)
- [llama.cpp Repository](https://github.com/ggerganov/llama.cpp)
- [GPT-OSS-20B Model Card](https://huggingface.co/openai/gpt-oss-20b)