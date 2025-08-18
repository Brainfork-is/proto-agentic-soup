import { browserRun } from './browserTool';
import { createMCPClient } from './mcpClient';

// Create MCP client singleton if configured
const mcpClient = createMCPClient();

// LangChain tools disabled - using mock implementations

export const Tools = {
  async browser(i: { url: string; steps: any[] }) {
    return await browserRun(i);
  },

  async calc(i: { expr: string }) {
    try {
      // Simple math evaluation
      const result = eval(i.expr);
      return { ok: true, value: result };
    } catch (error) {
      return { ok: false, error: 'Invalid expression' };
    }
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
      // Mock implementation
      return {
        text: i.text
          .split(/\s+/)
          .slice(0, i.maxWords || 12)
          .join(' '),
      };
    }
    if (i.mode === 'classify') {
      // Mock implementation
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
    // Mock implementation
    return {
      label: i.labels[0] || 'Unknown',
      method: 'mock' as const,
    };
  },
};
