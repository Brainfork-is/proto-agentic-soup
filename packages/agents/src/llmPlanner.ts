/**
 * LLM-powered planner implementing the Plan-Act-Reflect pattern
 * Uses Google Vertex AI for intelligent planning and reflection
 */

import { Plan, PlanStep, ExecutionResult } from './mockPlanner';
import { llmProvider, UnifiedLLMRequest } from './llmProvider';
import { memoryManager } from './agentMemory';

export class LLMPlanner {
  private temperature: number;
  private availableTools: string[];
  private agentId: string;
  private fallbackToMock: boolean;

  constructor(temperature: number = 0.5, tools: string[] = [], agentId: string = 'unknown') {
    this.temperature = temperature;
    this.availableTools = tools;
    this.agentId = agentId;
    this.fallbackToMock = false;
  }

  /**
   * Plan phase: Create a plan using LLM reasoning
   */
  async plan(category: string, payload: any): Promise<Plan> {
    if (this.fallbackToMock) {
      return this.mockPlan(category, payload);
    }

    const prompt = this.buildPlanningPrompt(category, payload);

    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: this.temperature,
        maxTokens: 800,
      },
      this.agentId
    );

    if (!response) {
      console.log(`[LLMPlanner] Agent ${this.agentId}: LLM planning failed, falling back to mock`);
      this.fallbackToMock = true;
      return this.mockPlan(category, payload);
    }

    try {
      const plan = this.parsePlanResponse(response.content, category, payload);
      console.log(
        `[LLMPlanner] Agent ${this.agentId}: Generated LLM plan for ${category} using ${response.provider}`
      );
      return plan;
    } catch (error) {
      console.log(
        `[LLMPlanner] Agent ${this.agentId}: Failed to parse LLM plan, falling back to mock`
      );
      return this.mockPlan(category, payload);
    }
  }

  /**
   * Reflection phase: Analyze execution results using LLM
   */
  async reflect(
    plan: Plan,
    results: ExecutionResult[]
  ): Promise<{
    success: boolean;
    finalResult: any;
    adjustments?: string[];
  }> {
    if (this.fallbackToMock) {
      return this.mockReflect(plan, results);
    }

    const prompt = this.buildReflectionPrompt(plan, results);

    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: this.temperature * 0.8, // Slightly lower temperature for reflection
        maxTokens: 600,
      },
      this.agentId
    );

    if (!response) {
      console.log(
        `[LLMPlanner] Agent ${this.agentId}: LLM reflection failed, falling back to mock`
      );
      return this.mockReflect(plan, results);
    }

    try {
      const reflection = this.parseReflectionResponse(response.content, results);
      console.log(
        `[LLMPlanner] Agent ${this.agentId}: Generated LLM reflection using ${response.provider}`
      );
      return reflection;
    } catch (error) {
      console.log(
        `[LLMPlanner] Agent ${this.agentId}: Failed to parse LLM reflection, falling back to mock`
      );
      return this.mockReflect(plan, results);
    }
  }

  private buildPlanningPrompt(category: string, payload: any): string {
    const toolsStr = this.availableTools.join(', ');
    const memory = memoryManager.getMemory(this.agentId);
    const memoryContext = memory.generateContext();

    return `You are an AI agent with temperature ${this.temperature.toFixed(2)} planning how to complete a task.

AGENT MEMORY:
${memoryContext}

Based on your past experience, plan accordingly.

AVAILABLE TOOLS: ${toolsStr}

TASK CATEGORY: ${category}
TASK PAYLOAD: ${JSON.stringify(payload, null, 2)}

TOOL CAPABILITIES:
- browser: Navigate web pages, extract content (params: {url, steps: [{type: 'wait', ms}, {type: 'extract', selector}]})
- stringKit: Summarize or classify text (params: {text, mode: 'summarize'|'classify', maxWords?, labels?})
- calc: Evaluate math expressions (params: {expr})
- retrieval: Search knowledge base (params: {query, useKnowledgeServer?})

Create a step-by-step plan to complete this task. Only use tools that are in your AVAILABLE TOOLS list.

Respond with a JSON object in this exact format:
{
  "goal": "Brief description of what you're trying to achieve",
  "steps": [
    {
      "action": "Description of this step",
      "tool": "tool_name",
      "params": {...},
      "reasoning": "Why this step is needed"
    }
  ],
  "context": {"strategy": "your overall approach"}
}`;
  }

  private buildReflectionPrompt(plan: Plan, results: ExecutionResult[]): string {
    const resultsStr = results
      .map(
        (r, i) =>
          `Step ${i + 1}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.error || JSON.stringify(r.result)}`
      )
      .join('\n');

    return `You are an AI agent reflecting on the execution of your plan.

ORIGINAL GOAL: ${plan.goal}

EXECUTION RESULTS:
${resultsStr}

Analyze whether the plan succeeded overall and extract the final result. If there were failures, suggest what could be improved.

Respond with a JSON object in this exact format:
{
  "success": true/false,
  "finalResult": "the main output/answer from the execution",
  "adjustments": ["suggestion 1", "suggestion 2"] (optional, if improvements needed)
}`;
  }

  private parsePlanResponse(content: string, category: string, payload: any): Plan {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in plan response');
    }

    const planData = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!planData.goal || !planData.steps || !Array.isArray(planData.steps)) {
      throw new Error('Invalid plan structure');
    }

    // Validate steps and filter out tools not available to this agent
    const validSteps = planData.steps.filter((step: any) => {
      if (!step.tool || !this.availableTools.includes(step.tool)) {
        console.log(`[LLMPlanner] Skipping step with unavailable tool: ${step.tool}`);
        return false;
      }
      return step.action && step.params;
    });

    if (validSteps.length === 0) {
      throw new Error('No valid steps in plan');
    }

    return {
      goal: planData.goal,
      steps: validSteps as PlanStep[],
      context: planData.context || {},
    };
  }

  private parseReflectionResponse(
    content: string,
    results: ExecutionResult[]
  ): {
    success: boolean;
    finalResult: any;
    adjustments?: string[];
  } {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in reflection response');
    }

    const reflectionData = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (typeof reflectionData.success !== 'boolean' || !reflectionData.finalResult) {
      throw new Error('Invalid reflection structure');
    }

    return {
      success: reflectionData.success,
      finalResult: reflectionData.finalResult,
      adjustments: reflectionData.adjustments || [],
    };
  }

  // Fallback to mock behavior when LLM is unavailable
  private mockPlan(category: string, payload: any): Plan {
    const plans: Record<string, Plan> = {
      web_research: {
        goal: `Research and answer: ${payload.question}`,
        steps: [
          {
            action: 'navigate_and_extract',
            tool: 'browser',
            params: {
              url: payload.url,
              steps: [
                { type: 'wait', ms: 100 },
                { type: 'extract', selector: 'body' },
              ],
            },
            reasoning: 'Navigate to the URL and extract page content to find the answer',
          },
        ],
        context: { strategy: 'direct_extraction' },
      },
      summarize: {
        goal: `Summarize text in ${payload.maxWords || 12} words or less`,
        steps: [
          {
            action: 'summarize_text',
            tool: 'stringKit',
            params: {
              text: payload.text,
              mode: 'summarize',
              maxWords: payload.maxWords || 12,
            },
            reasoning: 'Use text processing to create a concise summary',
          },
        ],
        context: { strategy: 'text_compression' },
      },
      classify: {
        goal: `Classify text into one of: ${payload.labels?.join(', ') || 'categories'}`,
        steps: [
          {
            action: 'classify_text',
            tool: 'stringKit',
            params: {
              text: payload.text,
              mode: 'classify',
              labels: payload.labels,
            },
            reasoning: 'Analyze text content to determine the appropriate classification',
          },
        ],
        context: { strategy: 'pattern_matching' },
      },
      math: {
        goal: `Calculate: ${payload.expr}`,
        steps: [
          {
            action: 'evaluate_expression',
            tool: 'calc',
            params: { expr: payload.expr },
            reasoning: 'Use calculator to evaluate the mathematical expression',
          },
        ],
        context: { strategy: 'direct_calculation' },
      },
    };

    return (
      plans[category] || {
        goal: 'Unknown task category',
        steps: [],
        context: { strategy: 'fallback' },
      }
    );
  }

  private mockReflect(
    plan: Plan,
    results: ExecutionResult[]
  ): {
    success: boolean;
    finalResult: any;
    adjustments?: string[];
  } {
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (successful.length === 0) {
      return {
        success: false,
        finalResult: 'Task failed - no successful steps',
        adjustments: ['Check tool availability', 'Verify input parameters'],
      };
    }

    // Extract result from last successful step
    const lastSuccess = successful[successful.length - 1];
    let finalResult = lastSuccess.result;

    // Extract specific values based on result structure
    if (typeof finalResult === 'object' && finalResult !== null) {
      if ('text' in finalResult) finalResult = finalResult.text;
      else if ('label' in finalResult) finalResult = finalResult.label;
      else if ('value' in finalResult) finalResult = String(finalResult.value);
      else if ('lastText' in finalResult) finalResult = finalResult.lastText;
      else if ('snippet' in finalResult) finalResult = finalResult.snippet;
    }

    return {
      success: failed.length === 0,
      finalResult,
      adjustments: failed.length > 0 ? [`${failed.length} steps failed`] : undefined,
    };
  }
}
