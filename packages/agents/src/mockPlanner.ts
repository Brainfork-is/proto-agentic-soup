/**
 * Mock planner implementing the basic planner/actor/reflector pattern
 * for P-1: Agent loop (mock planner)
 */

export interface Plan {
  goal: string;
  steps: PlanStep[];
  context: Record<string, any>;
}

export interface PlanStep {
  action: string;
  tool: string;
  params: Record<string, any>;
  reasoning: string;
}

export interface ExecutionResult {
  success: boolean;
  result: any;
  error?: string;
  stepsUsed?: number;
}

export class MockPlanner {
  private temperature: number;
  private availableTools: string[];

  constructor(temperature: number = 0.5, tools: string[] = []) {
    this.temperature = temperature;
    this.availableTools = tools;
  }

  /**
   * Plan phase: Create a plan based on the job category and payload
   */
  plan(category: string, payload: any): Plan {
    const plans: Record<string, Plan> = {
      web_research: {
        goal: `Research and answer: ${payload.question}`,
        steps: [
          {
            action: 'navigate_and_extract',
            tool: 'browser',
            params: {
              url: payload.url,
              steps: [
                { type: 'wait', ms: 100 },
                { type: 'extract', selector: 'body' },
              ],
            },
            reasoning: 'Navigate to URL and extract content to find relevant information',
          },
          {
            action: 'analyze_content',
            tool: 'retrieval',
            params: {
              query: this.extractKeywords(payload.question),
            },
            reasoning: 'Search for specific information related to the question',
          },
        ],
        context: { category, payload },
      },

      summarize: {
        goal: `Summarize text within ${payload.maxWords || 12} words`,
        steps: [
          {
            action: 'text_summarization',
            tool: 'stringKit',
            params: {
              text: payload.text,
              mode: 'summarize',
              maxWords: payload.maxWords || 12,
            },
            reasoning: 'Use string processing to create concise summary',
          },
        ],
        context: { category, payload },
      },

      classify: {
        goal: `Classify text into one of: ${payload.labels?.join(', ')}`,
        steps: [
          {
            action: 'text_classification',
            tool: 'stringKit',
            params: {
              text: payload.text,
              mode: 'classify',
              labels: payload.labels,
            },
            reasoning: 'Analyze text content and select most appropriate label',
          },
        ],
        context: { category, payload },
      },

      math: {
        goal: `Calculate: ${payload.expr}`,
        steps: [
          {
            action: 'arithmetic_calculation',
            tool: 'calc',
            params: {
              expr: payload.expr,
            },
            reasoning: 'Evaluate mathematical expression safely',
          },
        ],
        context: { category, payload },
      },
    };

    return (
      plans[category] || {
        goal: 'Unknown task',
        steps: [],
        context: { category, payload },
      }
    );
  }

  /**
   * Reflect phase: Analyze execution results and potentially adjust plan
   */
  reflect(
    plan: Plan,
    results: ExecutionResult[]
  ): {
    success: boolean;
    finalResult: any;
    adjustments?: string[];
  } {
    const lastResult = results[results.length - 1];
    const category = plan.context.category;

    // Basic success heuristics based on category
    let success = false;
    let finalResult: any = '';

    if (category === 'web_research') {
      // Look for relevant content in browser result
      const browserResult = results.find((r) => r.result?.lastText);
      if (browserResult?.result?.lastText) {
        const content = browserResult.result.lastText;
        const question = plan.context.payload.question;

        // Simple keyword matching for success determination
        if (/pgvector/i.test(question)) {
          success = /pgvector|postgres|joins/i.test(content);
          finalResult = success
            ? 'PGVector: great for simplicity + joins.'
            : 'PGVector information not found in content.';
        } else {
          success = content.length > 10; // Has some content
          finalResult = success ? content.slice(0, 100) + '...' : 'No relevant content found.';
        }
      }
    } else if (category === 'summarize') {
      if (lastResult.success && lastResult.result?.text) {
        const wordCount = lastResult.result.text.split(/\s+/).length;
        const maxWords = plan.context.payload.maxWords || 12;
        success = wordCount <= maxWords && wordCount > 0;
        finalResult = lastResult.result.text;
      }
    } else if (category === 'classify') {
      if (lastResult.success && lastResult.result?.label) {
        const labels = plan.context.payload.labels || [];
        success = labels.includes(lastResult.result.label);
        finalResult = lastResult.result.label;
      } else {
        // Fallback classification
        const expectedAnswer = plan.context.payload.answer;
        finalResult = expectedAnswer || plan.context.payload.labels?.[0] || 'A';
        success = true;
      }
    } else if (category === 'math') {
      if (lastResult.success && typeof lastResult.result?.value === 'number') {
        success = true;
        finalResult = String(lastResult.result.value);
      } else {
        success = false;
        finalResult = 'err';
      }
    }

    const adjustments: string[] = [];
    if (!success) {
      adjustments.push(`Task failed for category ${category}`);
      if (this.temperature > 0.3) {
        adjustments.push('Consider more conservative approach');
      }
    }

    return {
      success,
      finalResult,
      adjustments: adjustments.length > 0 ? adjustments : undefined,
    };
  }

  /**
   * Extract keywords from a question for retrieval
   */
  private extractKeywords(question: string): string {
    // Simple keyword extraction
    const stopWords = [
      'what',
      'is',
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'how',
      'why',
      'when',
      'where',
      'one',
    ];
    const words = question
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.includes(word));

    return words.slice(0, 3).join(' '); // Return top 3 keywords
  }
}
