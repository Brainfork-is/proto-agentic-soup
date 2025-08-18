/**
 * Execution Node - Executes the planned steps using tools
 */

import { AgentStateType, ToolResult } from '../agentState';
import { toolMap } from '../tools/index';
import { AIMessage } from '@langchain/core/messages';

export async function executeNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { plan, messages } = state;

  if (!plan) {
    return {
      messages: [...messages, new AIMessage('No execution plan available. Skipping execution.')],
      success: false,
    };
  }

  const toolResults: ToolResult[] = [];
  let totalStepsUsed = 0;

  // Execute each step in the plan
  for (const step of plan.steps) {
    try {
      const tool = toolMap[step.tool as keyof typeof toolMap];

      if (!tool) {
        toolResults.push({
          tool: step.tool,
          success: false,
          result: null,
          error: `Tool ${step.tool} not found`,
        });
        continue;
      }

      console.log(`[LangGraph] Executing ${step.tool} with params:`, step.params);

      const rawResult = await tool.invoke(step.params);

      // Parse the JSON result from the tool
      let result: any;
      try {
        result = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
      } catch {
        result = { success: false, error: 'Failed to parse tool result', rawResult };
      }

      const success = result.success !== false && !result.error;
      const error = result.error || (success ? undefined : 'Tool execution failed');
      const stepsUsed = result.stepsUsed || result.steps || 0;

      toolResults.push({
        tool: step.tool,
        success,
        result,
        error,
        stepsUsed,
      });

      totalStepsUsed += stepsUsed;
    } catch (error) {
      toolResults.push({
        tool: step.tool,
        success: false,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Create execution summary
  const successfulSteps = toolResults.filter((r) => r.success).length;
  const executionSummary = `Executed ${plan.steps.length} steps, ${successfulSteps} successful.`;

  // Try to extract the final result from tool outputs
  let finalResult: string | null = null;

  // Look for results in reverse order (most recent first)
  for (let i = toolResults.length - 1; i >= 0; i--) {
    const result = toolResults[i];
    if (result.success && result.result) {
      // Extract meaningful result based on tool type
      if (result.tool === 'calculator' && result.result.value !== undefined) {
        finalResult = String(result.result.value);
        break;
      } else if (result.tool === 'text_processor') {
        if (result.result.result) {
          finalResult = result.result.result;
        } else if (result.result.selectedLabel) {
          finalResult = result.result.selectedLabel;
        }
        break;
      } else if (result.tool === 'browser' && result.result.content) {
        // Extract key content from browser results
        const content = result.result.content.substring(0, 200).trim();
        finalResult = content;
        break;
      } else if (result.tool === 'knowledge_retrieval' && result.result.results?.length > 0) {
        finalResult = result.result.results[0].content;
        break;
      }
    }
  }

  const success = successfulSteps > 0 && finalResult !== null;

  return {
    toolResults,
    stepsUsed: totalStepsUsed,
    finalResult,
    success,
    messages: [...messages, new AIMessage(executionSummary)],
  };
}
