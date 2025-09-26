/**
 * Vertex AI Provider Implementation
 */

import { PatchedChatVertexAI } from '../patchedVertexAI';
import { LLMProvider, LLMConfig, LLMResponse } from './types';
import { log } from '@soup/common';

export class VertexAIProvider implements LLMProvider {
  private llm: PatchedChatVertexAI;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.llm = this.createVertexAI();
  }

  private createVertexAI(): PatchedChatVertexAI {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error(
        'GOOGLE_CLOUD_PROJECT environment variable is required for Vertex AI provider'
      );
    }

    return new PatchedChatVertexAI({
      model: this.config.model,
      temperature: this.config.temperature,
      maxOutputTokens: this.config.maxOutputTokens,
      authOptions: {
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? undefined
          : process.env.GOOGLE_CLOUD_CREDENTIALS
            ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
            : undefined,
      },
    });
  }

  async invoke(prompt: string): Promise<LLMResponse> {
    try {
      log(`[VertexAIProvider] Invoking ${this.config.model} with prompt length: ${prompt.length}`);
      const response = await this.llm.invoke(prompt);
      return { content: response.content as string };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown Vertex AI error';
      log(`[VertexAIProvider] Error: ${errorMsg}`);
      throw new Error(`Vertex AI provider failed: ${errorMsg}`);
    }
  }

  getModel(): string {
    return this.config.model;
  }

  getProvider() {
    return 'vertex' as const;
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  getLangChainModel(): PatchedChatVertexAI {
    return this.llm;
  }
}
