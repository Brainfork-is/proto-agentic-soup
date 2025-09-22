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
      generic: `You are a task generator creating realistic work assignments that people might give to an AI assistant. Create diverse, professional tasks that vary in type and complexity.

Generate ONE of these four types of tasks randomly:

1. RESEARCH TASK - Professional research questions for business/technical domains:
   Examples: "What are the current best practices for implementing zero-trust security architecture?", "How can small businesses leverage AI for customer service automation?", "What are the key regulatory considerations for cloud data storage in healthcare?"

2. SUMMARIZATION TASK - Real content that needs condensing:
   Examples: Technical documentation, meeting notes, research findings, policy documents, product reviews, news articles

3. CLASSIFICATION TASK - Realistic content categorization:
   Examples: Customer feedback sentiment, document types, support ticket priorities, expense categories, content moderation

4. CALCULATION TASK - Business math problems:
   Examples: Budget calculations, ROI analysis, cost projections, percentage changes, financial metrics

Make tasks specific and professional - the kind of work people actually delegate to assistants. Avoid generic or academic examples.

Based on the task type you choose, respond with the appropriate JSON format:

FOR RESEARCH: {"url": "http://localhost:4200/", "question": "specific research question"}
FOR SUMMARIZATION: {"text": "realistic content to summarize (2-4 sentences)", "maxWords": number between 8-20}
FOR CLASSIFICATION: {"text": "content to classify", "labels": ["option1", "option2", "option3"], "answer": "correct_option"}
FOR CALCULATION: {"expr": "mathematical expression using +, -, *, /, parentheses only"}

Choose ONE type and generate realistic, professional content for it.`,
    };
  }

  async generateJob(): Promise<GeneratedJob> {
    // LLM generation only - no fallback, let LLM choose the category
    const llmJob = await this.generateLLMJob();
    if (!llmJob) {
      throw new Error(`Failed to generate job with LLM`);
    }

    return llmJob;
  }

  private async generateLLMJob(): Promise<GeneratedJob | null> {
    const prompt = `${this.templates.generic}

Make the content interesting and varied. Avoid repetition from previous generations.`;

    console.log(`[JobGenerator] Requesting realistic job from Vertex AI...`);

    // Use PatchedChatVertexAI directly (same config as LangGraphAgent)
    const llm = this.createVertexAILLM();
    const response = await llm.invoke(prompt);

    if (!response || !response.content) {
      console.error(`[JobGenerator] Vertex AI returned null response`);
      return null;
    }

    const content = response.content as string;
    console.log(`[JobGenerator] Vertex AI response:`, content.substring(0, 200) + '...');

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
          `[JobGenerator] No valid JSON found in Vertex AI response. Full response:`,
          content
        );
        throw new Error('No complete JSON found in response');
      }

      const jsonStr = content.substring(jsonStart, jsonEnd + 1);
      console.log(`[JobGenerator] Extracted JSON string:`, jsonStr);

      const payload = JSON.parse(jsonStr);
      console.log(`[JobGenerator] Parsed payload:`, JSON.stringify(payload));

      // Determine category from payload structure
      const category = this.detectCategory(payload);
      if (!category) {
        console.error(`[JobGenerator] Could not determine category from payload structure`);
        console.error(`[JobGenerator] Received payload:`, JSON.stringify(payload, null, 2));
        console.error(`[JobGenerator] Full Vertex AI response was:`, content);
        throw new Error('Could not determine task category from payload');
      }

      // Validate payload based on detected category
      if (!this.validatePayload(category, payload)) {
        console.error(`[JobGenerator] Validation failed for ${category}. Expected structure:`);
        this.logExpectedStructure(category);
        console.error(`[JobGenerator] Received payload:`, JSON.stringify(payload, null, 2));
        console.error(`[JobGenerator] Full Vertex AI response was:`, content);
        throw new Error('Invalid payload structure');
      }

      console.log(`[JobGenerator] Generated realistic ${category} job`);

      return {
        category: category as GeneratedJob['category'],
        payload,
        payout: 5 + Math.floor(Math.random() * 6), // 5-10 credits
        deadlineS: 60,
      };
    } catch (error) {
      console.error(`[JobGenerator] Failed to parse LLM response:`, error);
      console.error(`[JobGenerator] Error details:`, (error as Error).message);
      return null;
    }
  }

  private detectCategory(payload: any): string | null {
    // Detect category based on payload structure
    if (payload.url && payload.question) {
      return 'web_research';
    }
    if (payload.text && payload.maxWords !== undefined) {
      return 'summarize';
    }
    if (payload.text && payload.labels && payload.answer) {
      return 'classify';
    }
    if (payload.expr) {
      return 'math';
    }
    return null;
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
