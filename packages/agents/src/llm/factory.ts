/**
 * LLM Provider Factory - Main entry point for creating LLM providers
 */

import { LLMProvider, ComponentType, LLMConfig } from './types';
import { VertexAIProvider } from './vertexProvider';
import { OllamaProvider } from './ollamaProvider';
import { resolveLLMConfig, getOllamaUrl } from './configParser';
import { log, logError } from '@soup/common';

/**
 * Creates an LLM provider for a specific component
 * Handles configuration resolution, provider selection, and error handling
 */
export function createLLMProvider(component: ComponentType): LLMProvider {
  try {
    // Resolve complete configuration for this component
    const config = resolveLLMConfig(component);

    log(
      `[LLMFactory] Creating ${config.provider} provider for ${component}: ${config.model} (temp=${config.temperature})`
    );

    // Create provider based on resolved configuration
    switch (config.provider) {
      case 'vertex':
        return new VertexAIProvider(config);

      case 'ollama': {
        const ollamaUrl = getOllamaUrl();
        return new OllamaProvider(config, ollamaUrl);
      }

      case 'auto':
        // Auto provider tries vertex first, then ollama as fallback
        return createAutoProvider(config, component);

      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown factory error';
    logError(`[LLMFactory] Failed to create provider for ${component}: ${errorMsg}`);
    throw new Error(`LLM provider creation failed for ${component}: ${errorMsg}`);
  }
}

/**
 * Auto provider implementation - tries Vertex AI first, then Ollama
 */
function createAutoProvider(config: LLMConfig, component: ComponentType): LLMProvider {
  try {
    // First try Vertex AI
    log(`[LLMFactory] Auto provider trying Vertex AI for ${component}`);
    const vertexConfig = { ...config, provider: 'vertex' as const };
    return new VertexAIProvider(vertexConfig);
  } catch (vertexError) {
    log(
      `[LLMFactory] Vertex AI failed for ${component}, trying Ollama: ${vertexError instanceof Error ? vertexError.message : 'Unknown error'}`
    );

    try {
      // Fallback to Ollama
      const ollamaConfig = { ...config, provider: 'ollama' as const };
      const ollamaUrl = getOllamaUrl();
      return new OllamaProvider(ollamaConfig, ollamaUrl);
    } catch (ollamaError) {
      throw new Error(
        `Auto provider failed - Vertex AI: ${vertexError instanceof Error ? vertexError.message : 'Unknown error'}, Ollama: ${ollamaError instanceof Error ? ollamaError.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Convenience function for backward compatibility
 * Creates an LLM provider with the same interface as before
 */
export function createVertexAILLM(component: ComponentType = 'agent'): LLMProvider {
  return createLLMProvider(component);
}

/**
 * Creates a LangChain-compatible LLM instance for tools requiring the underlying model
 * Note: This works with Vertex AI and Ollama providers that implement LangChain compatibility
 */
export function createVertexAILangChainLLM(component: ComponentType = 'agent'): any {
  const provider = createLLMProvider(component);

  // Check if this provider has LangChain model access
  if ('getLangChainModel' in provider) {
    return (provider as any).getLangChainModel();
  }

  throw new Error(`LangChain model access not available for provider: ${provider.getProvider()}`);
}

/**
 * Test function to verify provider configuration
 */
export async function testProviderConfiguration(component: ComponentType): Promise<{
  success: boolean;
  provider: string;
  model: string;
  error?: string;
}> {
  try {
    const provider = createLLMProvider(component);

    // Test with a simple prompt
    await provider.invoke('Hello, this is a test.');

    return {
      success: true,
      provider: provider.getProvider(),
      model: provider.getModel(),
    };
  } catch (error) {
    return {
      success: false,
      provider: 'unknown',
      model: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown test error',
    };
  }
}
