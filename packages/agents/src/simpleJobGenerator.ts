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
    const prompt = `Please respond with a complete, actionable job that an AI agent can perform immediately. The job should be specific and contain all necessary information - no placeholders, no "[insert X here]", no references to external documents or transcripts.

Examples of GOOD jobs:
- "Write a 300-word blog post about the benefits of remote work for small businesses"
- "Create a social media marketing plan for a coffee shop, including 5 post ideas and posting schedule"
- "Research and compare the features of Tesla Model 3 vs Toyota Prius"
- "Draft a professional email to customers announcing a 20% off sale this weekend"

Examples of BAD jobs (avoid these):
- "Summarize this research paper [insert link]"
- "Analyze the transcript [insert transcript here]" 
- "Review the document attached"

Requirements:
- Job must be completely self-contained
- No external references or placeholders
- Specific and actionable
- Suitable for general public or business users
- Can be completed by an AI agent with available tools

IMPORTANT: Only respond with the complete job prompt itself, no additional text or explanation.`;

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

      // Fallback job if generation fails
      const fallbackJobs = [
        "What's the current weather in New York?",
        'Summarize the latest news about artificial intelligence',
        'Find the top 3 trending topics on social media today',
        'Explain the concept of quantum computing in simple terms',
        'What are the best practices for remote team management?',
        'Research the current stock price of Apple',
        'What are the main benefits of cloud computing?',
        'Find information about the latest SpaceX launch',
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
