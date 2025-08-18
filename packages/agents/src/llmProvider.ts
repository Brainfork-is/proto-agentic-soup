/**
 * Unified LLM provider that manages multiple LLM backends
 * Supports Vertex AI, local models, and OpenAI with intelligent fallback
 */

import { vertexClient } from './vertexClient';
import { localLLMClient } from './localLLMClient';

export type LLMProviderType = 'vertex' | 'local' | 'auto';

export interface UnifiedLLMRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: LLMProviderType;
}

export interface StructuredLLMRequest extends UnifiedLLMRequest {
  schema: any; // Zod schema for structured output
}

export interface UnifiedLLMResponse {
  content: string;
  tokensUsed: number;
  provider: string;
  modelUsed?: string;
  finishReason: string;
}

interface QueuedRequest {
  request: UnifiedLLMRequest;
  agentId: string;
  resolve: (value: UnifiedLLMResponse | null) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

export class LLMProvider {
  private primaryProvider: LLMProviderType;
  private fallbackOrder: LLMProviderType[] = [];
  private providerStats: Map<string, { attempts: number; successes: number; totalTokens: number }> =
    new Map();

  // Rate limiting and queuing
  private requestQueue: QueuedRequest[] = [];
  private activeRequests: number = 0;
  private maxConcurrentRequests: number = parseInt(process.env.LLM_MAX_CONCURRENT_REQUESTS || '3');
  private maxQueueSize: number = parseInt(process.env.LLM_MAX_QUEUE_SIZE || '50');
  private requestsPerSecond: number = parseFloat(process.env.LLM_REQUESTS_PER_SECOND || '2');
  private lastRequestTime: number = 0;
  private processing: boolean = false;

  // Circuit breaker for health monitoring
  private circuitBreaker: {
    isOpen: boolean;
    failureCount: number;
    consecutiveFailures: number;
    lastFailureTime: number;
    maxFailures: number;
    timeoutMs: number;
  } = {
    isOpen: false,
    failureCount: 0,
    consecutiveFailures: 0,
    lastFailureTime: 0,
    maxFailures: parseInt(process.env.LLM_CIRCUIT_BREAKER_MAX_FAILURES || '5'),
    timeoutMs: parseInt(process.env.LLM_CIRCUIT_BREAKER_TIMEOUT_MS || '30000'),
  };

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
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      console.warn(`[LLMProvider] Circuit breaker open, rejecting request from ${agentId}`);
      return null;
    }

