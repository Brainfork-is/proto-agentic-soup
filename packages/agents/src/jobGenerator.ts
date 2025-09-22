/**
 * LLM-powered job generator for creating diverse, dynamic tasks
 * Uses Vertex AI exclusively via LangChain integration
 */

import { PatchedChatVertexAI } from './patchedVertexAI';

export interface GeneratedJob {
  category: 'web_research' | 'summarize' | 'classify' | 'math';
  payload: any;
  payout: number;
  deadlineS: number;
}

export class JobGenerator {
  private agentId: string = 'job-generator';
  private templates: Record<string, string>;

  private createVertexAILLM() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const model = process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';

    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
    }

    return new PatchedChatVertexAI({
      model,
      temperature: 0.8, // Higher temperature for variety
      maxOutputTokens: 400,
      authOptions: {
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? undefined
          : process.env.GOOGLE_CLOUD_CREDENTIALS
            ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
            : undefined,
      },
    });
  }

  constructor() {
    this.templates = {
      web_research: `Generate a professional research question that can be answered using web research and business knowledge.

Create realistic business questions that professionals would research in a corporate environment. Topics can include:
- Technology implementation and best practices (cloud migration, cybersecurity, DevOps)
- Market trends and competitive analysis (industry insights, emerging technologies)
- Operational efficiency and process improvement (automation, workflows, cost reduction)
- Regulatory compliance and risk management (GDPR, SOX, industry regulations)
- Team management and organizational development (remote work, performance metrics)
- Financial planning and cost optimization (budget allocation, ROI analysis)
- Customer acquisition and retention strategies (CRM, customer experience)
- Digital transformation initiatives (modernization, integration strategies)
- Product development and innovation (roadmaps, user research, market fit)
- Supply chain and logistics optimization
- Data analytics and business intelligence
- Change management and organizational culture

Questions should be specific, actionable, and relevant to corporate decision-making. The agent will use the available knowledge base pages and LLM capabilities to research and answer.

Respond with JSON:
{
  "url": "http://localhost:4200/",
  "question": "Your professional research question here"
}`,

      summarize: `Generate a text summarization task with realistic content.

Create diverse text snippets about technology, AI, databases, or related topics. Vary the word limits and complexity.

Respond with JSON:
{
  "text": "Text to summarize (2-4 sentences)",
  "maxWords": number between 8-20
}`,

      classify: `Generate a text classification task with realistic content and labels.

Create text snippets that need categorization. Use varied domains like technology, business, science, etc.

Respond with JSON:
{
  "text": "Text to classify",
  "labels": ["Label1", "Label2", "Label3"],
  "answer": "CorrectLabel"
}`,

      math: `Generate a mathematical expression for evaluation.

Create varied math problems with different operations and complexity levels. 
Use ONLY these operations: + (add), - (subtract), * (multiply), / (divide), parentheses for grouping.
DO NOT use exponentiation (^), modulo (%), or any other operations.
Numbers can be integers or decimals.

Respond with JSON:
{
  "expr": "mathematical expression"
}

Example: {"expr": "2 + 3 * (4 - 1) / 2"}`,
    };
  }

  async generateJob(): Promise<GeneratedJob> {
    const categories = ['web_research', 'summarize', 'classify', 'math'] as const;
    const category = categories[Math.floor(Math.random() * categories.length)];

    // LLM generation only - no fallback
    const llmJob = await this.generateLLMJob(category);
    if (!llmJob) {
      throw new Error(`Failed to generate ${category} job with LLM`);
    }

    return llmJob;
  }

  private async generateLLMJob(category: string): Promise<GeneratedJob | null> {
    const prompt = `${this.templates[category]}

Make the content interesting and varied. Avoid repetition from previous generations.`;

    console.log(`[JobGenerator] Requesting ${category} job from Vertex AI...`);

    // Use PatchedChatVertexAI directly (same config as LangGraphAgent)
    const llm = this.createVertexAILLM();
    const response = await llm.invoke(prompt);

    if (!response || !response.content) {
      console.error(`[JobGenerator] Vertex AI returned null response for ${category}`);
      return null;
    }

    const content = response.content as string;
    console.log(
      `[JobGenerator] Vertex AI response for ${category}:`,
      content.substring(0, 200) + '...'
    );

    try {
      // Extract JSON from response - find first complete JSON object
      let braceCount = 0;
      let jsonStart = -1;
      let jsonEnd = -1;

      for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '{') {
          if (jsonStart === -1) jsonStart = i;
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && jsonStart !== -1) {
            jsonEnd = i;
            break;
          }
        }
      }

      if (jsonStart === -1 || jsonEnd === -1) {
        console.error(
          `[JobGenerator] No valid JSON found in Vertex AI response for ${category}. Full response:`,
          content
        );
        throw new Error('No complete JSON found in response');
      }

      const jsonStr = content.substring(jsonStart, jsonEnd + 1);
      console.log(`[JobGenerator] Extracted JSON string for ${category}:`, jsonStr);

      const payload = JSON.parse(jsonStr);
      console.log(`[JobGenerator] Parsed ${category} payload:`, JSON.stringify(payload));

      // Validate payload based on category
      if (!this.validatePayload(category, payload)) {
        console.error(`[JobGenerator] Validation failed for ${category}. Expected structure:`);
        this.logExpectedStructure(category);
        console.error(`[JobGenerator] Received payload:`, JSON.stringify(payload, null, 2));
        console.error(`[JobGenerator] Full Vertex AI response was:`, content);
        throw new Error('Invalid payload structure');
      }

      return {
        category: category as GeneratedJob['category'],
        payload,
        payout: 5 + Math.floor(Math.random() * 6), // 5-10 credits
        deadlineS: 60,
      };
    } catch (error) {
      console.error(`[JobGenerator] Failed to parse LLM response for ${category}:`, error);
      console.error(`[JobGenerator] Error details:`, (error as Error).message);
      return null;
    }
  }

  private logExpectedStructure(category: string): void {
    const expectedStructures: Record<string, any> = {
      web_research: {
        url: 'string (must be http://localhost:4200/...)',
        question: 'string',
      },
      summarize: {
        text: 'string (2-4 sentences)',
        maxWords: 'number (8-20)',
      },
      classify: {
        text: 'string',
        labels: 'array of strings',
        answer: 'string (must be one of the labels)',
      },
      math: {
        expr: 'string (mathematical expression with +, -, *, /, parentheses)',
      },
    };

    console.error(
      `[JobGenerator] Expected structure for ${category}:`,
      JSON.stringify(expectedStructures[category], null, 2)
    );
  }

  private validatePayload(category: string, payload: any): boolean {
    switch (category) {
      case 'web_research': {
        return (
          payload.url &&
          payload.question &&
          typeof payload.url === 'string' &&
          typeof payload.question === 'string'
        );
      }

      case 'summarize': {
        return (
          payload.text &&
          payload.maxWords &&
          typeof payload.text === 'string' &&
          typeof payload.maxWords === 'number' &&
          payload.maxWords > 0 &&
          payload.maxWords <= 30
        );
      }

      case 'classify': {
        return (
          payload.text &&
          payload.labels &&
          payload.answer &&
          typeof payload.text === 'string' &&
          Array.isArray(payload.labels) &&
          payload.labels.length > 1 &&
          payload.labels.includes(payload.answer)
        );
      }

      case 'math': {
        // Allow numbers, basic operations, parentheses, spaces, and decimals only
        return (
          payload.expr &&
          typeof payload.expr === 'string' &&
          /^[0-9+\-*/().\s]+$/.test(payload.expr)
        );
      }

      default:
        return false;
    }
  }

  // No backup/static job generation - LLM only
}

// Singleton instance
export const jobGenerator = new JobGenerator();
