/**
 * Hybrid ReAct Agent - specialized for mathematical reasoning and step-by-step problem solving
 * Uses step-by-step reasoning + direct tool execution
 */

import { JobData } from '@soup/common';
import { BaseSpecializedAgent, AgentPlan } from './BaseSpecializedAgent';

export class HybridReActAgent extends BaseSpecializedAgent {
  constructor(id: string, temperature: number, tools: string[]) {
    super(id, temperature, tools, 'HybridReActAgent');
  }

  protected buildSpecializedPlanningPrompt(job: JobData, memoryContext: string): string {
    const availableTools = this.tools.join(', ');

    let taskDescription = '';
    switch (job.category) {
      case 'math': {
        const { expr } = job.payload as any;
        taskDescription = `Solve the mathematical expression step-by-step: ${expr}`;
        break;
      }

      case 'web_research': {
        const { url, question } = job.payload as any;
        taskDescription = `Research "${question}" by systematically analyzing ${url}`;
        break;
      }

      case 'summarize': {
        const { text, maxWords } = job.payload as any;
        taskDescription = `Analyze and summarize this text in ${maxWords || 50} words: ${text}`;
        break;
      }

      case 'classify': {
        const { labels, answer } = job.payload as any;
        taskDescription = `Systematically classify: "${answer}" into: ${labels?.join(', ') || 'categories'}`;
        break;
      }

      default:
        taskDescription = `Solve step-by-step: ${JSON.stringify(job.payload)}`;
    }

    return `You are a ReAct (Reasoning + Acting) specialized AI agent. You excel at step-by-step reasoning,
logical problem solving, and systematic analysis. You think through problems methodically.

AVAILABLE TOOLS: ${availableTools}

REASONING EXPERIENCE:
${memoryContext}

PROBLEM: ${taskDescription}

Create a step-by-step plan with clear reasoning for each action. Think through the problem logically.

Respond with a JSON plan in this exact format:
{
  "goal": "Clear description of the problem to solve",
  "steps": [
    {
      "tool": "tool_name",
      "params": {"param1": "value1"},
      "reasoning": "Step-by-step reasoning for why this action is needed"
    }
  ]
}

IMPORTANT: Only use available tools: ${availableTools}
Focus on logical, systematic problem solving.`;
  }

  protected buildSpecializedReflectionPrompt(plan: AgentPlan, results: any[]): string {
    const resultsText = results
      .map((r, i) => `Step ${i + 1}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.result || r.error}`)
      .join('\n');

    return `You are a ReAct agent analyzing your systematic problem-solving results.

PROBLEM GOAL: ${plan.goal}

STEP-BY-STEP RESULTS:
${resultsText}

Apply logical reasoning to analyze:
1. Did the systematic approach succeed?
2. What is the final answer/solution?
3. How can the reasoning be improved?

Respond with JSON in this exact format:
{
  "success": true/false,
  "finalResult": "The actual solution/answer",
  "adjustments": ["reasoning improvement1", "reasoning improvement2"]
}

Provide the concrete answer, not a description of your process.`;
  }

  protected parsePlanResponse(content: string, job: JobData): AgentPlan {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in plan response');
      }

      const plan = JSON.parse(jsonMatch[0]);

      if (!plan.goal || !plan.steps || !Array.isArray(plan.steps)) {
        throw new Error('Invalid plan structure');
      }

      return plan;
    } catch (error) {
      console.error('[HybridReActAgent] Plan parsing failed:', error);
      return this.createFallbackPlan(job);
    }
  }

  protected parseReflectionResponse(
    content: string,
    results: any[]
  ): { success: boolean; finalResult: string; adjustments: string[] } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in reflection response');
      }

      const reflection = JSON.parse(jsonMatch[0]);

      return {
        success: reflection.success || false,
        finalResult: reflection.finalResult || 'Problem solved',
        adjustments: reflection.adjustments || [],
      };
    } catch (error) {
      console.error('[HybridReActAgent] Reflection parsing failed:', error);

      const hasSuccessfulSteps = results.some((r) => r.success);
      return {
        success: hasSuccessfulSteps,
        finalResult: hasSuccessfulSteps ? 'Solution completed' : 'Problem solving failed',
        adjustments: ['Improve logical reasoning', 'Better step analysis'],
      };
    }
  }

  private createFallbackPlan(job: JobData): AgentPlan {
    switch (job.category) {
      case 'math': {
        const { expr } = job.payload as any;
        return {
          goal: `Calculate: ${expr}`,
          steps: [
            {
              tool: 'calc',
              params: { expr },
              reasoning: 'Direct calculation to solve the mathematical expression',
            },
          ],
        };
      }

      default:
        return {
          goal: `Solve ${job.category} systematically`,
          steps: [],
        };
    }
  }
}
