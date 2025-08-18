/**
 * Hybrid Retrieval Agent - specialized for knowledge base queries and data synthesis
 * Uses systematic information retrieval + direct tool execution
 */

import { JobData } from '@soup/common';
import { BaseSpecializedAgent, AgentPlan } from './BaseSpecializedAgent';

export class HybridRetrievalAgent extends BaseSpecializedAgent {
  constructor(id: string, temperature: number, tools: string[]) {
    super(id, Math.max(0.3, temperature - 0.1), tools, 'HybridRetrievalAgent'); // Lower temperature for accurate retrieval
  }

  protected buildSpecializedPlanningPrompt(job: JobData, memoryContext: string): string {
    const availableTools = this.tools.join(', ');

    let taskDescription = '';
    let retrievalGuidance = '';

    switch (job.category) {
      case 'web_research': {
        const { url, question } = job.payload as any;
        taskDescription = `Retrieve information to research "${question}" and verify by navigating to ${url}`;
        retrievalGuidance =
          'Start with knowledge base searches, then use browser tools to verify and supplement findings.';
        break;
      }

      case 'classify': {
        const { labels, answer } = job.payload as any;
        taskDescription = `Retrieve classification examples and categorize: "${answer}" into: ${labels?.join(', ') || 'categories'}`;
        retrievalGuidance =
          'Search for similar examples and classification criteria in the knowledge base.';
        break;
      }

      case 'summarize': {
        const { text, maxWords } = job.payload as any;
        taskDescription = `Retrieve context and summarize this text in ${maxWords || 50} words: ${text}`;
        retrievalGuidance =
          'Use retrieval tools to understand context, then create an informed summary.';
        break;
      }

      case 'math': {
        const { expr } = job.payload as any;
        taskDescription = `Retrieve mathematical methods and solve: ${expr}`;
        retrievalGuidance = 'Search for relevant mathematical approaches and formulas.';
        break;
      }

      default:
        taskDescription = `Use retrieval methods for: ${JSON.stringify(job.payload)}`;
        retrievalGuidance = 'Search the knowledge base systematically for relevant information.';
    }

    return `You are a retrieval-specialized AI agent. You excel at searching knowledge bases,
finding relevant information, synthesizing data from multiple sources, and providing accurate answers.

AVAILABLE TOOLS: ${availableTools}

RETRIEVAL EXPERIENCE:
${memoryContext}

RETRIEVAL GUIDANCE: ${retrievalGuidance}

TASK: ${taskDescription}

Create a systematic retrieval plan to find the most relevant and accurate information.

Respond with a JSON plan in this exact format:
{
  "goal": "Clear description of what information to retrieve",
  "steps": [
    {
      "tool": "tool_name", 
      "params": {"param1": "value1"},
      "reasoning": "Why this retrieval step is needed"
    }
  ]
}

IMPORTANT: Only use available tools: ${availableTools}
Focus on systematic information gathering and synthesis.`;
  }

  protected buildSpecializedReflectionPrompt(plan: AgentPlan, results: any[]): string {
    const resultsText = results
      .map((r, i) => `Step ${i + 1}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.result || r.error}`)
      .join('\n');

    return `You are a retrieval-specialized AI agent analyzing your information gathering results.

RETRIEVAL GOAL: ${plan.goal}

RETRIEVAL RESULTS:
${resultsText}

As a retrieval specialist, analyze:
1. Was relevant information successfully retrieved?
2. What is the comprehensive answer based on retrieved data?
3. How can retrieval strategies be improved?

Respond with JSON in this exact format:
{
  "success": true/false,
  "finalResult": "Comprehensive answer based on retrieved information", 
  "adjustments": ["retrieval improvement1", "retrieval improvement2"]
}

Provide substantive findings based on retrieved data, not retrieval descriptions.`;
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
      console.error('[HybridRetrievalAgent] Plan parsing failed:', error);
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
        finalResult: reflection.finalResult || 'Information retrieved',
        adjustments: reflection.adjustments || [],
      };
    } catch (error) {
      console.error('[HybridRetrievalAgent] Reflection parsing failed:', error);

      const hasSuccessfulSteps = results.some((r) => r.success);
      return {
        success: hasSuccessfulSteps,
        finalResult: hasSuccessfulSteps ? 'Information successfully retrieved' : 'Retrieval failed',
        adjustments: ['Improve search queries', 'Better information synthesis'],
      };
    }
  }

  private createFallbackPlan(job: JobData): AgentPlan {
    switch (job.category) {
      case 'web_research': {
        const { url, question } = job.payload as any;
        if (this.tools.includes('retrieval')) {
          return {
            goal: `Retrieve information about: ${question}`,
            steps: [
              {
                tool: 'retrieval',
                params: { query: question, useKnowledgeServer: true },
                reasoning: 'Search knowledge base for relevant information',
              },
              {
                tool: 'browser',
                params: {
                  url: url,
                  steps: [
                    { type: 'wait', ms: 1000 },
                    { type: 'extract', selector: 'body' },
                  ],
                },
                reasoning: 'Verify and supplement with web content',
              },
            ],
          };
        } else {
          return {
            goal: `Research: ${question}`,
            steps: [
              {
                tool: 'browser',
                params: {
                  url: url,
                  steps: [
                    { type: 'wait', ms: 1000 },
                    { type: 'extract', selector: 'body' },
                  ],
                },
                reasoning: 'Extract information from web content',
              },
            ],
          };
        }
      }

      case 'classify': {
        const { labels, answer } = job.payload as any;
        return {
          goal: 'Retrieve classification guidance',
          steps: [
            {
              tool: 'stringKit',
              params: { text: answer, mode: 'classify', labels },
              reasoning: 'Use pattern matching for classification',
            },
          ],
        };
      }

      default:
        return {
          goal: `Retrieve information for ${job.category}`,
          steps: [],
        };
    }
  }
}
