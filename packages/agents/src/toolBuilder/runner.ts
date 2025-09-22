import { log, logError } from '@soup/common';
import { RunnerInput, RunnerResult } from '../types';
import { dynamicToolLoader } from '../tools/dynamicToolLoader';
import { LLMFactory } from './builder';
import { toStringContent } from './utils';

export async function runnerExecute(
  input: RunnerInput,
  llmFactory: LLMFactory
): Promise<RunnerResult> {
  const start = Date.now();

  await dynamicToolLoader.ensureTool(input.toolName);

  let rawOutput = '';
  let ok = true;
  let error: string | undefined;

  try {
    rawOutput = await dynamicToolLoader.executeTool(input.toolName, input.args);
    try {
      const parsed = JSON.parse(rawOutput);
      if (parsed && typeof parsed === 'object' && parsed.success === false) {
        ok = false;
        error = typeof parsed.error === 'string' ? parsed.error : 'Tool reported failure';
      }
    } catch {
      // Non-JSON output is allowed
    }
  } catch (execError) {
    ok = false;
    error = execError instanceof Error ? execError.message : 'Tool execution failed';
    rawOutput = JSON.stringify({ success: false, error });
  }

  const executionMs = Date.now() - start;

  let summaryText = '';
  let summarySource: RunnerResult['summarySource'] = 'fallback';

  if (ok) {
    summaryText = rawOutput;
    try {
      const llm = llmFactory();
      const summary = await llm.invoke([
        {
          role: 'system',
          content:
            'You are drafting the final answer for the user. Use the supplied tool output strictly as facts, ' +
            'and respond directly to the user request. Do not mention tools, processes, or how the answer was produced. ' +
            'Provide only the answer content the user asked for.',
        },
        {
          role: 'user',
          content: `User request:\n${input.jobPrompt}\n\nRelevant data:\n${rawOutput}\n\nNotes from planner: ${input.builderRationale}`,
        },
      ]);
      summaryText = toStringContent(summary.content).trim();
      summarySource = 'llm';
    } catch (summaryError) {
      logError(
        '[runnerExecute] Failed to generate final answer, falling back to raw tool output.',
        summaryError
      );
      try {
        const parsed = JSON.parse(rawOutput);
        summaryText = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      } catch {
        summaryText = rawOutput;
      }
    }
  }

  log(
    `[runnerExecute] Tool ${input.toolName} finished in ${executionMs}ms (ok=${ok}). Output preview: ${rawOutput.slice(0, 200)}`
  );

  return {
    ok,
    toolName: input.toolName,
    args: input.args,
    toolOutput: rawOutput,
    finalResponse: JSON.stringify(
      {
        answer: ok ? summaryText : '',
        tools_used: [input.toolName],
        error: !ok,
        error_description: error || '',
      },
      null,
      2
    ),
    executionMs,
    summarySource,
    error,
  };
}
