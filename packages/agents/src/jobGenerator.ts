/**
 * Job Generator
 * Creates realistic professional work assignments for AI agents
 */

import { createLLMProvider, LLMProvider } from './llm';
import { log, logError } from '@soup/common';

export interface Job {
  prompt: string;
  payout: number;
  deadlineS: number;
}

interface JobBatch {
  jobs: Job[];
}

export class JobGenerator {
  private llm: LLMProvider;
  private jobQueue: Job[] = [];
  private batchSize = 10;

  constructor() {
    this.llm = createLLMProvider('job_generator');
  }

  async generateJob(): Promise<Job> {
    // Return job from queue if available, otherwise generate new batch
    if (this.jobQueue.length > 0) {
      return this.jobQueue.shift()!;
    }

    // Generate new batch of jobs
    await this.generateJobBatch();
    return this.jobQueue.shift()!;
  }

  private async generateJobBatch(): Promise<void> {
    const prompt = `Generate exactly 10 realistic work assignments that people would actually delegate to a professional AI assistant or agent. Return them in JSON format.

REALISM REQUIREMENTS:
Create tasks that mirror real professional work scenarios - the kind of assignments managers, executives, entrepreneurs, researchers, and consultants actually delegate to assistants. These should feel like genuine workplace requests.

SPECIFICITY REQUIREMENTS:
- Include actual company names, product names, and industry terminology
- Specify realistic budgets, team sizes, timelines, and metrics
- Reference real tools and platforms (Salesforce, HubSpot, AWS, Slack, etc.)
- Include concrete business scenarios and challenges
- Make all context feel authentic to actual business operations

FORBIDDEN GENERIC PATTERNS:
- Avoid academic or theoretical assignments
- No hypothetical or made-up scenarios
- Don't use placeholder names (Company X, Product Y)
- Avoid overly simplified tasks that don't reflect real work complexity
- Skip tasks that sound like textbook exercises

TASK COMPLETENESS:
- Every task should be fully self-contained with clear deliverables
- Include all necessary context and constraints within the prompt
- Specify the format and scope of expected outputs
- Make tasks achievable with available tools and research capabilities

CRITICAL: Respond with ONLY valid JSON in this exact format (ensure all strings are properly quoted):
{
  "jobs": [
    {"prompt": "task description here", "payout": 7, "deadlineS": 60},
    {"prompt": "another task description", "payout": 6, "deadlineS": 60}
  ]
}
Generate exactly 10 jobs in the array.

Payouts should be an number between 1-10 and be based on the percived complexity of the tassk. 

IMPORTANT: 
- Do NOT wrap in markdown code blocks (no backticks)
- Do NOT include any text before or after the JSON
- Return only the raw JSON object
- Start with { and end with }`;

    try {
      log('[JobGenerator] Requesting job batch from LLM...');

      const response = await this.llm.invoke(prompt);
      let jsonResponse = response.content as string;

      // Clean up LLM response - remove markdown code blocks
      jsonResponse = jsonResponse
        .replace(/```json\s*/, '')
        .replace(/```\s*$/, '')
        .trim();

      log('[JobGenerator] JSON response length:', jsonResponse.length, 'characters');

      // Parse JSON response
      const jobBatch: JobBatch = JSON.parse(jsonResponse);

      if (!jobBatch.jobs || !Array.isArray(jobBatch.jobs)) {
        throw new Error('Invalid JSON response format');
      }

      // Add jobs to queue
      this.jobQueue.push(...jobBatch.jobs);

      log(`[JobGenerator] Generated ${jobBatch.jobs.length} jobs in batch`);
    } catch (error) {
      logError('[JobGenerator] Failed to generate job batch:', error);
      throw error;
    }
  }
}

// Singleton instance
export const jobGenerator = new JobGenerator();
