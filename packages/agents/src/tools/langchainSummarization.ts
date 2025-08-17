/**
 * LangChain-powered summarization tool
 * Replaces the mock stringKit summarization with real LLM-powered summarization
 */

import { PromptTemplate } from '@langchain/core/prompts';
import { LLMChain } from 'langchain/chains';
import { createLangChainLLM } from '../langchainProvider';

export interface SummarizationOptions {
  text: string;
  maxWords?: number;
  style?: 'concise' | 'detailed' | 'bullet_points';
  temperature?: number;
  useLLM?: boolean; // Allow fallback to mock behavior
}

export interface SummarizationResult {
  summary: string;
  originalLength: number;
  summaryLength: number;
  compressionRatio: number;
  method: 'llm' | 'mock';
}

/**
 * Mock summarization for fallback (original stringKit behavior)
 */
function mockSummarize(text: string, maxWords: number): string {
  return text.split(/\s+/).slice(0, maxWords).join(' ');
}

/**
 * Main summarization function using LangChain
 */
export async function summarize(
  options: SummarizationOptions,
  agentId: string = 'summarizer'
): Promise<SummarizationResult> {
  const { text, maxWords = 12, style = 'concise', temperature = 0.3, useLLM = true } = options;

  // If LLM is disabled, use mock
  if (!useLLM) {
    const summary = mockSummarize(text, maxWords);
    return {
      summary,
      originalLength: text.split(/\s+/).length,
      summaryLength: summary.split(/\s+/).length,
      compressionRatio: summary.length / text.length,
      method: 'mock',
    };
  }

  // If text is very short, just return it
  if (text.split(/\s+/).length <= maxWords) {
    return {
      summary: text,
      originalLength: text.split(/\s+/).length,
      summaryLength: text.split(/\s+/).length,
      compressionRatio: 1.0,
      method: 'llm',
    };
  }

  // Create LLM with lower temperature for more consistent summarization
  const llm = createLangChainLLM(agentId, temperature);

  // Build prompt based on style
  let promptTemplate: string;

  switch (style) {
    case 'bullet_points':
      promptTemplate = `Summarize the following text in ${maxWords} words or less using bullet points:

Text: {text}

Summary (${maxWords} words max, bullet points):`;
      break;

    case 'detailed':
      promptTemplate = `Provide a comprehensive summary of the following text in ${maxWords} words or less, preserving key details:

Text: {text}

Detailed Summary (${maxWords} words max):`;
      break;

    case 'concise':
    default:
      promptTemplate = `Summarize the following text in ${maxWords} words or less. Be extremely concise:

Text: {text}

Concise Summary (${maxWords} words max):`;
      break;
  }

  const prompt = PromptTemplate.fromTemplate(promptTemplate);
  const chain = new LLMChain({ llm, prompt });

  // Generate summary - let errors propagate up
  const result = await chain.call({ text });
  let summary = result.text.trim();

  // Ensure we respect the word limit (LLMs sometimes go over)
  const summaryWords = summary.split(/\s+/);
  if (summaryWords.length > maxWords) {
    summary = summaryWords.slice(0, maxWords).join(' ');
  }

  return {
    summary,
    originalLength: text.split(/\s+/).length,
    summaryLength: summary.split(/\s+/).length,
    compressionRatio: summary.length / text.length,
    method: 'llm',
  };
}

/**
 * LangChain Tool wrapper for use in agents
 */
export class SummarizationTool {
  private agentId: string;
  private useLLM: boolean;

  constructor(agentId: string, useLLM: boolean = true) {
    this.agentId = agentId;
    this.useLLM = useLLM;
  }

  async run(text: string, maxWords: number = 12): Promise<string> {
    try {
      const result = await summarize({ text, maxWords, useLLM: this.useLLM }, this.agentId);
      return result.summary;
    } catch (error) {
      console.error(`[SummarizationTool] Failed for agent ${this.agentId}:`, error);
      // Return empty string to indicate failure
      return '';
    }
  }

  // For compatibility with existing stringKit interface
  async call(params: { text: string; maxWords?: number }): Promise<{ text: string }> {
    const summary = await this.run(params.text, params.maxWords);
    return { text: summary };
  }
}
