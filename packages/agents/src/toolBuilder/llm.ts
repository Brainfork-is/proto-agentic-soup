import { logError, getVertexTokenLimit } from '@soup/common';
import { PatchedChatVertexAI } from '../patchedVertexAI';
import { extractErrorMessage } from './utils';

export type ToolBuilderResponseMimeType = 'application/json' | 'text/plain';

export interface LLMOptions {
  responseMimeType?: ToolBuilderResponseMimeType;
}

export function createToolBuilderLLM(options?: LLMOptions): PatchedChatVertexAI {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const model = process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';
  const temperature = parseFloat(process.env.VERTEX_AI_TEMPERATURE || '0.7');
  const maxOutputTokens = getVertexTokenLimit('tool_builder');

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
  }

  const llm = new PatchedChatVertexAI({
    model,
    temperature,
    maxOutputTokens, // Use config-based limit (undefined = no limit)
    responseMimeType: options?.responseMimeType,
    authOptions: {
      credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? undefined
        : process.env.GOOGLE_CLOUD_CREDENTIALS
          ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
          : undefined,
    },
  });

  const originalInvoke = llm.invoke.bind(llm);
  llm.invoke = (async (...args) => {
    try {
      return await originalInvoke(...args);
    } catch (error) {
      logError('[ToolBuilderLLM] Vertex LLM invocation error object:', error);
      throw new Error(extractErrorMessage(error, 'LLM invocation failed'));
    }
  }) as typeof llm.invoke;

  return llm;
}
