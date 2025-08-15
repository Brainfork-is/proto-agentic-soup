/**
 * LLM-powered job generator for creating diverse, dynamic tasks
 */

import { llmProvider } from './llmProvider';

export interface GeneratedJob {
  category: 'web_research' | 'summarize' | 'classify' | 'math';
  payload: any;
  payout: number;
  deadlineS: number;
}

export class JobGenerator {
  private agentId: string = 'job-generator';
  private templates: Record<string, string>;

  constructor() {
    this.templates = {
      web_research: `Generate a web research question about the knowledge base content. 
The knowledge base contains pages about vector databases, RAG (Retrieval Augmented Generation), and cooperation policies.

Available pages:
- /docs/vector-db.html (about PGVector, Milvus, FAISS)
- /guides/rag.html (about RAG systems)
- /policies/coop.html (about agent cooperation)
- /search.html (search page)

Create a question that can be answered by browsing these pages. Questions should be varied and interesting.

Respond with JSON:
{
  "url": "http://localhost:3200/docs/vector-db.html",
  "question": "Your generated question here"
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

Create varied math problems with different operations and complexity levels. Use basic arithmetic (+, -, *, /, parentheses).

Respond with JSON:
{
  "expr": "mathematical expression"
}`,
    };
  }

  async generateJob(): Promise<GeneratedJob> {
    const categories = ['web_research', 'summarize', 'classify', 'math'] as const;
    const category = categories[Math.floor(Math.random() * categories.length)];

    // Try LLM generation first
    try {
      const llmJob = await this.generateLLMJob(category);
      if (llmJob) {
        return llmJob;
      }
    } catch (error) {
      console.log(`[JobGenerator] LLM generation failed for ${category}, falling back to static`);
    }

    // Fallback to static generation
    return this.generateStaticJob(category);
  }

  private async generateLLMJob(category: string): Promise<GeneratedJob | null> {
    const prompt = `${this.templates[category]}

Make the content interesting and varied. Avoid repetition from previous generations.`;

    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: 0.8, // Higher temperature for more variety
        maxTokens: 400,
      },
      this.agentId
    );

    if (!response) {
      return null;
    }

    try {
      // Extract JSON from response
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const payload = JSON.parse(jsonMatch[0]);

      // Validate payload based on category
      if (!this.validatePayload(category, payload)) {
        throw new Error('Invalid payload structure');
      }

      return {
        category: category as GeneratedJob['category'],
        payload,
        payout: 5 + Math.floor(Math.random() * 6), // 5-10 credits
        deadlineS: 60,
      };
    } catch (error) {
      console.log(`[JobGenerator] Failed to parse LLM response for ${category}:`, error);
      return null;
    }
  }

  private validatePayload(category: string, payload: any): boolean {
    switch (category) {
      case 'web_research':
        return (
          payload.url &&
          payload.question &&
          typeof payload.url === 'string' &&
          typeof payload.question === 'string'
        );

      case 'summarize':
        return (
          payload.text &&
          payload.maxWords &&
          typeof payload.text === 'string' &&
          typeof payload.maxWords === 'number' &&
          payload.maxWords > 0 &&
          payload.maxWords <= 30
        );

      case 'classify':
        return (
          payload.text &&
          payload.labels &&
          payload.answer &&
          typeof payload.text === 'string' &&
          Array.isArray(payload.labels) &&
          payload.labels.length > 1 &&
          payload.labels.includes(payload.answer)
        );

      case 'math':
        return (
          payload.expr &&
          typeof payload.expr === 'string' &&
          /^[0-9+\-*/().\s]+$/.test(payload.expr)
        );

      default:
        return false;
    }
  }

  private generateStaticJob(category: string): GeneratedJob {
    const staticJobs: Record<string, any> = {
      web_research: {
        url: 'http://localhost:3200/docs/vector-db.html',
        question: 'Name one advantage of PGVector.',
      },
      summarize: {
        text: 'RAG fetches documents to ground responses in facts.',
        maxWords: 12,
      },
      classify: {
        text: 'Milvus supports sharding and replication.',
        labels: ['DB', 'Not-DB', 'Unknown'],
        answer: 'DB',
      },
      math: {
        expr: '2 + 2 * 3',
      },
    };

    return {
      category: category as any,
      payload: staticJobs[category],
      payout: 5 + Math.floor(Math.random() * 6),
      deadlineS: 60,
    };
  }
}

// Singleton instance
export const jobGenerator = new JobGenerator();
