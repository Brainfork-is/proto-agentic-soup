/**
 * Legacy SimpleAgent - kept for backward compatibility during LangGraph transition
 */

import { JobData } from '@soup/common';
import { Tools } from './tools';
import { LLMPlanner } from './llmPlanner';
import { memoryManager } from './agentMemory';

export interface ExecutionResult {
  success: boolean;
  result: any;
  error?: string;
  stepsUsed?: number;
}

export class SimpleAgent {
  id: string;
  temperature: number;
  tools: string[];
  private llmPlanner: LLMPlanner;

  constructor(id: string, t: number, tools: string[]) {
    this.id = id;
    this.temperature = t;
    this.tools = tools;
    this.llmPlanner = new LLMPlanner(t, tools, id);
  }

  async handle(job: JobData) {
    try {
      // Phase 1: Planning
      const plan = await this.llmPlanner.plan(job.category, job.payload);

      // Phase 2: Acting (execute each step)
      const executionResults: ExecutionResult[] = [];
      let totalStepsUsed = 0;

      for (const step of plan.steps) {
        try {
          let result: any;

          // Actor: Execute tool calls based on plan
          switch (step.tool) {
            case 'browser': {
              if (this.tools.includes('browser')) {
                result = await Tools.browser(step.params as { url: string; steps: any[] });
                totalStepsUsed += result.stepsUsed || 0;
              } else {
                result = { error: 'Browser tool not available' };
              }
              break;
            }

            case 'stringKit': {
              if (this.tools.includes('stringKit')) {
                result = await Tools.stringKit(
                  step.params as {
                    text: string;
                    mode: 'summarize' | 'classify';
                    labels?: string[];
                    maxWords?: number;
                  },
                  this.id // Pass agent ID for LangChain
                );
              } else {
                result = { error: 'StringKit tool not available' };
              }
              break;
            }

            case 'calc': {
              if (this.tools.includes('calc')) {
                result = await Tools.calc(step.params as { expr: string });
              } else {
                result = { error: 'Calc tool not available' };
              }
              break;
            }

            case 'retrieval': {
              if (this.tools.includes('retrieval')) {
                result = await Tools.retrieval(
                  step.params as {
                    query: string;
                    useKnowledgeServer?: boolean;
                  }
                );
              } else {
                result = { error: 'Retrieval tool not available' };
              }
              break;
            }

            default:
              result = { error: `Unknown tool: ${step.tool}` };
          }

          executionResults.push({
            success: !result.error,
            result,
            error: result.error,
            stepsUsed: result.stepsUsed || 0,
          });
        } catch (error) {
          executionResults.push({
            success: false,
            result: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Phase 3: Reflection
      const reflection = await this.llmPlanner.reflect(plan, executionResults);

      // Store experience in memory
      const memory = memoryManager.getMemory(this.id);
      memory.remember({
        category: job.category,
        payload: job.payload,
        success: reflection.success,
        artifact: reflection.finalResult,
        stepsUsed: totalStepsUsed,
        planUsed: plan.goal,
        adjustments: reflection.adjustments,
      });

      return {
        ok: reflection.success,
        artifact: reflection.finalResult,
        stepsUsed: totalStepsUsed,
        planUsed: plan.goal,
        adjustments: reflection.adjustments,
      };
    } catch (error) {
      // Let it fail gracefully - no fallbacks per project policy
      console.error(`[SimpleAgent] Agent ${this.id} failed to handle job:`, error);
      throw error;
    }
  }
}
