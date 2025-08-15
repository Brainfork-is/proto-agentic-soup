/**
 * Unified LLM provider that manages multiple LLM backends
 * Supports Vertex AI, local models, and OpenAI with intelligent fallback
 */

import { vertexClient, LLMResponse as VertexResponse } from './vertexClient';
import { localLLMClient, LocalLLMResponse } from './localLLMClient';

export type LLMProviderType = 'vertex' | 'local' | 'auto';

export interface UnifiedLLMRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: LLMProviderType;
}

export interface UnifiedLLMResponse {
  content: string;
  tokensUsed: number;
  provider: string;
  modelUsed?: string;
  finishReason: string;
}

export class LLMProvider {
  private primaryProvider: LLMProviderType;
  private fallbackOrder: LLMProviderType[] = [];
  private providerStats: Map<string, { attempts: number; successes: number; totalTokens: number }> =
    new Map();

  constructor() {
    // Determine primary provider based on environment configuration
    this.primaryProvider = (process.env.LLM_PROVIDER as LLMProviderType) || 'auto';

    // Set up fallback order based on what's available
    this.configureFallbackOrder();

    console.log(
      `[LLMProvider] Primary: ${this.primaryProvider}, Fallback order: ${this.fallbackOrder.join(' -> ')}`
    );
  }

  private configureFallbackOrder() {
    this.fallbackOrder = [];

    // Check what's available and add to fallback order
    if (localLLMClient.isEnabled()) {
      this.fallbackOrder.push('local');
    }

    if (vertexClient.isEnabled()) {
      this.fallbackOrder.push('vertex');
    }

    // If primary is 'auto', use the first available provider
    if (this.primaryProvider === 'auto' && this.fallbackOrder.length > 0) {
      this.primaryProvider = this.fallbackOrder[0];
    }
  }

  async generateContent(
    request: UnifiedLLMRequest,
    agentId: string
  ): Promise<UnifiedLLMResponse | null> {
    const provider = request.preferredProvider || this.primaryProvider;

    // Try primary provider first
    if (provider !== 'auto') {
      const result = await this.tryProvider(provider, request, agentId);
      if (result) {
        this.updateStats(provider, true, result.tokensUsed);
        return result;
      }
    }

    // Try fallback providers in order
    for (const fallbackProvider of this.fallbackOrder) {
      if (fallbackProvider === provider) continue; // Skip if already tried

      console.log(`[LLMProvider] Falling back to ${fallbackProvider}`);
      const result = await this.tryProvider(fallbackProvider, request, agentId);
      if (result) {
        this.updateStats(fallbackProvider, true, result.tokensUsed);
        return result;
      }

      this.updateStats(fallbackProvider, false, 0);
    }

    console.log('[LLMProvider] All providers failed or unavailable');
    return null;
  }

  private async tryProvider(
    provider: LLMProviderType,
    request: UnifiedLLMRequest,
    agentId: string
  ): Promise<UnifiedLLMResponse | null> {
    switch (provider) {
      case 'local':
        return this.tryLocalLLM(request, agentId);

      case 'vertex':
        return this.tryVertexAI(request, agentId);

      default:
        return null;
    }
  }

  private async tryLocalLLM(
    request: UnifiedLLMRequest,
    agentId: string
  ): Promise<UnifiedLLMResponse | null> {
    if (!localLLMClient.isEnabled()) {
      return null;
    }

    try {
      const response = await localLLMClient.generateContent(
        {
          prompt: request.prompt,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        },
        agentId
      );

      if (!response) {
        return null;
      }

      return {
        content: response.content,
        tokensUsed: response.tokensUsed,
        provider: 'local',
        modelUsed: response.modelUsed,
        finishReason: response.finishReason,
      };
    } catch (error) {
      console.error('[LLMProvider] Local LLM error:', error);
      return null;
    }
  }

  private async tryVertexAI(
    request: UnifiedLLMRequest,
    agentId: string
  ): Promise<UnifiedLLMResponse | null> {
    if (!vertexClient.isEnabled()) {
      return null;
    }

    try {
      const response = await vertexClient.generateContent(
        {
          prompt: request.prompt,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        },
        agentId
      );

      if (!response) {
        return null;
      }

      return {
        content: response.content,
        tokensUsed: response.tokensUsed,
        provider: 'vertex',
        modelUsed: 'gemini-1.5-flash',
        finishReason: response.finishReason,
      };
    } catch (error) {
      console.error('[LLMProvider] Vertex AI error:', error);
      return null;
    }
  }

  private updateStats(provider: string, success: boolean, tokensUsed: number) {
    const stats = this.providerStats.get(provider) || { attempts: 0, successes: 0, totalTokens: 0 };
    stats.attempts++;
    if (success) {
      stats.successes++;
      stats.totalTokens += tokensUsed;
    }
    this.providerStats.set(provider, stats);
  }

  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [provider, providerStats] of this.providerStats) {
      stats[provider] = {
        ...providerStats,
        successRate:
          providerStats.attempts > 0
            ? ((providerStats.successes / providerStats.attempts) * 100).toFixed(1) + '%'
            : '0%',
        avgTokensPerRequest:
          providerStats.successes > 0
            ? Math.round(providerStats.totalTokens / providerStats.successes)
            : 0,
      };
    }
    return stats;
  }

  getAvailableProviders(): LLMProviderType[] {
    return [...this.fallbackOrder];
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    if (localLLMClient.isEnabled()) {
      health.local = await localLLMClient.healthCheck();
    }

    if (vertexClient.isEnabled()) {
      health.vertex = true; // Vertex doesn't have a health check endpoint
    }

    return health;
  }
}

// Singleton instance
export const llmProvider = new LLMProvider();
