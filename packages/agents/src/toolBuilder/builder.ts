import JSON5 from 'json5';
import { PatchedChatVertexAI } from '../patchedVertexAI';
import { BuilderContext, BuilderPlan } from '../types';
import { extractErrorMessage, toStringContent } from './utils';
import { log } from '@soup/common';
import type { LLMOptions } from './llm';

export type LLMFactory = (options?: LLMOptions) => PatchedChatVertexAI;

const extractFirstJsonObject = (value: string): string | null => {
  const start = value.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  let stringDelimiter: string | null = null;
  for (let i = start; i < value.length; i += 1) {
    const ch = value[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      if (!inString) {
        inString = true;
        stringDelimiter = ch;
      } else if (stringDelimiter === ch) {
        inString = false;
        stringDelimiter = null;
      }
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, i + 1);
      }
    }
  }
  return null;
};

const validatePlan = (plan: BuilderPlan): string | null => {
  const hasToolSelection = Boolean(plan.reuseTool?.trim() || plan.createTool);

  if (hasToolSelection) {
    if (
      !plan.executionArgs ||
      typeof plan.executionArgs !== 'object' ||
      Array.isArray(plan.executionArgs) ||
      Object.keys(plan.executionArgs).length === 0
    ) {
      return 'executionArgs must be a non-empty JSON object containing the concrete arguments for the selected tool';
    }
  }

  if (plan.createTool) {
    const createTool = plan.createTool as unknown as Record<string, unknown>;
    const toolName = createTool.toolName;
    const taskDescription = createTool.taskDescription;
    const expectedOutput = createTool.expectedOutput;
    if (typeof toolName !== 'string' || toolName.trim().length === 0) {
      return 'createTool.toolName must be a non-empty string';
    }
    if (typeof taskDescription !== 'string' || taskDescription.trim().length === 0) {
      return 'createTool.taskDescription must be provided';
    }
    if (typeof expectedOutput !== 'string' || expectedOutput.trim().length === 0) {
      return 'createTool.expectedOutput must describe the return format';
    }
  }

  if (plan.reuseTool && typeof plan.reuseTool !== 'string') {
    return 'reuseTool must be a string if provided';
  }

  return null;
};

