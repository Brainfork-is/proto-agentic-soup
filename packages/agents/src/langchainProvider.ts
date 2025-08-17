/**
 * LangChain LLM wrapper that uses our existing llmProvider
 * Provides a bridge between LangChain tools and our LLM infrastructure
 */

import { BaseLLM } from '@langchain/core/language_models/llms';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { LLMResult, Generation } from '@langchain/core/outputs';
import { llmProvider } from './llmProvider';

export interface LangChainLLMOptions {
  temperature?: number;
  maxTokens?: number;
  preferredProvider?: 'local' | 'vertex' | 'auto';
  agentId?: string;
}

export class AgenricSoupLLM extends BaseLLM {
  temperature: number;
  maxTokens: number;
  preferredProvider: 'local' | 'vertex' | 'auto';
  agentId: string;

  constructor(options: LangChainLLMOptions = {}) {
    super({});
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens ?? 500;
    this.preferredProvider = options.preferredProvider ?? 'auto';
    this.agentId = options.agentId ?? 'langchain';
  }

  _llmType(): string {
    return 'agentic-soup';
  }

  /** @ignore */
  async _call(
    prompt: string,
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<string> {
    // Use our existing llmProvider
    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        preferredProvider: this.preferredProvider === 'auto' ? undefined : this.preferredProvider,
      },
      this.agentId
    );

    if (!response) {
      throw new Error('LLM provider returned null response');
    }

    // Notify LangChain of the new tokens
    await runManager?.handleLLMNewToken(response.content);

    return response.content;
  }

  /** @ignore */
  async _generate(
    prompts: string[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<LLMResult> {
    const generations: Generation[][] = [];

    for (const prompt of prompts) {
      const text = await this._call(prompt, options, runManager);
      generations.push([
        {
          text,
          generationInfo: {
            provider: this.preferredProvider,
            agentId: this.agentId,
          },
        },
      ]);
    }

    return {
      generations,
      llmOutput: {
        model: this.preferredProvider,
        agentId: this.agentId,
      },
    };
  }

  /** @ignore */
  _modelType(): string {
    return 'agentic-soup-llm';
  }

  /** @ignore */
  _identifying_params() {
    return {
      model: this.preferredProvider,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      agentId: this.agentId,
    };
  }
}

/**
 * Factory function to create LangChain LLM instances with proper configuration
 */
export function createLangChainLLM(agentId: string, temperature?: number): AgenricSoupLLM {
  // Check if we should use local or vertex based on environment
  const provider = process.env.LLM_PROVIDER as 'local' | 'vertex' | 'auto' | undefined;

  return new AgenricSoupLLM({
    agentId,
    temperature: temperature ?? 0.7,
    maxTokens: parseInt(process.env.LANGCHAIN_MAX_TOKENS || '500'),
    preferredProvider: provider ?? 'auto',
  });
}

/**
 * Singleton instance for general use
 */
export const langchainLLM = createLangChainLLM('langchain-default');
