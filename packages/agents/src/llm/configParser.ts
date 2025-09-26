/**
 * LLM Configuration Parser and Resolution
 */

import { ComponentType, ParsedLLMConfig, LLMConfig, LLMProviderType } from './types';
import { getVertexTokenLimit } from '@soup/common';

/**
 * Parses component-specific LLM configuration string
 * Format: "provider:model:temperature:maxTokens"
 * Examples:
 *   "ollama:llama3.2:7b:0.8:2000"       (Ollama model with parameter size)
 *   "vertex:gemini-1.5-pro:0.9:4000"    (Vertex AI model)
 *   "auto:granite3.1-dense:8b:0.1:"     (Auto with empty maxTokens)
 *
 * Note: Parses right-to-left to handle Ollama model names with colons (e.g., "llama3.2:7b")
 */
export function parseComponentConfig(configString: string): ParsedLLMConfig {
  const parts = configString.split(':');
  const parsed: ParsedLLMConfig = {};

  if (parts.length === 0) {
    return parsed;
  }

  // Parse provider (always first part)
  if (parts[0]) {
    parsed.provider = parts[0] as LLMProviderType;
  }

  if (parts.length === 1) {
    return parsed;
  }

  // Parse from right-to-left to handle model names with colons
  let rightIndex = parts.length - 1;

  // Only attempt to parse tokens and temperature if we have enough parts (at least 4)
  // Format: provider:model:temperature:tokens (minimum)
  if (parts.length >= 4) {
    // Try to parse maxOutputTokens (rightmost numeric value)
    if (rightIndex >= 1 && parts[rightIndex] !== '') {
      const tokens = parseInt(parts[rightIndex], 10);
      if (!isNaN(tokens)) {
        parsed.maxOutputTokens = tokens;
        rightIndex--;
      }
    } else if (rightIndex >= 1 && parts[rightIndex] === '') {
      // Empty maxTokens field (trailing colon)
      rightIndex--;
    }

    // Try to parse temperature (second from right, if numeric)
    if (rightIndex >= 1 && parts[rightIndex] !== '') {
      const temp = parseFloat(parts[rightIndex]);
      if (!isNaN(temp) && temp >= 0 && temp <= 2) {
        // Validate temperature range
        parsed.temperature = temp;
        rightIndex--;
      }
    }
  }

  // Everything between provider and temperature/maxTokens is the model name
  if (rightIndex >= 1) {
    const modelParts = parts.slice(1, rightIndex + 1);
    parsed.model = modelParts.join(':');
  }

  return parsed;
}

/**
 * Gets the component-specific default temperature based on use case
 */
function getDefaultTemperature(component: ComponentType): number {
  switch (component) {
    case 'name_generator':
      return 0.8; // High creativity for names
    case 'job_generator':
      return 0.9; // High creativity for job variety
    case 'result_grader':
      return 0.1; // Low temperature for consistent grading
    case 'code_generator':
      return 0.3; // Lower temperature for more consistent code
    case 'agent':
      return 0.7; // Balanced for agent reasoning
    case 'swarm_synthesizer':
      return 0.7; // Balanced for synthesis
    case 'tool_builder':
      return 0.7; // Balanced for tool planning
    default:
      return 0.7;
  }
}

/**
 * Gets the default model based on provider type
 */
function getDefaultModel(provider: LLMProviderType): string {
  switch (provider) {
    case 'vertex':
      return process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';
    case 'ollama':
      return process.env.OLLAMA_MODEL || 'llama3.2';
    case 'auto':
      return process.env.DEFAULT_MODEL || 'gemini-1.5-flash';
    default:
      return 'gemini-1.5-flash';
  }
}

/**
 * Resolves the global provider setting from environment variables
 */
function resolveGlobalProvider(): LLMProviderType {
  // Check new LLM_PROVIDER variable first
  const provider = process.env.LLM_PROVIDER?.toLowerCase();
  if (provider === 'vertex' || provider === 'ollama' || provider === 'auto') {
    return provider as LLMProviderType;
  }

  // Backward compatibility with LOCAL_LLM_ENABLED
  const localEnabled = process.env.LOCAL_LLM_ENABLED;
  if (localEnabled === '1' || localEnabled?.toLowerCase() === 'true') {
    return 'ollama';
  }

  return 'vertex'; // Default fallback
}

/**
 * Resolves complete LLM configuration for a component
 */
export function resolveLLMConfig(component: ComponentType): LLMConfig {
  // Step 1: Get component-specific configuration if available
  const componentConfigKey = `LLM_CONFIG_${component.toUpperCase()}`;
  const componentConfigString = process.env[componentConfigKey];

  let parsedConfig: ParsedLLMConfig = {};
  if (componentConfigString) {
    parsedConfig = parseComponentConfig(componentConfigString);
  }

  // Step 2: Resolve provider (component-specific > global > fallback)
  const provider = parsedConfig.provider || resolveGlobalProvider();

  // Step 3: Resolve model (component-specific > provider-default > fallback)
  const model = parsedConfig.model || getDefaultModel(provider);

  // Step 4: Resolve temperature (component-specific > component-default)
  const temperature = parsedConfig.temperature ?? getDefaultTemperature(component);

  // Step 5: Resolve token limit (component-specific > existing system limits)
  // Map new components to existing ones for backward compatibility
  const tokenLimitComponent =
    component === 'result_grader'
      ? 'llm_grader'
      : component === 'swarm_synthesizer'
        ? 'agent'
        : component;
  const maxOutputTokens = parsedConfig.maxOutputTokens ?? getVertexTokenLimit(tokenLimitComponent);

  const finalConfig: LLMConfig = {
    provider,
    model,
    temperature,
    maxOutputTokens,
  };

  return finalConfig;
}

/**
 * Gets Ollama URL from environment with fallback
 */
export function getOllamaUrl(): string {
  return process.env.OLLAMA_URL || 'http://localhost:11434';
}
