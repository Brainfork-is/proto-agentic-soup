/**
 * Ollama Provider Implementation
 */

import { LLMProvider, LLMConfig, LLMResponse } from './types';
import { log, logError } from '@soup/common';
import { ChatOllama } from '@langchain/ollama';
import {
  logTimeoutError,
  logSuccessfulRequest,
  createTimeoutError,
  TimeoutErrorContext,
} from './timeoutLogger';

export class OllamaProvider implements LLMProvider {
  private config: LLMConfig;
  private ollamaUrl: string;
  private langChainModel?: ChatOllama;

  constructor(config: LLMConfig, ollamaUrl = 'http://localhost:11434') {
    this.config = config;
    this.ollamaUrl = ollamaUrl;
  }

  async invoke(prompt: string): Promise<LLMResponse> {
    const requestId = Math.random().toString(36).substring(2, 8);
    const startTime = Date.now();

    try {
      log(
        `[OllamaProvider:${requestId}] Invoking ${this.config.model} with prompt length: ${prompt.length}`
      );

      const url = `${this.ollamaUrl.replace(/\/$/, '')}/api/generate`;
      const requestBody = JSON.stringify({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxOutputTokens || -1, // -1 means no limit in Ollama
        },
      });

      // Enhanced logging with request details
      const isRemote = this.ollamaUrl.includes('https://');
      log(`[OllamaProvider:${requestId}] Request details:`, {
        url,
        model: this.config.model,
        temperature: this.config.temperature,
        maxTokens: this.config.maxOutputTokens,
        promptPreview: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
        bodySize: requestBody.length,
        isRemote,
      });

      if (isRemote) {
        log(`[OllamaProvider:${requestId}] Making request to remote endpoint: ${url}`);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'OllamaProvider/1.0',
        },
        body: requestBody,
        signal: AbortSignal.timeout(120000), // 2 minute timeout
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        // Enhanced error logging with request context
        const errorText = await response.text().catch(() => '');

        const timeoutContext: TimeoutErrorContext = {
          requestId,
          url,
          model: this.config.model,
          promptLength: prompt.length,
          promptPreview: prompt.substring(0, 200),
          responseTime,
          httpStatus: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          headers: Object.fromEntries(response.headers.entries()),
          component: 'OllamaProvider',
          config: {
            temperature: this.config.temperature,
            maxTokens: this.config.maxOutputTokens,
          },
        };

        // Special handling for timeout errors
        if (response.status === 524 || response.status === 504) {
          logTimeoutError(timeoutContext); // Fire and forget async logging
          throw createTimeoutError(timeoutContext);
        }

        // Log other HTTP errors
        logError(
          `[OllamaProvider:${requestId}] HTTP ${response.status} Error after ${responseTime}ms:`,
          timeoutContext
        );
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const responseLength = data.response?.length || 0;

      // Log successful requests for monitoring
      logSuccessfulRequest({
        requestId,
        url,
        model: this.config.model,
        promptLength: prompt.length,
        responseTime,
        responseLength,
        component: 'OllamaProvider',
      });

      if (!data.response) {
        logError(`[OllamaProvider:${requestId}] No response content:`, {
          responseTime,
          dataKeys: Object.keys(data),
          data: JSON.stringify(data).substring(0, 500),
        });
        throw new Error('No response content from Ollama');
      }

      return { content: data.response };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown Ollama error';

      // Check if this is already a timeout error from our enhanced handling
      if ((error as any).isTimeout) {
        throw error;
      }

      const timeoutContext: TimeoutErrorContext = {
        requestId,
        url: `${this.ollamaUrl}/api/generate`,
        model: this.config.model,
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200),
        responseTime,
        component: 'OllamaProvider',
        config: {
          temperature: this.config.temperature,
          maxTokens: this.config.maxOutputTokens,
        },
      };

      // Handle client-side timeouts and connection errors
      if (errorMsg.includes('timeout') || errorMsg.includes('AbortError')) {
        logTimeoutError({
          ...timeoutContext,
          httpStatus: undefined, // Client-side timeout
          statusText: 'Client Timeout',
          errorBody: errorMsg,
        }); // Fire and forget async logging
        throw new Error(
          `Ollama provider failed: Request timeout after ${responseTime}ms. Remote server may be overloaded.`
        );
      }

      // Enhanced error logging with full context
      logError(`[OllamaProvider:${requestId}] Request failed after ${responseTime}ms:`, {
        error: errorMsg,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        responseTime,
        url: `${this.ollamaUrl}/api/generate`,
        model: this.config.model,
        promptLength: prompt.length,
        promptPreview: prompt.substring(0, 200),
        config: {
          temperature: this.config.temperature,
          maxTokens: this.config.maxOutputTokens,
        },
        isTimeout:
          errorMsg.includes('timeout') || errorMsg.includes('524') || errorMsg.includes('504'),
        isConnection:
          errorMsg.includes('fetch') ||
          errorMsg.includes('ECONNREFUSED') ||
          errorMsg.includes('ETIMEDOUT'),
      });

      // Provide helpful error messages for common issues
      if (errorMsg.includes('fetch') || errorMsg.includes('ECONNREFUSED')) {
        throw new Error(
          `Ollama provider failed: Cannot connect to Ollama server at ${this.ollamaUrl}. Please ensure Ollama is running.`
        );
      }

      throw new Error(`Ollama provider failed: ${errorMsg}`);
    }
  }

  getModel(): string {
    return this.config.model;
  }

  getProvider() {
    return 'ollama' as const;
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  getLangChainModel(): ChatOllama {
    if (!this.langChainModel) {
      this.langChainModel = new ChatOllama({
        baseUrl: this.ollamaUrl,
        model: this.config.model,
        temperature: this.config.temperature,
        // Enable tool support - this is crucial for bindTools() to work
        format: 'json', // Some models work better with JSON format for tools
      });
    }
    return this.langChainModel;
  }
}
