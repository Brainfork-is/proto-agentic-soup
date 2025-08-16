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
  enableBudgetLimits?: boolean;
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
  private budgetEnabled: boolean;

  constructor(config: LocalLLMConfig = {}) {
    this.provider = 'ollama'; // Simplified to only support Ollama
    this.modelPath = config.modelPath || process.env.LOCAL_MODEL_PATH || 'granite3.1-dense:8b';
    this.endpoint =
      config.endpoint || process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434/api/generate';

    // Check if local LLM is configured
    this.enabled = !!(process.env.LOCAL_LLM_ENABLED === '1' || process.env.LOCAL_LLM_ENDPOINT);

    // Disable budget limits by default for local LLM (since it's running on user's own hardware)
    // Can be re-enabled via config or environment variable if needed
    this.budgetEnabled =
      config.enableBudgetLimits !== undefined
        ? config.enableBudgetLimits
        : process.env.LOCAL_LLM_ENABLE_BUDGET_LIMITS === '1';

    this.budget = {
      maxTokensPerHour:
        config.maxTokensPerHour || parseInt(process.env.LOCAL_LLM_MAX_TOKENS_PER_HOUR || '200000'),
      maxTokensPerAgent:
        config.maxTokensPerAgent || parseInt(process.env.LOCAL_LLM_MAX_TOKENS_PER_AGENT || '2000'),
      currentHourlyUsage: 0,
      agentUsage: new Map(),
      lastReset: new Date(),
    };

    // Reset budget every hour (only if budget is enabled)
    if (this.budgetEnabled) {
      setInterval(() => this.resetHourlyBudget(), 60 * 60 * 1000);
    }

    if (this.enabled) {
      console.log(
        `[LocalLLM] Initialized with provider: ${this.provider}, model: ${this.modelPath}, budget limits: ${this.budgetEnabled ? 'enabled' : 'disabled'}`
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
    // Skip budget checks if disabled (default for local LLM)
    if (!this.budgetEnabled) {
      return true;
    }

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
    // Only track usage if budget is enabled
    if (this.budgetEnabled) {
      this.budget.currentHourlyUsage += tokensUsed;
      const currentAgentUsage = this.budget.agentUsage.get(agentId) || 0;
      this.budget.agentUsage.set(agentId, currentAgentUsage + tokensUsed);
    }
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

    let startTime = Date.now();

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

      console.log(
        `[LocalLLM] Sending request to ${this.modelPath} with prompt length: ${request.prompt.length}, estimated tokens: ${estimatedTokens}`
      );

      startTime = Date.now();

      // Use longer timeout for large models (10 minutes)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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

      const duration = Date.now() - startTime;
      console.log(
        `[LocalLLM] Generated ${tokensUsed} tokens for agent ${agentId} in ${duration}ms`
      );

      return {
        content,
        tokensUsed,
        finishReason,
        modelUsed: this.modelPath,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      if ((error as any)?.name === 'AbortError') {
        console.error(
          `[LocalLLM] Request timed out after ${duration}ms for agent ${agentId}. Model: ${this.modelPath}`
        );
      } else {
        console.error(`[LocalLLM] Generation failed after ${duration}ms:`, error);
      }
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
      // For Ollama, try the root endpoint first as it returns "Ollama is running"
      const rootUrl = this.endpoint.replace(/\/[^/]+$/, '/');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(rootUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const text = await response.text();
        if (text.includes('Ollama is running') || text.includes('running')) {
          console.log('[LocalLLM] Health check passed - Ollama is running');
          return true;
        }
      }
    } catch (error) {
      console.log('[LocalLLM] Health check failed - server not reachable:', error);
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
