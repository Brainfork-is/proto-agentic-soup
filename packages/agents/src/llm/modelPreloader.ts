/**
 * Model Preloader - Ensures Ollama models are loaded before system starts
 */

import { log, logError } from '@soup/common';

export interface PreloadOptions {
  ollamaUrl: string;
  models: string[];
  timeoutMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface PreloadResult {
  success: boolean;
  loadedModels: string[];
  failedModels: string[];
  totalTime: number;
  errors?: string[];
}

export class ModelPreloader {
  private ollamaUrl: string;

  constructor(ollamaUrl: string = 'http://localhost:11434') {
    this.ollamaUrl = ollamaUrl.replace(/\/$/, '');
  }

  /**
   * Preload multiple models concurrently
   */
  async preloadModels(models: string[], options?: Partial<PreloadOptions>): Promise<PreloadResult> {
    const startTime = Date.now();
    const {
      timeoutMs = 60000, // 1 minute per model
      retryAttempts = 2,
      retryDelayMs = 1000,
    } = options || {};

    log(`[ModelPreloader] Starting preload for ${models.length} model(s): ${models.join(', ')}`);

    const loadedModels: string[] = [];
    const failedModels: string[] = [];
    const errors: string[] = [];

    // Preload models sequentially to avoid overwhelming the server
    for (const model of models) {
      try {
        const loaded = await this.preloadSingleModel(model, {
          timeoutMs,
          retryAttempts,
          retryDelayMs,
        });

        if (loaded) {
          loadedModels.push(model);
          log(`[ModelPreloader] ✅ Model ${model} preloaded successfully`);
        } else {
          failedModels.push(model);
          errors.push(`Failed to preload model ${model}`);
        }
      } catch (error) {
        failedModels.push(model);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Error preloading ${model}: ${errorMsg}`);
        logError(`[ModelPreloader] ❌ Failed to preload model ${model}:`, error);
      }
    }

    const totalTime = Date.now() - startTime;
    const result: PreloadResult = {
      success: failedModels.length === 0,
      loadedModels,
      failedModels,
      totalTime,
      errors: errors.length > 0 ? errors : undefined,
    };

    if (result.success) {
      log(
        `[ModelPreloader] ✅ All ${models.length} model(s) preloaded successfully in ${totalTime}ms`
      );
    } else {
      logError(
        `[ModelPreloader] ❌ ${failedModels.length}/${models.length} model(s) failed to preload`,
        {
          loaded: loadedModels,
          failed: failedModels,
          errors,
          totalTime,
        }
      );
    }

    return result;
  }

  /**
   * Preload a single model with retry logic
   */
  private async preloadSingleModel(
    model: string,
    options: { timeoutMs: number; retryAttempts: number; retryDelayMs: number }
  ): Promise<boolean> {
    const { timeoutMs, retryAttempts, retryDelayMs } = options;

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        log(
          `[ModelPreloader] Attempting to preload ${model} (attempt ${attempt}/${retryAttempts})`
        );

        // Use the /api/generate endpoint with minimal payload to trigger model loading
        const success = await this.triggerModelLoad(model, timeoutMs);

        if (success) {
          return true;
        }

        if (attempt < retryAttempts) {
          log(
            `[ModelPreloader] Preload attempt ${attempt} failed for ${model}, retrying in ${retryDelayMs}ms...`
          );
          await this.delay(retryDelayMs);
        }
      } catch (error) {
        if (attempt === retryAttempts) {
          throw error;
        }

        log(
          `[ModelPreloader] Preload attempt ${attempt} failed for ${model}, retrying in ${retryDelayMs}ms...`
        );
        await this.delay(retryDelayMs);
      }
    }

    return false;
  }

  /**
   * Trigger model loading by making a minimal generate request
   */
  private async triggerModelLoad(model: string, timeoutMs: number): Promise<boolean> {
    const url = `${this.ollamaUrl}/api/generate`;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'ModelPreloader/1.0',
        },
        body: JSON.stringify({
          model,
          prompt: 'Ready?', // Minimal prompt to trigger model loading
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 1, // Only generate 1 token to minimize response time
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        logError(
          `[ModelPreloader] HTTP ${response.status} when preloading ${model} after ${responseTime}ms`
        );
        return false;
      }

      const data = await response.json();

      if (!data.response && data.error) {
        logError(`[ModelPreloader] Ollama error when preloading ${model}:`, data.error);
        return false;
      }

      log(`[ModelPreloader] Model ${model} responded in ${responseTime}ms (loaded and ready)`);
      return true;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if ((error as any).name === 'AbortError') {
        logError(
          `[ModelPreloader] Timeout (${timeoutMs}ms) when preloading ${model} after ${responseTime}ms`
        );
      } else {
        logError(`[ModelPreloader] Error preloading ${model} after ${responseTime}ms:`, error);
      }

      return false;
    }
  }

  /**
   * Check which models are currently loaded in Ollama
   */
  async getLoadedModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/ps`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logError(`[ModelPreloader] Failed to get loaded models: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();

      // Extract model names from the running models list
      const loadedModels = (data.models || []).map((m: any) => m.name || m.model);

      return loadedModels;
    } catch (error) {
      logError('[ModelPreloader] Error getting loaded models:', error);
      return [];
    }
  }

  /**
   * Check if a specific model is currently loaded
   */
  async isModelLoaded(model: string): Promise<boolean> {
    const loadedModels = await this.getLoadedModels();
    return loadedModels.includes(model);
  }

  /**
   * Get the estimated time to preload models based on their sizes
   */
  async getPreloadEstimate(models: string[]): Promise<{ model: string; estimatedMs: number }[]> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        // Fallback estimates if we can't get model info
        return models.map((model) => ({ model, estimatedMs: 10000 })); // 10 seconds default
      }

      const data = await response.json();
      const availableModels = data.models || [];

      return models.map((model) => {
        const modelInfo = availableModels.find((m: any) => m.name === model);

        if (!modelInfo) {
          return { model, estimatedMs: 15000 }; // 15 seconds for unknown models
        }

        // Estimate based on model size (rough heuristic)
        const size = modelInfo.size || 0;

        if (size > 10_000_000_000) {
          // > 10GB
          return { model, estimatedMs: 60000 }; // 1 minute
        } else if (size > 5_000_000_000) {
          // > 5GB
          return { model, estimatedMs: 30000 }; // 30 seconds
        } else if (size > 1_000_000_000) {
          // > 1GB
          return { model, estimatedMs: 15000 }; // 15 seconds
        } else {
          return { model, estimatedMs: 10000 }; // 10 seconds
        }
      });
    } catch (error) {
      logError('[ModelPreloader] Error getting preload estimates:', error);
      return models.map((model) => ({ model, estimatedMs: 10000 }));
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Convenience function for quick model preloading
 */
export async function preloadModels(
  models: string[],
  ollamaUrl?: string,
  options?: Partial<PreloadOptions>
): Promise<PreloadResult> {
  const preloader = new ModelPreloader(ollamaUrl);
  return preloader.preloadModels(models, options);
}
