import { ChatVertexAI } from '@langchain/google-vertexai';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { ChatResult } from '@langchain/core/outputs';
import JSON5 from 'json5';

/**
 * Local patch around LangChain's ChatVertexAI to surface underlying Vertex errors.
 */
export class PatchedChatVertexAI extends ChatVertexAI {
  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const parameters = this.invocationParams(options);

    if (this.streaming) {
      try {
        return await super._generate(messages, options, runManager);
      } catch (error) {
        throw this.normalizeError(error);
      }
    }

    const maxRetries = 1;
    let attempt = 0;
    let lastResponse: unknown;
    let augmentedMessages: BaseMessage[] = [...messages];

    while (attempt <= maxRetries) {
      try {
        lastResponse = await this.connection.request(
          augmentedMessages,
          parameters,
          options,
          runManager
        );
      } catch (error) {
        throw this.normalizeError(error);
      }

      const salvaged = this.trySalvageMalformedCall(lastResponse);
      if (salvaged) {
        console.warn(
          '[PatchedChatVertexAI] Salvaged malformed function call by normalising arguments'
        );
        return salvaged;
      }

      const malformed = this.findMalformedFunctionCall(lastResponse);
      if (malformed && attempt < maxRetries) {
        attempt += 1;
        const reminder = this.buildRetryReminder(malformed.finishMessage);
        console.warn('[PatchedChatVertexAI] Retrying due to malformed function call', {
          attempt,
          finishMessage: malformed.finishMessage,
        });
        augmentedMessages = [
          ...augmentedMessages,
          new HumanMessage({
            content: reminder,
          }),
        ];
        continue;
      }

      try {
        const result = this.connection.api.responseToChatResult(lastResponse as any);
        const topGeneration = Array.isArray(result?.generations)
          ? result.generations[0]
          : undefined;

        if (!topGeneration || !topGeneration.message) {
          throw new Error('Vertex response missing generations');
        }

        await runManager?.handleLLMNewToken(topGeneration.text || '');
        return result;
      } catch (error) {
        throw this.normalizeError(error, lastResponse);
      }
    }

