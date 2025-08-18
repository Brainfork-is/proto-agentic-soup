/**
 * Hybrid Research Agent - specialized for web research and investigation
 * Uses specialized research prompting + direct tool execution
 */

import { JobData } from '@soup/common';
import { BaseSpecializedAgent, AgentPlan } from './BaseSpecializedAgent';

export class HybridResearchAgent extends BaseSpecializedAgent {
  constructor(id: string, temperature: number, tools: string[]) {
    super(id, temperature, tools, 'HybridResearchAgent');
  }

  protected buildSpecializedPlanningPrompt(job: JobData, memoryContext: string): string {
    const availableTools = this.tools.join(', ');
    
    let taskDescription = '';
    switch (job.category) {
      case 'web_research':{
        const { url, question } = job.payload as any;
        taskDescription = `Research the question "${question}" by navigating to ${url} and extracting comprehensive information.`;
        break;
        }
        
      case 'summarize':{
        const { text, maxWords } = job.payload as any;
        taskDescription = `Research and summarize the key points from this text in ${maxWords || 50} words: ${text}`;
        break;
        }
        
      case 'classify':{
        const { labels, answer } = job.payload as any;
        taskDescription = `Research and classify this content into categories: ${labels?.join(', ') || 'appropriate category'}. Content: ${answer}`;
        break;
        }
        
      case 'math':{
        const { expr } = job.payload as any;
        taskDescription = `Research mathematical methods and solve: ${expr}`;
        break;
        }
        
      default:
        taskDescription = `Research and complete the ${job.category} task: ${JSON.stringify(job.payload)}`;
    }

    return `You are a research-specialized AI agent. You excel at thorough investigation, 
information gathering, and systematic analysis. You are methodical and ensure comprehensive coverage.

AVAILABLE TOOLS: ${availableTools}

RESEARCH EXPERIENCE AND MEMORY:
${memoryContext}

RESEARCH TASK: ${taskDescription}

Create a detailed research plan to complete this task systematically. Be specific about what information 
you need to gather and how you'll use each tool.

Respond with a JSON plan in this exact format:
{
  "goal": "Brief description of what you want to achieve",
  "steps": [
    {
      "tool": "tool_name",
      "params": {"param1": "value1", "param2": "value2"},
      "reasoning": "Why this step is needed for the research"
    }
  ]
}

IMPORTANT: Only use tools that are available: ${availableTools}
Make sure params match the expected format for each tool.`;
  }

  protected buildSpecializedReflectionPrompt(plan: AgentPlan, results: any[]): string {
    const resultsText = results.map((r, i) => 
      `Step ${i + 1}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.result || r.error}`
    ).join('\n');

    return `You are a research-specialized AI agent analyzing the results of your research plan.

ORIGINAL RESEARCH GOAL: ${plan.goal}

EXECUTION RESULTS:
${resultsText}

As a research specialist, analyze these results and provide:
1. Whether the research was successful overall
2. A comprehensive final answer based on the gathered information
3. Any adjustments needed for future research

Respond with JSON in this exact format:
{
  "success": true/false,
  "finalResult": "Your comprehensive research findings or final answer",
  "adjustments": ["suggestion1", "suggestion2"]
}

Focus on providing substantive research findings, not just describing what you did.`;
  }

  protected parsePlanResponse(content: string, job: JobData): AgentPlan {
    try {
      // Extract JSON from response
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
      console.error('[HybridResearchAgent] Plan parsing failed:', error);
      // Fallback plan
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
        finalResult: reflection.finalResult || 'Research completed',
        adjustments: reflection.adjustments || []
      };
    } catch (error) {
      console.error('[HybridResearchAgent] Reflection parsing failed:', error);
      
      // Fallback based on execution success
      const hasSuccessfulSteps = results.some(r => r.success);
      return {
        success: hasSuccessfulSteps,
        finalResult: hasSuccessfulSteps ? 'Research completed with partial results' : 'Research failed',
        adjustments: ['Improve plan parsing', 'Enhance tool usage']
      };
    }
  }

  private createFallbackPlan(job: JobData): AgentPlan {
    switch (job.category) {
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
              reasoning: 'Extract content from the provided URL'
            }
          ]
        };

      case 'summarize':{
        const { text, maxWords } = job.payload as any;
        return {
          goal: `Summarize text in ${maxWords || 50} words`,
          steps: [
            {
              tool: 'stringKit',
              params: { text, mode: 'summarize', maxWords: maxWords || 50 },
              reasoning: 'Summarize the provided text'
            }
          ]
        };

      case 'classify':{
        const { labels, answer } = job.payload as any;
        return {
          goal: 'Classify the content',
          steps: [
            {
              tool: 'stringKit',
              params: { text: answer, mode: 'classify', labels },
              reasoning: 'Classify the content into appropriate categories'
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
              reasoning: 'Calculate the mathematical expression'
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