/**
 * Base class for specialized agents that combines:
 * 1. Specialized reasoning/prompting per agent type
 * 2. Direct tool execution (working with Ollama)
 * 3. Plan-Act-Reflect pattern from original SimpleAgent
 */

import { JobData } from '@soup/common';
import { llmProvider } from '../llmProvider';
import { memoryManager } from '../agentMemory';
import { Tools } from '../tools';

export interface AgentStep {
  tool: string;
  params: any;
  reasoning: string;
}

export interface AgentPlan {
  goal: string;
  steps: AgentStep[];
}

export abstract class BaseSpecializedAgent {
  protected id: string;
  protected temperature: number;
  protected tools: string[];
  protected agentType: string;

  constructor(id: string, temperature: number, tools: string[], agentType: string) {
    this.id = id;
    this.temperature = temperature;
    this.tools = tools;
    this.agentType = agentType;
  }

  async handle(job: JobData) {
    try {
      console.log(`[${this.agentType}] Agent ${this.id} handling ${job.category} job`);

      // Get agent memory for context
      const memory = memoryManager.getMemory(this.id);
      const memoryContext = memory.generateContext();

      // Phase 1: Specialized Planning
      const plan = await this.generateSpecializedPlan(job, memoryContext);

      // Phase 2: Direct Tool Execution
      const executionResults: any[] = [];
      let totalStepsUsed = 0;

      for (const step of plan.steps) {
        try {
          console.log(`[${this.agentType}] Executing: ${step.tool} - ${step.reasoning}`);
          const result = await this.executeToolStep(step);

          executionResults.push({
            success: !result.error,
            result,
            error: result.error,
            stepsUsed: result.stepsUsed || 0,
          });

          totalStepsUsed += result.stepsUsed || 0;
        } catch (error) {
          executionResults.push({
            success: false,
            result: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Phase 3: Extract actual results from tool execution
      // Find the last successful result as the final output
      let finalResult = '';
      let success = false;

      // Look for actual computed results in the execution results
      for (let i = executionResults.length - 1; i >= 0; i--) {
        const execResult = executionResults[i];
        if (execResult.success && execResult.result) {
          // Extract the actual value/text/answer from the tool result
          if (execResult.result.value !== undefined) {
            finalResult = String(execResult.result.value);
            success = true;
            break;
          } else if (execResult.result.text) {
            finalResult = execResult.result.text;
            success = true;
            break;
          } else if (execResult.result.answer) {
            finalResult = execResult.result.answer;
            success = true;
            break;
          } else if (execResult.result.content) {
            // For browser/retrieval results, extract key content
            finalResult = this.extractKeyContent(execResult.result.content, job);
            success = true;
            break;
          }
        }
      }

      // If no clear result found, use reflection as fallback
      if (!finalResult) {
        const reflection = await this.generateSpecializedReflection(plan, executionResults);
        finalResult = reflection.finalResult;
        success = reflection.success;
      }

      // Store experience in memory
      memory.remember({
        category: job.category,
        payload: job.payload,
        success,
        artifact: finalResult,
        stepsUsed: totalStepsUsed,
        planUsed: plan.goal,
        adjustments: [],
      });

      console.log(
        `[${this.agentType}] Agent ${this.id} completed ${job.category} - Success: ${success}, Result: ${finalResult.substring(0, 100)}`
      );

      return {
        ok: success,
        artifact: finalResult,
        stepsUsed: totalStepsUsed,
        planUsed: plan.goal,
        adjustments: [],
      };
    } catch (error) {
      console.error(`[${this.agentType}] Agent ${this.id} failed:`, error);

      // Store failure in memory
      const memory = memoryManager.getMemory(this.id);
      memory.remember({
        category: job.category,
        payload: job.payload,
        success: false,
        artifact: `Failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed to plan',
        adjustments: ['Fix agent error'],
      });

      return {
        ok: false,
        artifact: `Agent failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed to plan',
        adjustments: ['Fix agent error'],
      };
    }
  }

  /**
   * Generate a specialized plan based on agent type and job
   */
  protected async generateSpecializedPlan(job: JobData, memoryContext: string): Promise<AgentPlan> {
    const prompt = this.buildSpecializedPlanningPrompt(job, memoryContext);

    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: this.temperature,
        maxTokens: 1000,
      },
      this.id
    );

    if (!response) {
      throw new Error('Failed to generate plan - no response from LLM');
    }

    return this.parsePlanResponse(response.content, job);
  }

  /**
   * Extract key content from browser/retrieval results based on job type
   */
  private extractKeyContent(content: string, job: JobData): string {
    // For different job types, extract appropriate content
    switch (job.category) {
      case 'web_research': {
        const { question } = job.payload as any;
        // Extract first relevant paragraph or sentence about the question
        const sentences = content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes(question?.toLowerCase()?.substring(0, 20) || '')) {
            return sentence.trim();
          }
        }
        // Fallback: return first 200 chars
        return content.substring(0, 200).trim();
      }

      case 'summarize': {
        const { maxWords } = job.payload as any;
        // Take first sentence or up to maxWords
        const words = content.split(/\s+/);
        return words.slice(0, maxWords || 50).join(' ');
      }

      case 'classify': {
        const { labels } = job.payload as any;
        // Look for any of the labels in the content
        if (labels && Array.isArray(labels)) {
          for (const label of labels) {
            if (content.toLowerCase().includes(label.toLowerCase())) {
              return label;
            }
          }
        }
        return labels?.[0] || 'Unknown';
      }

      default:
        return content.substring(0, 100).trim();
    }
  }

  /**
   * Generate specialized reflection based on agent type
   */
  protected async generateSpecializedReflection(
    plan: AgentPlan,
    results: any[]
  ): Promise<{ success: boolean; finalResult: string; adjustments: string[] }> {
    const prompt = this.buildSpecializedReflectionPrompt(plan, results);

    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: this.temperature * 0.7, // Lower temperature for reflection
        maxTokens: 800,
      },
      this.id
    );