    // If we exhausted retries without returning, throw with last response context
    throw new Error(
      `Vertex response missing generations after ${maxRetries + 1} attempts; raw payload: ${this.stringifyPayload(lastResponse)}`
    );
  }

  private normalizeError(error: unknown, rawPayload?: unknown): Error {
    const err = error as Error & { response?: { data?: unknown } };
    const payload = rawPayload ?? err?.response?.data;
    const summary = this.stringifyPayload(payload);

    console.error('[PatchedChatVertexAI] Vertex call failed', {
      message: err?.message ?? String(error),
      payload,
      stack: err?.stack,
    });

    if (
      err instanceof TypeError &&
      err.message?.includes("Cannot read properties of undefined (reading 'message')")
    ) {
      return new Error(`Vertex response missing candidates; raw payload: ${summary}`);
    }

    if (err instanceof Error) {
      if (payload !== undefined && !err.message.includes('raw payload')) {
        err.message = `${err.message}; raw payload: ${summary}`;
      }
      return err;
    }

    return new Error(
      `Vertex call failed with non-Error type: ${String(error)}; raw payload: ${summary}`
    );
  }

  private stringifyPayload(payload: unknown): string {
    if (payload === undefined) {
      return 'undefined';
    }
    if (payload === null) {
      return 'null';
    }
    if (typeof payload === 'string') {
      return payload.length > 2000 ? `${payload.slice(0, 2000)}...<truncated>` : payload;
    }
    try {
      const serialized = JSON.stringify(payload);
      return serialized.length > 2000 ? `${serialized.slice(0, 2000)}...<truncated>` : serialized;
    } catch {
      return String(payload);
    }
  }

  private findMalformedFunctionCall(response: unknown): { finishMessage: string } | null {
    const candidates =
      (response as any)?.data?.candidates ?? (response as any)?.candidates ?? undefined;
    if (!Array.isArray(candidates)) {
      return null;
    }

    for (const candidate of candidates) {
      if (candidate?.finishReason === 'MALFORMED_FUNCTION_CALL') {
        const finishMessage = String(candidate?.finishMessage ?? '');
        return { finishMessage };
      }
    }

    return null;
  }

  private buildRetryReminder(finishMessage: string): string {
    const trimmed =
      finishMessage.length > 800 ? `${finishMessage.slice(0, 800)}...` : finishMessage;
    return `Your previous tool call was rejected: ${trimmed}.
Return the tool invocation as STRICT JSON matching the provided schema. Rules:
1. Use double quotes only.
2. Do not wrap the tool call in code, print(), or text commentary.
3. The payload must be a JSON object with a "tool" name and "tool_input" object.
Example:
{"tool": "code_generator", "tool_input": {"taskDescription": "...", "toolName": "...", "expectedInputs": {"param": "description"}, "expectedOutput": "..."}}`;
  }

  private trySalvageMalformedCall(response: unknown): ChatResult | null {
    const malformed = this.findMalformedFunctionCall(response);
    if (!malformed) return null;

    const parsed = this.parseMalformedFunctionCall(malformed.finishMessage);
    if (!parsed) return null;

    const toolCallId = `patched-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    if (!parsed.toolName) {
      return null;
    }

    const functionCall = {
      name: parsed.toolName,
      arguments: JSON.stringify(parsed.toolArgs),
    };

    const toolCall: any = {
      id: toolCallId,
      type: 'function',
      name: parsed.toolName,
      function: functionCall,
    };

    const aiMessage = new AIMessage({
      content: '',
      additional_kwargs: {
        tool_calls: [toolCall],
        function_call: functionCall,
      },
      tool_calls: [toolCall as any],
    });

    (aiMessage as any).function_call = functionCall;

    return {
      generations: [
        {
          text: '',
          message: aiMessage,
        },
      ],
      llmOutput: {
        salvagedFrom: 'MALFORMED_FUNCTION_CALL',
      },
    };
  }

  private parseMalformedFunctionCall(
    finishMessage: string
  ): { toolName: string; toolArgs: Record<string, unknown> } | null {
    if (finishMessage.includes('print(code_generator')) {
      const parsed = this.parsePrintCodeGeneratorCall(finishMessage);
      if (parsed) {
        return parsed;
      }
    }

    const firstBrace = finishMessage.indexOf('{');
    const lastBrace = finishMessage.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    const prefix = finishMessage.slice(0, firstBrace);
    const body = finishMessage.slice(firstBrace, lastBrace + 1);

    const toolMatch = prefix.match(/call:?\s*([A-Za-z0-9_]+)/);
    if (!toolMatch) {
      return null;
    }

    const toolName = toolMatch[1];

    let normalised = body
      .replace(/<ctrl46>/g, "'")
      .replace(/\r?\n/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/'''([\s\S]*?)'''/g, (_, inner) => JSON.stringify(inner))
      .trim();

    try {
      const toolArgs = JSON5.parse(normalised) as Record<string, unknown>;
      return { toolName, toolArgs };
    } catch (error) {
      console.warn('[PatchedChatVertexAI] Failed to parse malformed tool call', {
        toolName,
        normalised,
        error,
      });
      return null;
    }
  }

  private parsePrintCodeGeneratorCall(
    finishMessage: string
  ): { toolName: string; toolArgs: Record<string, unknown> } | null {
    const match = finishMessage.match(/print\(code_generator\((.*)\)\)/s);
    if (!match) {
      return null;
    }

    const inner = match[1];
    const normalized = inner
      .replace(/(^|,|\()\s*([A-Za-z0-9_]+)\s*=/g, (full, prefix, key) => `${prefix}"${key}":`)
      .replace(/<ctrl46>/g, "'");

    try {
      const toolArgs = JSON5.parse(`{${normalized}}`) as Record<string, unknown>;
      return { toolName: 'code_generator', toolArgs };
    } catch (error) {
      console.warn('[PatchedChatVertexAI] Failed to normalise print(code_generator(...)) call', {
        normalized,
        error,
      });
      return null;
    }
  }
}
