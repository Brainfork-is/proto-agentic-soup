/**
 * LLM Provider Abstraction - Core Types and Interfaces
 */

export type LLMProviderType = 'vertex' | 'ollama' | 'auto';

export interface LLMConfig {
  provider: LLMProviderType;
  model: string;
  temperature: number;
  maxOutputTokens?: number;
}

export interface LLMProvider {
  invoke(prompt: string): Promise<{ content: string }>;
  getModel(): string;
  getProvider(): LLMProviderType;
  getConfig(): LLMConfig;
}

export interface LLMResponse {
  content: string;
}

export type ComponentType =
  | 'name_generator'
  | 'job_generator'
  | 'result_grader'
  | 'agent'
  | 'code_generator'
  | 'swarm_synthesizer'
  | 'tool_builder';

export interface ParsedLLMConfig {
  provider?: LLMProviderType;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}
