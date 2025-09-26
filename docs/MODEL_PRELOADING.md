# Model Preloading

This document explains the model preloading feature that helps mitigate cold start delays when using Ollama models.

## Overview

When Ollama hasn't been used for a while, models get unloaded from memory to free up resources. When a model is needed again, Ollama must reload it from disk, which can take anywhere from 10 seconds to several minutes depending on model size.

The model preloading feature automatically loads all required models into memory during system startup, ensuring they're ready when agents need them.

## How it Works

1. **Early Startup**: Model preloading happens **before** database seeding to ensure models are ready for name generation during swarm creation.

2. **Model Detection**: The system identifies models from:
   - Environment variable defaults (`LLM_MODEL`, `OLLAMA_MODEL`, `DEFAULT_MODEL`)
   - Component-specific configs (e.g., `LLM_CONFIG_NAME_GENERATOR`)
   - Grader configuration (`GRADER_MODEL`)
   - Existing agent blueprints in database (if available)

3. **Smart Loading**: The system:
   - Checks which models are already loaded in Ollama
   - Only preloads Ollama models (filters out Vertex AI, OpenAI models)
   - Only preloads models that aren't already in memory
   - Uses minimal "Ready?" prompts to trigger model loading

4. **Robust Retry**: Failed preloads are retried with exponential backoff

5. **Non-blocking**: Preload failures don't prevent system startup - models will load on first use

## Configuration

Set these environment variables in your `.env` file:

```bash
# Enable/disable model preloading (default: 1)
PRELOAD_MODELS=1

# Timeout per model in seconds (default: 90)
PRELOAD_TIMEOUT_SECONDS=90

# Number of retry attempts per model (default: 2)
PRELOAD_RETRY_ATTEMPTS=2
```

## Usage

Model preloading happens automatically when you start the system:

```bash
pnpm dev
```

You'll see logs like:

```
[System] Preloading 2 Ollama model(s): llama3.2, codellama
[System] Estimated preload time: 45s
[ModelPreloader] Model llama3.2 responded in 12543ms (loaded and ready)
[ModelPreloader] Model codellama responded in 8932ms (loaded and ready)
[System] ✅ Model preloading completed successfully in 22s
[seedSwarms] Generating 5 swarm names in batch...
[seedSwarms] Creating swarm "Alpha Research Collective" with archetypes: tool-builder, web-browser
```

The preloading happens **before** swarm seeding to ensure name generation doesn't encounter cold start delays.

## Disabling Preloading

To disable model preloading (e.g., for development or when models are already warm):

```bash
PRELOAD_MODELS=0
```

Or:

```bash
PRELOAD_MODELS=false
```

## API Endpoints

The `ModelPreloader` class provides programmatic access:

```typescript
import { ModelPreloader } from '@soup/agents';

const preloader = new ModelPreloader('http://localhost:11434');

// Check which models are loaded
const loaded = await preloader.getLoadedModels();

// Check if a specific model is loaded
const isLoaded = await preloader.isModelLoaded('llama3.2');

// Preload specific models
const result = await preloader.preloadModels(['llama3.2', 'codellama']);
```

## Troubleshooting

### Models Not Preloading

1. **Check Ollama Connection**: Ensure Ollama is running and accessible at the configured URL
2. **Verify Model Names**: Check that model names in your configuration match exactly what Ollama has installed
3. **Check Logs**: Look for specific error messages in the startup logs
4. **Test Manually**: Try `curl http://localhost:11434/api/tags` to see available models

### Slow Preloading

1. **Increase Timeout**: Set `PRELOAD_TIMEOUT_SECONDS` to a higher value (e.g., 180 for large models)
2. **Check Resources**: Ensure your system has sufficient RAM and CPU for model loading
3. **Sequential Loading**: Models are loaded one at a time to avoid overwhelming the server

### Preload Failures Don't Block Startup

This is intentional. If preloading fails:
- The system will continue to start normally
- Models will load on first use (with the usual delay)
- Check logs for the specific failure reason

## Benefits

- **Faster First Response**: Agents get immediate responses instead of waiting for model loading
- **Predictable Performance**: Eliminates variable cold start delays during operation
- **Better User Experience**: Consistent response times from system startup
- **Resource Optimization**: Only loads models that are actually needed

## Technical Details

- Uses Ollama's `/api/generate` endpoint with minimal prompts to trigger loading
- Implements exponential backoff for retry logic
- Checks `/api/ps` to see currently loaded models
- Falls back gracefully if Ollama API is unavailable
- Respects model size for timeout estimation via `/api/tags`