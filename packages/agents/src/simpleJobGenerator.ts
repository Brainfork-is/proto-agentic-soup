/**
 * Simplified Job Generator
 * Creates random job prompts without categorization
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import { log, logError } from '@soup/common';

export interface SimpleJob {
  prompt: string;
  payout: number;
  deadlineS: number;
}

interface JobBatch {
  jobs: SimpleJob[];
}

export class SimpleJobGenerator {
  private llm: ChatVertexAI;
  private jobQueue: SimpleJob[] = [];
  private batchSize = 10;

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;

    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
    }

    this.llm = new ChatVertexAI({
      model: process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash',
      temperature: 0.9, // High temperature for variety
      maxOutputTokens: 2000, // Increased for JSON batch generation
      authOptions: {
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? undefined
          : process.env.GOOGLE_CLOUD_CREDENTIALS
            ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
            : undefined,
      },
    });
  }

  async generateJob(): Promise<SimpleJob> {
    // Return job from queue if available, otherwise generate new batch
    if (this.jobQueue.length > 0) {
      return this.jobQueue.shift()!;
    }

    // Generate new batch of jobs
    await this.generateJobBatch();
    return this.jobQueue.shift()!;
  }

  private async generateJobBatch(): Promise<void> {
    // 20% chance to encourage tool usage
    const shouldEncourageTools = Math.random() <= 0.2;
    const toolsInstruction = shouldEncourageTools
      ? `\n\nTOOL USAGE ENCOURAGEMENT: For approximately half of these tasks, add a request to ground the information with sources. Use phrases like:
- "Please cite specific sources or studies"
- "Include recent examples from web research" 
- "Reference current data or statistics"
- "Look up current information on this topic"
- "Provide sources to support your recommendations"
- "Research recent developments in [topic]"
This will encourage agents to use their web search, Wikipedia, and research tools instead of relying only on prior knowledge.`
      : '';

    const prompt = `Generate exactly 10 diverse, actionable tasks that AI agents can complete immediately. Return them in JSON format.${toolsInstruction}

VARIETY REQUIREMENTS:
- Mix different industries: technology, healthcare, education, finance, retail, entertainment, travel, food, manufacturing, real estate, sports, arts, etc.
- Mix task types: research, writing, analysis, planning, creative, problem-solving, comparison, explanation, instruction, design, etc.
- Vary complexity and length requirements (from simple lists to detailed guides)
- Include both business and personal use cases
- Generate completely unique tasks - NO repetition of previous patterns

TASK CATEGORIES TO EXPLORE (create diverse tasks across these domains):
- Business Strategy: planning, analysis, process improvement
- Content Creation: writing, design, marketing materials  
- Education: explanations, tutorials, learning guides
- Technology: comparisons, setup guides, troubleshooting
- Health & Wellness: routines, advice, explanations
- Finance: budgeting, analysis, recommendations
- Travel & Lifestyle: planning, recommendations, comparisons
- Creative Projects: brainstorming, design, ideation
- Problem Solving: troubleshooting, optimization, solutions
- Research & Analysis: investigation, comparison, evaluation

SPECIFICITY REQUIREMENTS:
- Use actual, real-world named entities and brands that exist
- Include concrete dates, timeframes, and specific numbers
- Reference specific products, services, or organizations by their actual names
- When asking for analysis, specify exact metrics and criteria to evaluate
- Make all references searchable and verifiable through web search

FORBIDDEN PATTERNS - Never use vague references:
- NO: "a popular..." / "a new..." / "a recent..." / "a leading..." / "a major..."
- NO: "a company" / "a product" / "a service" / "an organization" 
- NO: "recently" / "lately" / "in recent months" / "current"
- NO: "provided data" / "given dataset" / "attached information"
- INSTEAD: Use specific names, exact dates, and include all needed data inline

DATA COMPLETENESS RULES:
- Every task must be fully self-contained with ALL necessary information
- If the task involves analyzing data, generate and include the actual data points in the prompt
- Never reference external, attached, or provided materials that don't exist
- Include all numbers, statistics, or data points needed within the task description
- Format any data clearly within the prompt itself (e.g., "Analyze these Q3 2024 sales figures: Product A: $45K, Product B: $72K...")

REQUIREMENTS FOR EACH TASK:
- Completely self-contained (no placeholders or external references)
- Specific deliverable requested
- Achievable by AI with current tools
- Clear scope and requirements
- Use real entity names, not generic descriptions

CRITICAL: Respond with ONLY valid JSON in this exact format (ensure all strings are properly quoted):
{
  "jobs": [
    {"prompt": "task description here", "payout": 7, "deadlineS": 60},
    {"prompt": "another task description", "payout": 6, "deadlineS": 60}
  ]
}
Generate exactly 10 jobs in the array.

Payouts should be random between 5-10. 

IMPORTANT: 
- Do NOT wrap in markdown code blocks (no backticks)
- Do NOT include any text before or after the JSON
- Return only the raw JSON object
- Start with { and end with }`;

    try {
      log('[SimpleJobGenerator] Requesting job batch from LLM...');

      const response = await this.llm.invoke(prompt);
      let jsonResponse = response.content as string;

      // Clean up LLM response - remove markdown code blocks
      jsonResponse = jsonResponse
        .replace(/```json\s*/, '')
        .replace(/```\s*$/, '')
        .trim();

      log('[SimpleJobGenerator] JSON response length:', jsonResponse.length, 'characters');

      // Parse JSON response
      const jobBatch: JobBatch = JSON.parse(jsonResponse);

      if (!jobBatch.jobs || !Array.isArray(jobBatch.jobs)) {
        throw new Error('Invalid JSON response format');
      }

      // Add jobs to queue
      this.jobQueue.push(...jobBatch.jobs);

      log(`[SimpleJobGenerator] Generated ${jobBatch.jobs.length} jobs in batch`);
    } catch (error) {
      logError('[SimpleJobGenerator] Failed to generate job batch:', error);
      throw error;
    }
  }
}

// Singleton instance
export const simpleJobGenerator = new SimpleJobGenerator();
