/**
 * Hybrid Memory Agent - specialized for text processing and classification
 * Uses enhanced memory utilization + direct tool execution
 */

import { JobData } from '@soup/common';
import { BaseSpecializedAgent, AgentPlan } from './BaseSpecializedAgent';

export class HybridMemoryAgent extends BaseSpecializedAgent {
  constructor(id: string, temperature: number, tools: string[]) {
    super(id, Math.max(0.1, temperature - 0.2), tools, 'HybridMemoryAgent'); // Lower temperature for consistency
  }

  protected buildSpecializedPlanningPrompt(job: JobData, memoryContext: string): string {
    const availableTools = this.tools.join(', ');
    
    let taskDescription = '';
    let memoryGuidance = '';
    
    switch (job.category) {
      case 'summarize':{
        const { text, maxWords } = job.payload as any;
        taskDescription = `Summarize the following text in ${maxWords || 50} words or less: ${text}`;
        memoryGuidance = "Use your memory of previous summarization tasks to identify key patterns and important information types.";
        break;
        }
        
      case 'classify':{
        const { labels, answer } = job.payload as any;
        taskDescription = `Classify the content into one of these categories: ${labels?.join(', ') || 'appropriate category'}. Content: ${answer}`;
        memoryGuidance = "Leverage your memory of previous classifications to identify distinguishing features and patterns.";
        break;
        }
        
      case 'web_research':{
        const { url, question } = job.payload as any;
        taskDescription = `Research "${question}" by navigating to ${url} and extracting relevant information.`;
        memoryGuidance = "Use your memory of successful research strategies and information extraction techniques.";
        break;
        }
        
      case 'math':{
        const { expr } = job.payload as any;
        taskDescription = `Calculate the mathematical expression: ${expr}`;
        memoryGuidance = "Apply your memory of mathematical problem-solving approaches and verification methods.";
        break;
        }
        
      default:
        taskDescription = `Complete the ${job.category} task: ${JSON.stringify(job.payload)}`;
        memoryGuidance = "Use your accumulated experience to approach this task systematically.";
    }

    return `You are a memory-specialized AI agent. You excel at text processing, categorization, 
pattern recognition, and leveraging past experiences. You focus on accuracy and consistency.

AVAILABLE TOOLS: ${availableTools}

MEMORY AND EXPERIENCE:
${memoryContext}

MEMORY GUIDANCE: ${memoryGuidance}

TASK: ${taskDescription}

Create a systematic plan that leverages your memory and experience. Focus on accuracy and consistency.

Respond with a JSON plan in this exact format:
{
  "goal": "Brief description of what you want to achieve",
  "steps": [
    {
      "tool": "tool_name",
      "params": {"param1": "value1", "param2": "value2"},
      "reasoning": "Why this step leverages memory/experience"
    }
  ]
}

IMPORTANT: Only use tools that are available: ${availableTools}
Focus on thorough processing rather than speed.`;
  }

  protected buildSpecializedReflectionPrompt(plan: AgentPlan, results: any[]): string {
    const resultsText = results.map((r, i) => 
      `Step ${i + 1}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.result || r.error}`
    ).join('\n');

    return `You are a memory-specialized AI agent analyzing your task completion results.

ORIGINAL GOAL: ${plan.goal}

EXECUTION RESULTS:
${resultsText}

As a memory specialist, analyze these results with focus on:
1. Accuracy and completeness of the output
2. Whether the result meets the specific requirements
3. Lessons learned for similar future tasks

Respond with JSON in this exact format:
{
  "success": true/false,
  "finalResult": "Your accurate, complete final answer",
  "adjustments": ["learning1", "learning2"]
}

Ensure the finalResult is the actual answer, not a description of what you did.`;
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

      // Validate steps
      for (const step of plan.steps) {
        if (!step.tool || !step.params || !step.reasoning) {
          throw new Error('Invalid step structure');
        }
        
        if (!this.tools.includes(step.tool)) {
          throw new Error(`Tool ${step.tool} not available`);
        }
      }

      return plan;
    } catch (error) {
      console.error('[HybridMemoryAgent] Plan parsing failed:', error);
      return this.createFallbackPlan(job);
    }
  }

  protected parseReflectionResponse(content: string, results: any[]): { success: boolean; finalResult: string; adjustments: string[] } {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in reflection response');
      }

      const reflection = JSON.parse(jsonMatch[0]);
      
      return {
        success: reflection.success || false,
        finalResult: reflection.finalResult || 'Task completed',
        adjustments: reflection.adjustments || []
      };
    } catch (error) {
      console.error('[HybridMemoryAgent] Reflection parsing failed:', error);
      
      // Memory agent should attempt to extract actual results
      const hasSuccessfulSteps = results.some(r => r.success);
      let finalResult = 'Task completed';
      
      if (hasSuccessfulSteps) {
        // Try to extract the actual result from successful steps
        const successfulResult = results.find(r => r.success && r.result);
        if (successfulResult) {
          finalResult = this.extractActualResult(successfulResult.result);
        }
      }
      
      return {
        success: hasSuccessfulSteps,
        finalResult,
        adjustments: ['Improve reflection parsing', 'Better result extraction']
      };
    }
  }

  private extractActualResult(result: any): string {
    // Extract meaningful content from tool results
    if (typeof result === 'string') {
      return result;
    }
    
    if (result && result.text) {
      return result.text;
    }
    
    if (result && result.label) {
      return result.label;
    }
    
    if (result && result.value !== undefined) {
      return String(result.value);
    }
    
    if (result && result.content) {
      return result.content.substring(0, 500); // Limit content length
    }
    
    return JSON.stringify(result);
  }

  private createFallbackPlan(job: JobData): AgentPlan {
    switch (job.category) {
      case 'summarize':{
        const { text, maxWords } = job.payload as any;
        return {
          goal: `Summarize text in ${maxWords || 50} words`,
          steps: [
            {
              tool: 'stringKit',
              params: { text, mode: 'summarize', maxWords: maxWords || 50 },
              reasoning: 'Apply systematic summarization using memory of effective techniques'
            }
          ]
        };

      case 'classify':{
        const { labels, answer } = job.payload as any;
        return {
          goal: 'Classify content accurately',
          steps: [
            {
              tool: 'stringKit',
              params: { text: answer, mode: 'classify', labels },
              reasoning: 'Use pattern recognition and memory of similar classifications'
            }
          ]
        };

      case 'web_research':{
        const { url, question } = job.payload as any;
        return {
          goal: `Research: ${question}`,
          steps: [
            {
              tool: 'browser',
              params: { 
                url: url, 
                steps: [
                  { type: 'wait', ms: 1000 },
                  { type: 'extract', selector: 'body' }
                ]
              },
              reasoning: 'Systematic information extraction using proven methods'
            }
          ]
        };

      case 'math':{
        const { expr } = job.payload as any;
        return {
          goal: `Calculate: ${expr}`,
          steps: [
            {
              tool: 'calc',
              params: { expr },
              reasoning: 'Apply mathematical knowledge with verification'
            }
          ]
        };

      default:
        return {
          goal: `Complete ${job.category} task`,
          steps: []
        };
    }
  }
}