import { GeneratedToolRequest } from '../tools/codeGenerator';

const hasMessage = (value: unknown): value is { message: unknown } =>
  typeof value === 'object' && value !== null && 'message' in (value as Record<string, unknown>);

export const extractErrorMessage = (error: unknown, fallback = 'Unknown error'): string => {
  if (error instanceof Error && typeof error.message === 'string' && error.message.length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  if (hasMessage(error) && typeof (error as any).message === 'string') {
    return (error as any).message as string;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
};

export const toStringContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textItem = content.find((item) => typeof item === 'string');
    if (textItem) return textItem;
    for (const item of content) {
      if (item && typeof item === 'object') {
        if (typeof (item as any).text === 'string') return (item as any).text;
        if (typeof (item as any).content === 'string') return (item as any).content;
      }
    }
    return JSON.stringify(content);
  }
  if (content && typeof content === 'object') {
    if (typeof (content as any).text === 'string') return (content as any).text;
    if (typeof (content as any).content === 'string') return (content as any).content;
    return JSON.stringify(content);
  }
  return String(content ?? '');
};

export function sanitizeToolInput<T = unknown>(value: T): T {
  if (value === null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeToolInput(item)) as unknown as T;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === 'undefined') continue;
      result[key] = sanitizeToolInput(val);
    }
    return result as unknown as T;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value) as unknown as T;
  }
}

export function normalizeCodeGeneratorRequest(raw: Record<string, unknown>): GeneratedToolRequest {
  const toString = (value: unknown): string => {
    if (typeof value === 'string') return value;
    if (value === null || typeof value === 'undefined') return '';
    try {
      if (typeof value === 'number' || typeof value === 'boolean') {
        return JSON.stringify(value);
      }
      if (typeof value === 'object') {
        return JSON.stringify(sanitizeToolInput(value));
      }
    } catch {
      // ignore
    }
    return String(value);
  };

  const expectedInputs: Record<string, string> = {};
  const expectedInputsRaw = raw.expectedInputs;
  if (
    expectedInputsRaw &&
    typeof expectedInputsRaw === 'object' &&
    !Array.isArray(expectedInputsRaw)
  ) {
    for (const [key, value] of Object.entries(expectedInputsRaw as Record<string, unknown>)) {
      if (!key) continue;
      expectedInputs[key] = toString(value);
    }
  }

  const request: GeneratedToolRequest = {
    taskDescription: toString(raw.taskDescription),
    toolName: toString(raw.toolName),
    expectedInputs,
    expectedOutput: toString(raw.expectedOutput),
  };

  if (typeof raw.agentId === 'string' && raw.agentId.length > 0) {
    request.agentId = raw.agentId;
  }

  return request;
}
