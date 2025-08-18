/**
 * LangGraph Tools - Ultra-simplified approach
 * Creates basic tool objects to avoid all TypeScript complexity issues
 */

import { browserRun } from '../../browserTool';
import { createMCPClient } from '../../mcpClient';

// Create MCP client singleton if configured
const mcpClient = createMCPClient();

// Simple tool interface for our use
interface SimpleTool {
  name: string;
  description: string;
  invoke: (params: any) => Promise<string>;
}

// Calculator tool
export const calculatorTool: SimpleTool = {
  name: 'calculator',
  description: 'Evaluate mathematical expressions. Supports +, -, *, /, parentheses.',
  async invoke({ expression }: { expression: string }) {
    try {
      const result = eval(expression);
      return JSON.stringify({ success: true, value: result, expression });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid expression',
        expression,
      });
    }
  },
};

// Text processing tool
export const textProcessorTool: SimpleTool = {
  name: 'text_processor',
  description: 'Process text with summarization or classification operations',
  async invoke(params: {
    text: string;
    operation: 'summarize' | 'classify';
    maxWords?: number;
    labels?: string[];
  }) {
    const { text, operation, maxWords, labels } = params;

    if (operation === 'summarize') {
      const words = text.split(/\s+/);
      const truncated = words.slice(0, maxWords || 50).join(' ');
      return JSON.stringify({
        success: true,
        operation,
        originalText: text,
        result: truncated,
        wordCount: truncated.split(/\s+/).length,
      });
    } else if (operation === 'classify') {
      const selectedLabel = labels?.[0] || 'Unknown';
      return JSON.stringify({
        success: true,
        operation,
        text,
        labels,
        selectedLabel,
        confidence: 0.8,
      });
    }

    return JSON.stringify({ success: false, error: `Unknown operation: ${operation}` });
  },
};

// Browser tool
export const browserTool: SimpleTool = {
  name: 'browser',
  description: 'Navigate web pages and extract content using browser automation',
  async invoke(params: { url: string; steps: any[] }) {
    try {
      const result = await browserRun(params);
      return JSON.stringify({
        success: !result.error,
        url: params.url,
        steps: params.steps.length,
        stepsUsed: result.stepsUsed || 0,
        content: result.content || '',
        error: result.error,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        url: params.url,
        error: error instanceof Error ? error.message : 'Browser operation failed',
      });
    }
  },
};

// Knowledge retrieval tool
export const retrievalTool: SimpleTool = {
  name: 'knowledge_retrieval',
  description: 'Search knowledge base for relevant information',
  async invoke(params: { query: string; useKnowledgeServer?: boolean; maxResults?: number }) {
    const { query, useKnowledgeServer, maxResults } = params;

    // Try MCP knowledge server first if enabled
    if (useKnowledgeServer && mcpClient) {
      try {
        const response = await mcpClient.search({ query, maxResults: maxResults || 3 });
        if (response.results.length > 0) {
          return JSON.stringify({
            success: true,
            query,
            source: 'mcp',
            results: response.results.map((r: any) => ({
              title: r.title,
              content: r.content,
              score: r.score,
            })),
            totalCount: response.totalCount,
          });
        }
      } catch (error) {
        console.error('MCP knowledge server error:', error);
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
    return JSON.stringify({
      success: true,
      query,
      source: 'local',
      results: hit ? [{ content: hit, score: 0.8 }] : [],
      totalCount: hit ? 1 : 0,
    });
  },
};

// Export all tools as an array for easy use
export const allTools = [calculatorTool, textProcessorTool, browserTool, retrievalTool];

// Export tool mapping for dynamic access
export const toolMap: Record<string, SimpleTool> = {
  calculator: calculatorTool,
  text_processor: textProcessorTool,
  browser: browserTool,
  knowledge_retrieval: retrievalTool,
};
