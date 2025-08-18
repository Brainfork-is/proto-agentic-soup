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

export class SimpleJobGenerator {
  private llm: ChatVertexAI;

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
    const prompt = `Generate a diverse, actionable task that an AI agent can complete immediately. Create tasks across different domains and avoid repetition.

VARIETY REQUIREMENTS:
- Mix different industries: technology, healthcare, education, finance, retail, entertainment, travel, food, etc.
- Mix task types: research, writing, analysis, planning, creative, problem-solving, etc.
- Vary complexity and length requirements
- Include both business and personal use cases

EXAMPLES across different domains:
Business: "Create a 5-step employee onboarding checklist for a remote software company"
Creative: "Write 3 different taglines for a sustainable furniture brand"
Research: "Compare the pros and cons of electric vs hybrid vehicles for city driving"
Education: "Explain cryptocurrency basics for teenagers in simple terms"
Health: "List 10 desk exercises for office workers with time estimates"
Travel: "Plan a 3-day weekend itinerary for first-time visitors to Tokyo"
Technology: "Write installation instructions for setting up a home WiFi router"
Finance: "Create a monthly budget template for college students"

REQUIREMENTS:
- Completely self-contained (no placeholders or external references)
- Specific deliverable requested
- Achievable by AI with current tools
- Clear scope and requirements
- Avoid repeating similar topics or formats

IMPORTANT: Respond with only the task prompt - no explanations or additional text.`;

    try {
      console.log('[SimpleJobGenerator] Requesting job from LLM...');

      const response = await this.llm.invoke(prompt);
      const jobPrompt = response.content as string;

      console.log('[SimpleJobGenerator] Generated job:', jobPrompt.substring(0, 100) + '...');

      return {
        prompt: jobPrompt.trim(),
        payout: 5 + Math.floor(Math.random() * 6), // 5-10 credits
        deadlineS: 60,
      };
    } catch (error) {
      console.error('[SimpleJobGenerator] Failed to generate job:', error);

      // Diverse fallback jobs if generation fails
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

      return {
        prompt: fallbackJobs[Math.floor(Math.random() * fallbackJobs.length)],
        payout: 5,
        deadlineS: 60,
      };
    }
  }
}

// Singleton instance
export const simpleJobGenerator = new SimpleJobGenerator();
