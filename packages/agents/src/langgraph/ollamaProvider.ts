/**
 * Ollama Provider for LangGraph
 * Integrates local Ollama models with LangChain
 */

import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export class OllamaProvider {
  private model: ChatOllama;
  private modelName: string;

  constructor(modelName: string = 'llama3.1:8b', temperature: number = 0.7) {
    this.modelName = modelName;
    this.model = new ChatOllama({
      model: modelName,
      temperature,
      maxRetries: 2,
      // Base URL defaults to http://localhost:11434
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });

    console.log(`[OllamaProvider] Initialized with model: ${modelName}`);
  }

  async invoke(messages: Array<{ role: string; content: string }>) {
    try {
      // Convert messages to LangChain format
      const langchainMessages = messages.map((msg) => {
        if (msg.role === 'system') {
          return new SystemMessage(msg.content);
        } else {
          return new HumanMessage(msg.content);
        }
      });

      // Invoke the model
      const response = await this.model.invoke(langchainMessages);

      return {
        content: response.content,
        model: this.modelName,
      };
    } catch (error) {
      console.error('[OllamaProvider] Failed to invoke model:', error);
      throw error;
    }
  }

  async *stream(messages: Array<{ role: string; content: string }>): AsyncGenerator<string> {
    try {
      // Convert messages to LangChain format
      const langchainMessages = messages.map((msg) => {
        if (msg.role === 'system') {
          return new SystemMessage(msg.content);
        } else {
          return new HumanMessage(msg.content);
        }
      });

      // Stream the response
      const stream = await this.model.stream(langchainMessages);

      for await (const chunk of stream) {
        yield typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
      }
    } catch (error) {
      console.error('[OllamaProvider] Failed to stream from model:', error);
      throw error;
    }
  }

  // Check if Ollama is running
  async healthCheck(): Promise<boolean> {
    try {
      const response = await globalThis.fetch(
        `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`
      );
      return response.ok;
    } catch (error) {
      console.log('[OllamaProvider] Health check failed - Ollama not running');
      return false;
    }
  }

  // List available models
  async listModels(): Promise<string[]> {
    try {
      const response = await globalThis.fetch(
        `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/tags`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch models');
      }

      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      console.error('[OllamaProvider] Failed to list models:', error);
      return [];
    }
  }
}

// Singleton instance
export const ollamaProvider = new OllamaProvider(process.env.OLLAMA_MODEL || 'llama3.1:8b');
