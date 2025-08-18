/**
 * LangGraph Tools - Proper tool calling implementation
 * Uses LangChain's tool system with structured schemas
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { browserRun } from '../../browserTool';
import { createMCPClient } from '../../mcpClient';

// Create MCP client singleton if configured
const mcpClient = createMCPClient();

// Calculator tool
export const calculatorTool = tool(
  async ({ expression }: { expression: string }) => {
    try {
      // Simple math evaluation (safe for basic expressions)
      const result = eval(expression);
      return {
        success: true,
        value: result,
        expression,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid expression',
        expression,
      };
    }
  },
  {
    name: 'calculator',
    description: 'Evaluate mathematical expressions. Supports +, -, *, /, parentheses.',
    schema: z.object({
      expression: z.string().describe('The mathematical expression to evaluate'),
    }),
  }
);

// Text processing tool
export const textProcessorTool = tool(
  async ({
    text,
    operation,
    maxWords,
    labels,
  }: {
    text: string;
    operation: 'summarize' | 'classify';
    maxWords?: number;
    labels?: string[];
  }) => {
    if (operation === 'summarize') {
      // Simple summarization by truncating to word limit
      const words = text.split(/\s+/);
      const truncated = words.slice(0, maxWords || 50).join(' ');
      return {
        success: true,
        operation,
        originalText: text,
        result: truncated,
        wordCount: truncated.split(/\s+/).length,
      };
    } else if (operation === 'classify') {
      // Simple classification - return first label for now
      // In a real implementation, this would use ML
      const selectedLabel = labels?.[0] || 'Unknown';
      return {
        success: true,
        operation,
        text,
        labels,
        selectedLabel,
        confidence: 0.8, // Mock confidence
      };
    }

    return {
      success: false,
      error: `Unknown operation: ${operation}`,
    };
  },
  {
    name: 'text_processor',
    description: 'Process text with summarization or classification operations',
    schema: z.object({
      text: z.string().describe('The text to process'),
      operation: z.enum(['summarize', 'classify']).describe('The operation to perform'),
      maxWords: z.number().optional().describe('Maximum words for summarization'),
      labels: z.array(z.string()).optional().describe('Classification labels'),
    }),
  }
);

// Browser tool
export const browserTool = tool(
  async ({ url, steps }: { url: string; steps: any[] }) => {
    try {
      const result = await browserRun({ url, steps });
      return {
        success: !result.error,
        url,
        steps: steps.length,
        stepsUsed: result.stepsUsed || 0,
        content: result.content || '',
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        url,
        error: error instanceof Error ? error.message : 'Browser operation failed',
      };
    }
  },
  {
    name: 'browser',
    description: 'Navigate web pages and extract content using browser automation',
    schema: z.object({
      url: z.string().describe('The URL to navigate to'),
      steps: z.array(z.any()).describe('Browser automation steps to execute'),
    }),
  }
);

// Knowledge retrieval tool
export const retrievalTool = tool(
  async ({
    query,
    useKnowledgeServer,
    maxResults,
  }: {
    query: string;
    useKnowledgeServer?: boolean;
    maxResults?: number;
  }) => {
    // Try MCP knowledge server first if enabled
    if (useKnowledgeServer && mcpClient) {
      try {
        const response = await mcpClient.search({
          query,
          maxResults: maxResults || 3,
        });

        if (response.results.length > 0) {
          return {
            success: true,
            query,
            source: 'mcp',
            results: response.results.map((r) => ({
              title: r.title,
              content: r.content,
              score: r.score,
            })),
            totalCount: response.totalCount,
          };
        }
      } catch (error) {
        console.error('MCP knowledge server error:', error);
        // Fall through to local KB
      }
    }

    // Fallback to local knowledge base
    const kb = [
      'FAISS is a library good for in-memory/offline vector search.',
      'Milvus is a scalable service supporting sharding and replication.',
      'PGVector is a Postgres extension great for simplicity and joins.',
      'ChromaDB is an open-source embedding database for LLM applications.',
      'Pinecone is a managed vector database service for AI applications.',
    ];

    const hit = kb.find((s) => s.toLowerCase().includes(query.toLowerCase()));

    return {
      success: true,
      query,
      source: 'local',
      results: hit ? [{ content: hit, score: 0.8 }] : [],
      totalCount: hit ? 1 : 0,
    };
  },
  {
    name: 'knowledge_retrieval',
    description: 'Search knowledge base for relevant information',
    schema: z.object({
      query: z.string().describe('The search query'),
      useKnowledgeServer: z.boolean().optional().describe('Whether to use remote knowledge server'),
      maxResults: z.number().optional().describe('Maximum number of results to return'),
    }),
  }
);

// Export all tools as an array for easy use
export const allTools = [calculatorTool, textProcessorTool, browserTool, retrievalTool];

// Export tool mapping for dynamic access
export const toolMap = {
  calculator: calculatorTool,
  text_processor: textProcessorTool,
  browser: browserTool,
  knowledge_retrieval: retrievalTool,
} as const;