    return new Promise((resolve, reject) => {
      // Check queue size to prevent memory overflow
      if (this.requestQueue.length >= this.maxQueueSize) {
        console.warn(
          `[LLMProvider] Queue full (${this.maxQueueSize}), rejecting request from ${agentId}`
        );
        this.recordFailure();
        resolve(null);
        return;
      }

      // Add to queue
      this.requestQueue.push({
        request,
        agentId,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      // Process queue if not already processing
      this.processQueue();
    });
  }

  private isCircuitOpen(): boolean {
    if (!this.circuitBreaker.isOpen) {
      return false;
    }

    // Check if timeout period has passed
    const now = Date.now();
    if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeoutMs) {
      console.log('[LLMProvider] Circuit breaker timeout expired, attempting to close');
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.consecutiveFailures = 0;
      return false;
    }

    return true;
  }

  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.consecutiveFailures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.consecutiveFailures >= this.circuitBreaker.maxFailures) {
      console.warn(
        `[LLMProvider] Circuit breaker opened after ${this.circuitBreaker.consecutiveFailures} consecutive failures`
      );
      this.circuitBreaker.isOpen = true;
    }
  }

  private recordSuccess(): void {
    this.circuitBreaker.consecutiveFailures = 0;
    if (this.circuitBreaker.isOpen) {
      console.log('[LLMProvider] Circuit breaker closed after successful request');
      this.circuitBreaker.isOpen = false;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      // Rate limiting: ensure minimum time between requests
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const minInterval = 1000 / this.requestsPerSecond;

      if (timeSinceLastRequest < minInterval) {
        const delay = minInterval - timeSinceLastRequest;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const queuedRequest = this.requestQueue.shift();
      if (!queuedRequest) break;

      // Check if request is too old (timeout)
      if (now - queuedRequest.timestamp > 30000) {
        // 30 second timeout
        console.warn(`[LLMProvider] Request from ${queuedRequest.agentId} timed out in queue`);
        queuedRequest.resolve(null);
        continue;
      }

      this.lastRequestTime = Date.now();
      this.activeRequests++;

      // Process request asynchronously
      this.executeRequest(queuedRequest).finally(() => {
        this.activeRequests--;
        // Continue processing queue
        setTimeout(() => this.processQueue(), 0);
      });
    }

    this.processing = false;
  }

  private async executeRequest(queuedRequest: QueuedRequest): Promise<void> {
    try {
      const { request, agentId } = queuedRequest;
      const provider = request.preferredProvider || this.primaryProvider;

      // Try primary provider first
      if (provider !== 'auto') {
        const result = await this.tryProvider(provider, request, agentId);
        if (result) {
          this.updateStats(provider, true, result.tokensUsed);
          this.recordSuccess();
          queuedRequest.resolve(result);
          return;
        }
      }

      // Try fallback providers in order
      for (const fallbackProvider of this.fallbackOrder) {
        if (fallbackProvider === provider) continue; // Skip if already tried

        console.log(`[LLMProvider] Falling back to ${fallbackProvider} for ${agentId}`);
        const result = await this.tryProvider(fallbackProvider, request, agentId);
        if (result) {
          this.updateStats(fallbackProvider, true, result.tokensUsed);
          this.recordSuccess();
          queuedRequest.resolve(result);
          return;
        }

        this.updateStats(fallbackProvider, false, 0);
      }

      console.log(`[LLMProvider] All providers failed for ${agentId}`);
      this.recordFailure();
      queuedRequest.resolve(null);
    } catch (error) {
      console.error(`[LLMProvider] Error processing request from ${queuedRequest.agentId}:`, error);
      this.recordFailure();
      queuedRequest.resolve(null);
    }
  }

  async generateStructuredContent(
    request: StructuredLLMRequest,
    agentId: string
  ): Promise<UnifiedLLMResponse | null> {
    // For now, fall back to regular generation with structured prompt
    // In the future, this can be enhanced to use native structured output when available
    const structuredPrompt =
      request.prompt +
      '\n\nRespond with valid JSON matching the required schema. Do not include any additional text or explanations.';

    const response = await this.generateContent(
      {
        ...request,
        prompt: structuredPrompt,
      },
      agentId
    );

    if (!response) {
      return null;
    }

    try {
      // Try to parse as JSON and validate against schema
      let jsonStr = response.content;

      // Extract JSON from markdown blocks if present
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }

      const parsed = JSON.parse(jsonStr);
      const validated = request.schema.parse(parsed);

      return {
        ...response,
        content: validated, // Return the validated structured data
      };
    } catch (error) {
      console.error(`[LLMProvider] Structured output parsing failed:`, error);
      console.error(`[LLMProvider] Raw content:`, response.content);

      // Return null to indicate failure rather than throwing
      return null;
    }
  }

  private async tryProvider(
    provider: LLMProviderType,
    request: UnifiedLLMRequest,
    agentId: string
  ): Promise<UnifiedLLMResponse | null> {
    switch (provider) {
      case 'local': {
        return this.tryLocalLLM(request, agentId);
      }

      case 'vertex': {
        return this.tryVertexAI(request, agentId);
      }

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

    // Add queue and performance stats
    stats.queue = {
      queueSize: this.requestQueue.length,
      activeRequests: this.activeRequests,
      maxConcurrentRequests: this.maxConcurrentRequests,
      requestsPerSecond: this.requestsPerSecond,
      maxQueueSize: this.maxQueueSize,
    };

    // Add circuit breaker stats
    stats.circuitBreaker = {
      isOpen: this.circuitBreaker.isOpen,
      totalFailures: this.circuitBreaker.failureCount,
      consecutiveFailures: this.circuitBreaker.consecutiveFailures,
      lastFailureTime: this.circuitBreaker.lastFailureTime,
      maxFailures: this.circuitBreaker.maxFailures,
      timeoutMs: this.circuitBreaker.timeoutMs,
    };

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
