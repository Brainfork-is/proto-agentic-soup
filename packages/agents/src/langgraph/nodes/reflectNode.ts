/**
 * Reflection Node - Analyzes results and provides learning feedback
 */

import { AgentStateType } from '../agentState';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

export async function reflectNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { plan, toolResults, finalResult, success, messages } = state;

  if (!plan || toolResults.length === 0) {
    return {
      messages: [...messages, new AIMessage('No execution results to reflect on.')],
      adjustments: ['Ensure proper plan generation and execution'],
    };
  }

  // Analyze execution results
  const totalSteps = plan.steps.length;
  const successfulSteps = toolResults.filter((r) => r.success).length;
  const successRate = successfulSteps / totalSteps;

  // Create execution summary
  const executionSummary = toolResults
    .map(
      (r, i) =>
        `Step ${i + 1} (${r.tool}): ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.result?.success !== false ? 'completed' : r.error || 'failed'}`
    )
    .join('\n');

  const reflectionPrompt = `Analyze the execution results and provide learning insights.

ORIGINAL GOAL: ${plan.goal}
SUCCESS: ${success}
FINAL RESULT: ${finalResult || 'No result obtained'}

EXECUTION RESULTS:
${executionSummary}

SUCCESS RATE: ${Math.round(successRate * 100)}% (${successfulSteps}/${totalSteps} steps)

Provide a brief analysis and 2-3 specific adjustments for future similar tasks.

Respond with JSON in this exact format:
{
  "analysis": "Brief analysis of what worked and what didn't",
  "adjustments": ["specific improvement 1", "specific improvement 2"]
}`;

  // For now, provide basic reflection without LLM call
  // In a full implementation, this would call the LLM for deeper analysis
  const basicReflection = success
    ? 'Task completed successfully with good tool execution.'
    : 'Task failed - need to improve tool selection or error handling.';

  const basicAdjustments = success
    ? ['Continue using successful tool patterns', 'Monitor for edge cases']
    : ['Review tool selection logic', 'Add better error recovery', 'Improve parameter validation'];

  return {
    reflection: basicReflection,
    adjustments: basicAdjustments,
    messages: [
      ...messages,
      new HumanMessage(reflectionPrompt),
      new AIMessage(`Reflection: ${basicReflection}`),
    ],
  };
}