export async function builderPlan(
  context: BuilderContext,
  llmFactory: LLMFactory
): Promise<BuilderPlan> {
  const llm = llmFactory({ responseMimeType: 'application/json' });

  const availableToolsListing = context.availableTools
    .map((tool) => `- ${tool.name}: ${tool.description || 'No description available.'}`)
    .join('\n');

  const strictInstruction = context.strictMode
    ? 'You must either reuse an existing tool or respond with a new createTool specification.'
    : 'Prefer to reuse or create a tool. If absolutely none fit, you may omit reuseTool/createTool but explain clearly why.';

  const formatInstructions =
    'Return strict JSON with the shape {"rationale": string, "reuseTool"?: string, "createTool"?: {"taskDescription": string, "toolName": string, "expectedInputs"?: object, "expectedOutput": string}, "executionArgs": object}. ' +
    'All strings must use double quotes and objects must be valid JSON. No surrounding prose.';

  const userPrompt = [
    `Job request:\n${context.jobPrompt}`,
    '',
    `Your tools (mutations):\n${availableToolsListing || 'None yet - you will create your first tool.'}`,
    `Your tool success rate: ${(context.registrySuccessRate * 100).toFixed(1)}%`,
    strictInstruction,
    '',
    'IMPORTANT: Tools you create are your unique mutations and have access to:',
    '- NPM packages: axios, cheerio, lodash, date-fns, validator, uuid, and more',
    '- Web research: webResearch(query) function for web queries',
    '- Web fetching: fetchWebContent(url) for specific URLs',
    '- HTML parsing: parseHTML(html) using cheerio',
    '',
    'Your tools are unique to you and represent your evolutionary mutations.',
    'Tools should use REAL DATA from the web or compute actual results.',
    'DO NOT create tools that return dummy, mock, or placeholder data.',
    '',
    'CRITICAL: You MUST provide executionArgs - a non-empty JSON object with concrete arguments for the tool.',
    'Example for reusing a tool:',
    '{"rationale": "Using searchWeb to find information", "reuseTool": "searchWeb", "executionArgs": {"query": "latest AI news", "limit": 5}}',
    '',
    'Example for creating a new tool:',
    '{"rationale": "Need a new tool", "createTool": {"toolName": "analyzeData", "taskDescription": "Analyze sales data", "expectedOutput": "JSON report"}, "executionArgs": {"dataSource": "sales_q3.csv", "metrics": ["revenue", "growth"]}}',
    '',
    'If you specify createTool, include taskDescription, toolName, expectedInputs, expectedOutput.',
    'Return ONLY JSON with NO surrounding text.',
  ].join('\n');

  const baseMessages = [
    {
      role: 'system' as const,
      content: `You design or reuse powerful JSON-callable tools that access real data and external resources. Each tool you create is a unique mutation belonging only to you. Tools have access to npm packages and web browsing capabilities. Never create tools that return dummy or mock data - always use real information. ${formatInstructions}`,
    },
    {
      role: 'user' as const,
      content: userPrompt,
    },
  ];

  const messages = [...baseMessages];
  const maxRetries = 3;
  let lastParsedPlan: BuilderPlan | null = null;
  let lastValidationError: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const response = await llm.invoke(messages);
    let raw = toStringContent(response.content).trim();

    if (raw.startsWith('```')) {
      raw = raw
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();
    }

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw || '{}');
      } catch (jsonError) {
        try {
          parsed = JSON5.parse(raw || '{}');
        } catch (json5Error) {
          const firstJson = extractFirstJsonObject(raw || '');
          if (!firstJson) throw json5Error;
          try {
            parsed = JSON.parse(firstJson);
          } catch {
            parsed = JSON5.parse(firstJson);
          }
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Response was not a JSON object');
      }

      const plan = parsed as BuilderPlan;
      if (typeof plan.rationale !== 'string' || plan.rationale.length === 0) {
        throw new Error('Missing rationale');
      }

      lastParsedPlan = plan;

      const validationError = validatePlan(plan);
      if (validationError) {
        log(
          `[builderPlan] Validation failed (attempt ${attempt + 1}/${maxRetries}): ${validationError}`
        );
        lastValidationError = validationError;

        let retryMessage = `Your previous reply was invalid: ${validationError}. `;
        if (validationError.includes('executionArgs')) {
          retryMessage +=
            'You MUST include executionArgs as a non-empty JSON object with the actual arguments to pass to the tool. Example: {"executionArgs": {"query": "search term", "limit": 10}}';
        } else {
          retryMessage += 'Respond again with ONLY valid JSON matching the required schema.';
        }

        messages.push({
          role: 'user' as const,
          content: retryMessage,
        });
        continue;
      }

      return plan;
    } catch (error) {
      const errorMsg = extractErrorMessage(error, 'Invalid JSON response');
      log(
        `[builderPlan] Parse failed (attempt ${attempt + 1}/${maxRetries}): ${errorMsg}. Raw response: ${raw.slice(0, 200)}`
      );
      messages.push({
        role: 'user' as const,
        content: `Your previous reply failed to parse (${errorMsg}). Respond again with ONLY valid JSON matching the required schema.`,
      });
    }
  }

  if (lastParsedPlan) {
    if (lastValidationError) {
      log(
        `[builderPlan] Returning last parsed plan despite validation error: ${lastValidationError}`
      );
    } else {
      log('[builderPlan] Returning last parsed plan after exhausting retries.');
    }

    if (!lastParsedPlan.executionArgs || typeof lastParsedPlan.executionArgs !== 'object') {
      log('[builderPlan] executionArgs missing or invalid, attempting to infer from context');

      if (lastParsedPlan.createTool) {
        const createTool = lastParsedPlan.createTool as unknown as Record<string, unknown>;
        const expectedInputs = createTool.expectedInputs;

        if (expectedInputs && typeof expectedInputs === 'object') {
          const inferredArgs: Record<string, unknown> = {};
          const inputs = expectedInputs as Record<string, unknown>;

          for (const key in inputs) {
            inferredArgs[key] = '';
          }

          if (Object.keys(inferredArgs).length > 0) {
            log(
              `[builderPlan] Inferred executionArgs from expectedInputs: ${Object.keys(inferredArgs).join(', ')}`
            );
            lastParsedPlan.executionArgs = inferredArgs;
          } else {
            lastParsedPlan.executionArgs = {};
          }
        } else {
          lastParsedPlan.executionArgs = {};
        }
      } else {
        lastParsedPlan.executionArgs = {};
      }
    }

    return lastParsedPlan;
  }

  throw new Error('Builder plan could not be parsed after multiple attempts');
}
