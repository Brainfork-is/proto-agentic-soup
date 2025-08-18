/**
 * Reflection Node for LangGraph Agent
 * Uses structured output for reflection analysis
 */

import { AgentState } from '../agentState';
import { llmProvider } from '../../llmProvider';
import { reflectionSchema } from '../structuredTools';

export async function reflectNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[ReflectNode] Agent ${state.agentId}: Starting reflection`);

  if (!state.plan || state.toolResults.length === 0) {
    return {
      error: 'No results to reflect on',
      checkpoint: 'failed',
    };
  }

  try {
    // Build reflection prompt
    const prompt = buildReflectionPrompt(state.plan, state.toolResults);

    // Generate reflection using regular LLM call
    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: state.temperature * 0.8, // Slightly lower temperature for reflection
        maxTokens: 600,
      },
      state.agentId
    );

    if (!response) {
      throw new Error('Failed to generate reflection - no response from LLM');
    }

    // Parse reflection with flexible JSON handling
    const reflection = parseSimpleReflection(response.content, state.toolResults);

    console.log(
      `[ReflectNode] Agent ${state.agentId}: Reflection complete - Success: ${reflection.success}`
    );

    // Store the experience in memory
    const memory = {
      category: state.jobData!.category,
      payload: state.jobData!.payload,
      success: reflection.success,
      artifact: reflection.finalResult,
      stepsUsed: state.totalStepsUsed,
      timestamp: new Date(),
      planUsed: state.plan.goal,
      adjustments: reflection.adjustments,
    };

    return {
      reflection: JSON.stringify(reflection),
      finalOutput: reflection.finalResult,
      success: reflection.success,
      memory: [...state.memory, memory].slice(-10), // Keep last 10 memories
      checkpoint: 'completed',
      error: null,
    };
  } catch (error) {
    console.error(`[ReflectNode] Agent ${state.agentId}: Reflection failed`, error);

    // Use fallback reflection method
    const fallbackReflection = createFallbackReflection(state.toolResults);

    return {
      finalOutput: fallbackReflection.finalResult,
      success: fallbackReflection.success,
      checkpoint: 'completed',
      error: null,
    };
  }
}

function buildReflectionPrompt(plan: any, results: any[]): string {
  const resultsStr = results
    .map(
      (r, i) =>
        `Step ${i + 1} (${r.tool}): ${r.success ? 'SUCCESS' : 'FAILED'} - ${
          r.error || JSON.stringify(r.output).substring(0, 200)
        }`
    )
    .join('\n');

  return `You are an AI agent reflecting on the execution of your plan.

ORIGINAL GOAL: ${plan.goal}

EXECUTION RESULTS:
${resultsStr}

Analyze whether the plan succeeded overall and extract the final result that answers the original task.
If there were failures, suggest what could be improved.

Provide your reflection focusing on the success status, the main result, and any improvement suggestions.`;
}

function parseSimpleReflection(
  content: string,
  results: any[]
): {
  success: boolean;
  finalResult: any;
  adjustments?: string[];
} {
  try {
    // Extract JSON using simple regex
    let jsonStr = '';
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    } else {
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      } else {
        throw new Error('No JSON found in reflection');
      }
    }

    const reflectionData = JSON.parse(jsonStr);

    return {
      success: reflectionData.success || false,
      finalResult: reflectionData.finalResult || reflectionData.result || 'Task completed',
      adjustments: reflectionData.adjustments || [],
    };
  } catch (error) {
    console.warn(`[ReflectNode] JSON parsing failed, using fallback:`, error);
    return createFallbackReflection(results);
  }
}

function createFallbackReflection(results: any[]): {
  success: boolean;
  finalResult: any;
  adjustments?: string[];
} {
  // Fallback: Extract from successful results
  const successful = results.filter((r) => r.success);

  if (successful.length === 0) {
    return {
      success: false,
      finalResult: 'Task failed - no successful steps',
      adjustments: ['Check tool availability', 'Verify input parameters'],
    };
  }

  // Extract result from last successful step
  const lastSuccess = successful[successful.length - 1];
  let finalResult = lastSuccess.output;

  // Extract specific values based on result structure
  if (typeof finalResult === 'object' && finalResult !== null) {
    if ('text' in finalResult) finalResult = finalResult.text;
    else if ('label' in finalResult) finalResult = finalResult.label;
    else if ('value' in finalResult) finalResult = String(finalResult.value);
    else if ('snippet' in finalResult) finalResult = finalResult.snippet;
  }

  const failed = results.filter((r) => !r.success);

  return {
    success: failed.length === 0,
    finalResult,
    adjustments: failed.length > 0 ? [`${failed.length} steps failed`] : undefined,
  };
}
