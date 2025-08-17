import { browserRun } from './browserTool';
import { createMCPClient } from './mcpClient';
import { SummarizationTool } from './tools/langchainSummarization';
import { ClassificationTool } from './tools/langchainClassification';
import { calculatorTool } from './tools/langchainCalc';

// Create MCP client singleton if configured
const mcpClient = createMCPClient();

// Check if LangChain tools should be enabled
const USE_LANGCHAIN = process.env.LANGCHAIN_ENABLED === 'true';
const USE_LANGCHAIN_SUMMARIZATION = process.env.LANGCHAIN_SUMMARIZATION !== 'false'; // Default to true if LangChain is enabled
const USE_LANGCHAIN_CLASSIFICATION = process.env.LANGCHAIN_CLASSIFICATION !== 'false'; // Default to true if LangChain is enabled

export const Tools = {
  async browser(i: { url: string; steps: any[] }) {
    return await browserRun(i);
  },

  async calc(i: { expr: string }) {
    // Use enhanced calculator tool with mathjs and LLM capabilities
    const result = await calculatorTool.run(i);
    return result;
  },

  async stringKit(
    i: {
      text: string;
      mode: 'summarize' | 'classify';
      labels?: string[];
      maxWords?: number;
    },
    agentId?: string
  ) {
    if (i.mode === 'summarize') {
      // Use LangChain summarization if enabled
      if (USE_LANGCHAIN && USE_LANGCHAIN_SUMMARIZATION) {
        const tool = new SummarizationTool(agentId || 'agent', true);
        const result = await tool.call({ text: i.text, maxWords: i.maxWords });
        return result;
      }

      // Mock implementation (original behavior) - only when LangChain is disabled
      return {
        text: i.text
          .split(/\s+/)
          .slice(0, i.maxWords || 12)
          .join(' '),
      };
    }
    if (i.mode === 'classify') {
      // Use LangChain classification if enabled
      if (USE_LANGCHAIN && USE_LANGCHAIN_CLASSIFICATION && i.labels) {
        const tool = new ClassificationTool(agentId || 'agent', true);
        const result = await tool.call({ text: i.text, labels: i.labels });
        return result;
      }

      // Mock implementation (original behavior) - only when LangChain is disabled
      return { label: (i.labels || ['A'])[0] };
    }
    return {};
  },

  async retrieval(i: { query: string; useKnowledgeServer?: boolean }) {
    // If MCP knowledge server is configured and requested, use it
    if (i.useKnowledgeServer && mcpClient) {
      try {
        const response = await mcpClient.search({
          query: i.query,
          maxResults: 3,
        });

        if (response.results.length > 0) {
          // Return the top result's content
          return {
            snippet: response.results[0].content,
            source: 'mcp',
            score: response.results[0].score,
          };
        }
      } catch (error) {
        console.error('MCP knowledge server error:', error);
        // Fall back to local KB on error
      }
    }

    // Fallback to local knowledge base
    const kb = [
      'FAISS is a library good for in-memory/offline.',
      'Milvus is a scalable service supporting sharding and replication.',
      'PGVector is a Postgres extension great for simplicity and joins.',
    ];
    const hit = kb.find((s) => s.toLowerCase().includes(i.query.toLowerCase()));
    return { snippet: hit || '', source: 'local' };
  },

  async knowledgeSearch(i: { query: string; maxResults?: number }) {
    // Direct MCP knowledge server search
    if (!mcpClient) {
      return {
        ok: false,
        error: 'MCP knowledge server not configured',
      };
    }

    try {
      const response = await mcpClient.search({
        query: i.query,
        maxResults: i.maxResults || 5,
      });

      return {
        ok: true,
        results: response.results.map((r) => ({
          title: r.title,
          content: r.content,
          score: r.score,
        })),
        totalCount: response.totalCount,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },

  // New dedicated classification tool
  async classify(
    i: { text: string; labels: string[]; withConfidence?: boolean },
    agentId?: string
  ) {
    if (USE_LANGCHAIN && USE_LANGCHAIN_CLASSIFICATION) {
      const tool = new ClassificationTool(agentId || 'agent', true);
      return await tool.classifyWithOptions({
        text: i.text,
        labels: i.labels,
        withConfidence: i.withConfidence,
      });
    }

    // Mock implementation - only when LangChain is disabled
    return {
      label: i.labels[0] || 'Unknown',
      method: 'mock' as const,
    };
  },
};
