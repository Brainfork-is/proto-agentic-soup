/**
 * Simplified Job Generator
 * Creates random job prompts without categorization
 */

import { ChatVertexAI } from '@langchain/google-vertexai';

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
      maxOutputTokens: 200,
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
    const prompt = `Generate exactly 10 diverse, actionable tasks that AI agents can complete immediately. Return them in JSON format.

VARIETY REQUIREMENTS:
- Mix different industries: technology, healthcare, education, finance, retail, entertainment, travel, food, etc.
- Mix task types: research, writing, analysis, planning, creative, problem-solving, etc.
- Vary complexity and length requirements
- Include both business and personal use cases
- Ensure each task is completely different from the others

TASK EXAMPLES (create 10 tasks with similar variety):
"Create a 5-step employee onboarding checklist for a remote software company"
"Write 3 different taglines for a sustainable furniture brand"  
"Compare the pros and cons of electric vs hybrid vehicles for city driving"
"Explain cryptocurrency basics for teenagers in simple terms"
"Plan a 3-day weekend itinerary for first-time visitors to Tokyo"
"Write installation instructions for setting up a home WiFi router"
"Create a monthly budget template for college students"
"List 8 time management techniques for busy entrepreneurs"
"Design a morning routine for better productivity"
"Explain the benefits of meditation for stress relief"

REQUIREMENTS FOR EACH TASK:
- Completely self-contained (no placeholders or external references)
- Specific deliverable requested
- Achievable by AI with current tools
- Clear scope and requirements

CRITICAL: Respond with ONLY valid JSON in this exact format:
{
  "jobs": [
    {"prompt": "task description here", "payout": 7, "deadlineS": 60},
    {"prompt": "another task description", "payout": 6, "deadlineS": 60},
    ...exactly 10 jobs total
  ]
}

Payouts should be random between 5-10. Do not include any text before or after the JSON.`;

    try {
      console.log('[SimpleJobGenerator] Requesting job batch from LLM...');

      const response = await this.llm.invoke(prompt);
      const jsonResponse = response.content as string;

      // Parse JSON response
      const jobBatch: JobBatch = JSON.parse(jsonResponse);

      if (!jobBatch.jobs || !Array.isArray(jobBatch.jobs)) {
        throw new Error('Invalid JSON response format');
      }

      // Add jobs to queue
      this.jobQueue.push(...jobBatch.jobs);

      console.log(`[SimpleJobGenerator] Generated ${jobBatch.jobs.length} jobs in batch`);
    } catch (error) {
      console.error('[SimpleJobGenerator] Failed to generate job batch:', error);

      // Generate diverse fallback jobs if generation fails
      const fallbackJobs = [
        'Create a 7-day meal prep plan for someone trying to eat healthier',
        'Write a brief guide on how to start a small garden indoors',
        'Compare the features of iPhone vs Samsung Galaxy for photography',
        'Explain the basics of investing in index funds for beginners',
        'Create a 30-minute morning routine for productivity',
        'List 5 effective time management techniques for students',
        'Write a professional introduction email for a job networking event',
        'Outline the steps to learn a new programming language from scratch',
        'Create a checklist for planning a successful virtual meeting',
        'Explain how to improve credit score in 6 months',
        'Design a weekly exercise routine for busy professionals',
        'Write tips for reducing household energy consumption',
      ];

      // Add fallback jobs to queue
      const fallbackBatch: SimpleJob[] = fallbackJobs.map((prompt) => ({
        prompt,
        payout: 5 + Math.floor(Math.random() * 6), // 5-10 credits
        deadlineS: 60,
      }));

      this.jobQueue.push(...fallbackBatch);
    }
  }
}

// Singleton instance
export const simpleJobGenerator = new SimpleJobGenerator();
