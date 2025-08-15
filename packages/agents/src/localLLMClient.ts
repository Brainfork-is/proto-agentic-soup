/**
 * Local LLM client for running models like GPT-OSS-20B
 * Supports Hugging Face Transformers via local inference server
 */

import fetch from 'node-fetch';

export interface LocalLLMConfig {
  modelPath?: string;
  endpoint?: string;
  maxTokensPerHour?: number;
  maxTokensPerAgent?: number;
}

export interface LocalLLMRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface LocalLLMResponse {
  content: string;
  tokensUsed: number;
  finishReason: string;
  modelUsed: string;
}

interface TokenBudget {
  maxTokensPerHour: number;
  maxTokensPerAgent: number;
  currentHourlyUsage: number;
  agentUsage: Map<string, number>;
  lastReset: Date;
}

export class LocalLLMClient {
  private endpoint: string;
  private modelPath: string;
  private provider: string;
  private budget: TokenBudget;
  private enabled: boolean;

  constructor(config: LocalLLMConfig = {}) {
    this.provider = 'ollama'; // Simplified to only support Ollama
    this.modelPath = config.modelPath || process.env.LOCAL_MODEL_PATH || 'granite3.1-dense:8b';
    this.endpoint =
      config.endpoint || process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434/api/generate';

    // Check if local LLM is configured
    this.enabled = !!(process.env.LOCAL_LLM_ENABLED === '1' || process.env.LOCAL_LLM_ENDPOINT);

    this.budget = {
      maxTokensPerHour:
        config.maxTokensPerHour || parseInt(process.env.LOCAL_LLM_MAX_TOKENS_PER_HOUR || '200000'),
      maxTokensPerAgent:
        config.maxTokensPerAgent || parseInt(process.env.LOCAL_LLM_MAX_TOKENS_PER_AGENT || '2000'),
      currentHourlyUsage: 0,
      agentUsage: new Map(),
      lastReset: new Date(),
    };

    // Reset budget every hour
    setInterval(() => this.resetHourlyBudget(), 60 * 60 * 1000);

    if (this.enabled) {
      console.log(
        `[LocalLLM] Initialized with provider: ${this.provider}, model: ${this.modelPath}`
      );
    }
  }

  private resetHourlyBudget() {
    this.budget.currentHourlyUsage = 0;
    this.budget.agentUsage.clear();
    this.budget.lastReset = new Date();
    console.log('[LocalLLM] Token budget reset');
  }

  private checkBudget(agentId: string, estimatedTokens: number): boolean {
    if (this.budget.currentHourlyUsage + estimatedTokens > this.budget.maxTokensPerHour) {
      console.log('[LocalLLM] Hourly token budget exceeded');
      return false;
    }

    const agentUsage = this.budget.agentUsage.get(agentId) || 0;
    if (agentUsage + estimatedTokens > this.budget.maxTokensPerAgent) {
      console.log(`[LocalLLM] Agent ${agentId} token budget exceeded`);
      return false;
    }

    return true;
  }

  private updateBudget(agentId: string, tokensUsed: number) {
    this.budget.currentHourlyUsage += tokensUsed;
    const currentAgentUsage = this.budget.agentUsage.get(agentId) || 0;
    this.budget.agentUsage.set(agentId, currentAgentUsage + tokensUsed);
  }

  async generateContent(
    request: LocalLLMRequest,
    agentId: string
  ): Promise<LocalLLMResponse | null> {
    if (!this.enabled) {
      console.log('[LocalLLM] Not enabled - set LOCAL_LLM_ENABLED=1 and configure endpoint');
      return null;
    }

    const estimatedTokens = Math.ceil(request.prompt.length / 4) + (request.maxTokens || 500);

    if (!this.checkBudget(agentId, estimatedTokens)) {
      return null;
    }

    try {
      // Ollama API format
      const payload = {
        model: this.modelPath,
        prompt: request.prompt,
        options: {
          temperature: request.temperature || 0.7,
          num_predict: request.maxTokens || 500,
          top_p: request.topP || 0.9,
        },
        stream: false,
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[LocalLLM] Generation failed: ${response.status} - ${error}`);
        return null;
      }

      const data = (await response.json()) as any;

      // Parse Ollama response
      const content = data.response || '';
      const finishReason = data.done_reason || 'stop';

      // Estimate tokens used
      const tokensUsed = Math.ceil(content.length / 4) + Math.ceil(request.prompt.length / 4);

      this.updateBudget(agentId, tokensUsed);

      console.log(`[LocalLLM] Generated ${tokensUsed} tokens for agent ${agentId}`);

      return {
        content,
        tokensUsed,
        finishReason,
        modelUsed: this.modelPath,
      };
    } catch (error) {
      console.error('[LocalLLM] Generation failed:', error);
      return null;
    }
  }

  /**
   * Check if local server is running and accessible
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const healthUrl = this.endpoint.replace(/\/[^\/]+$/, '/health');
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        console.log('[LocalLLM] Health check passed');
        return true;
      }
    } catch (error) {
      // Try alternative health endpoints
      try {
        const response = await fetch(this.endpoint.replace(/\/[^\/]+$/, '/'), {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok || response.status === 404) {
          console.log('[LocalLLM] Server is reachable');
          return true;
        }
      } catch (innerError) {
        console.log('[LocalLLM] Health check failed - server not reachable');
      }
    }

    return false;
  }

  getBudgetStatus(): TokenBudget {
    return { ...this.budget };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getModelInfo(): { provider: string; model: string; endpoint: string } {
    return {
      provider: this.provider,
      model: this.modelPath,
      endpoint: this.endpoint,
    };
  }
}

// Singleton instance
export const localLLMClient = new LocalLLMClient();