    if (!response) {
      throw new Error('Failed to generate reflection');
    }

    return this.parseReflectionResponse(response.content, results);
  }

  /**
   * Execute a single tool step with direct tool calling
   */
  protected async executeToolStep(step: AgentStep): Promise<any> {
    switch (step.tool) {
      case 'browser': {
        if (this.tools.includes('browser')) {
          return await Tools.browser(step.params as { url: string; steps: any[] });
        } else {
          return { error: 'Browser tool not available' };
        }
      }

      case 'stringKit': {
        if (this.tools.includes('stringKit')) {
          return await Tools.stringKit(
            step.params as {
              text: string;
              mode: 'summarize' | 'classify';
              labels?: string[];
              maxWords?: number;
            },
            this.id
          );
        } else {
          return { error: 'StringKit tool not available' };
        }
      }

      case 'calc': {
        if (this.tools.includes('calc')) {
          return await Tools.calc(step.params as { expr: string });
        } else {
          return { error: 'Calc tool not available' };
        }
      }

      case 'retrieval': {
        if (this.tools.includes('retrieval')) {
          return await Tools.retrieval(
            step.params as {
              query: string;
              useKnowledgeServer?: boolean;
            }
          );
        } else {
          return { error: 'Retrieval tool not available' };
        }
      }

      default:
        return { error: `Unknown tool: ${step.tool}` };
    }
  }

  // Abstract methods that each specialized agent must implement
  protected abstract buildSpecializedPlanningPrompt(job: JobData, memoryContext: string): string;
  protected abstract buildSpecializedReflectionPrompt(plan: AgentPlan, results: any[]): string;
  protected abstract parsePlanResponse(content: string, job: JobData): AgentPlan;
  protected abstract parseReflectionResponse(
    content: string,
    results: any[]
  ): { success: boolean; finalResult: string; adjustments: string[] };
}
