/**
 * Planning Node for LangGraph Agent
 * Uses structured output instead of JSON parsing
 */

import { AgentState, ExecutionPlan } from '../agentState';
import { llmProvider } from '../../llmProvider';
import { memoryManager } from '../../agentMemory';
import { planGenerationSchema } from '../structuredTools';

export async function planNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(
    `[PlanNode] Agent ${state.agentId}: Starting planning for ${state.jobData?.category}`
  );

  if (!state.jobData) {
    return {
      error: 'No job data provided',
      checkpoint: 'failed',
    };
  }

  try {
    // Get agent memory for context
    const memory = memoryManager.getMemory(state.agentId);
    const memoryContext = memory.generateContext();

    // Build planning prompt
    const prompt = buildPlanningPrompt(
      state.jobData.category,
      state.jobData.payload,
      state.availableTools,
      memoryContext,
      state.temperature
    );

    // Generate plan using regular LLM call with clear JSON instructions
    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: state.temperature,
        maxTokens: 1200,
      },
      state.agentId
    );

    if (!response) {
      throw new Error('Failed to generate plan - no response from LLM');
    }

    // Parse and validate the plan with simplified JSON extraction
    const plan = parseSimplePlan(response.content, state.availableTools);

    console.log(`[PlanNode] Agent ${state.agentId}: Created plan with ${plan.steps.length} steps`);

    return {
      plan,
      checkpoint: 'planned',
      currentStep: 0,
      error: null,
    };
  } catch (error) {
    console.error(`[PlanNode] Agent ${state.agentId}: Planning failed`, error);

    return {
      error: error instanceof Error ? error.message : 'Planning failed',
      checkpoint: 'failed',
      retryCount: state.retryCount + 1,
    };
  }
}

function buildPlanningPrompt(
  category: string,
  payload: any,
  availableTools: string[],
  memoryContext: string,
  temperature: number
): string {
  const toolsStr = availableTools.join(', ');

  return `You are an AI agent with temperature ${temperature.toFixed(2)} planning how to complete a task.

AGENT MEMORY:
${memoryContext}

Based on your past experience, plan accordingly.

AVAILABLE TOOLS: ${toolsStr}
⚠️  CRITICAL: You can ONLY use tools from the AVAILABLE TOOLS list above.

TASK CATEGORY: ${category}
TASK PAYLOAD: ${JSON.stringify(payload, null, 2)}

TOOL CAPABILITIES:
- browser: Navigate web pages, extract content. Requires: url, steps array
- stringKit: Summarize or classify text. Requires: text, mode (summarize/classify)
- calc: Evaluate math expressions. Requires: expr
- retrieval: Search knowledge base. Requires: query

Create a step-by-step plan to complete this task efficiently. Focus on the goal, the specific steps needed, and your overall strategy.`;
}

function parseSimplePlan(content: string, availableTools: string[]): ExecutionPlan {
  console.log(`[PlanNode] Parsing plan from ${content.length} chars`);

  // Extract JSON using simple regex - be more permissive
  let jsonStr = '';
  const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1];
  } else {
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    } else {
      // Fallback: extract just the steps array if that's what we have
      const stepsMatch = content.match(/"steps":\s*\[[\s\S]*?\]/);
      if (stepsMatch) {
        jsonStr = `{"goal": "Complete the task", ${stepsMatch[0]}}`;
      } else {
        console.error(`[PlanNode] No JSON found in content of ${content.length} chars`);
        throw new Error('No JSON found in plan response');
      }
    }
  }

  let planData;
  try {
    planData = JSON.parse(jsonStr);
  } catch (error) {
    console.error(`[PlanNode] JSON parse failed:`, error);
    console.error(`[PlanNode] Raw JSON:`, jsonStr);
    throw new Error(`Invalid JSON in plan: ${error}`);
  }

  // Be flexible with plan structure - extract what we can
  const goal = planData.goal || planData.strategy || 'Complete the task';
  const steps = planData.steps || [];

  if (!Array.isArray(steps)) {
    throw new Error('Plan steps must be an array');
  }

  // Normalize step format and filter valid tools
  const validSteps = steps
    .map((step: any) => {
      // Handle different JSON formats the LLM might produce
      const tool = step.tool;
      const action = step.action || step.description || `Use ${tool}`;

      // Handle params vs args vs required_input variations
      let params = step.params || step.args || step.required_input || {};

      // Basic param validation for each tool
      if (tool === 'browser' && params.url) {
        if (!params.steps) params.steps = [{ type: 'extract', selector: 'body' }];
      }
      if (tool === 'calc' && !params.expr) {
        params.expr = '1+1'; // Fallback
      }

      return {
        tool,
        action,
        params,
        reasoning: step.reasoning || `Using ${tool} to ${action}`,
      };
    })
    .filter((step: any) => {
      if (!step.tool || !availableTools.includes(step.tool)) {
        console.warn(`[PlanNode] Skipping unavailable tool: ${step.tool}`);
        return false;
      }
      return true;
    });

  if (validSteps.length === 0) {
    throw new Error('No valid steps after parsing and filtering');
  }

  console.log(`[PlanNode] Parsed ${validSteps.length} valid steps from plan`);

  return {
    goal,
    steps: validSteps,
    strategy: planData.strategy || goal,
  };
}
