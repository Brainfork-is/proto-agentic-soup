/**
 * MCP (Model Context Protocol) Knowledge Server Client
 *
 * This client provides agents with access to an external knowledge base
 * via the MCP protocol for enhanced retrieval and reasoning capabilities.
 */

export interface MCPConfig {
  serverUrl: string;
  bearerToken: string;
}

export interface MCPSearchRequest {
  query: string;
  maxResults?: number;
  filters?: Record<string, any>;
}

export interface MCPSearchResult {
  id: string;
  title: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface MCPSearchResponse {
  results: MCPSearchResult[];
  totalCount: number;
  queryTime: number;
}

export class MCPKnowledgeClient {
  private config: MCPConfig;

  constructor(config: MCPConfig) {
    this.config = config;
  }

  /**
   * Search the knowledge base using the MCP server
   */
  async search(request: MCPSearchRequest): Promise<MCPSearchResponse> {
    const url = `${this.config.serverUrl}/search`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.bearerToken}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`MCP search failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Retrieve a specific document by ID
   */
  async getDocument(documentId: string): Promise<MCPSearchResult> {
    const url = `${this.config.serverUrl}/documents/${documentId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.bearerToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`MCP document retrieval failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Submit a new document to the knowledge base
   */
  async addDocument(document: Omit<MCPSearchResult, 'id' | 'score'>): Promise<{ id: string }> {
    const url = `${this.config.serverUrl}/documents`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.bearerToken}`,
      },
      body: JSON.stringify(document),
    });

    if (!response.ok) {
      throw new Error(`MCP document addition failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get similar documents using vector similarity
   */
  async getSimilar(documentId: string, limit: number = 5): Promise<MCPSearchResponse> {
    const url = `${this.config.serverUrl}/similar/${documentId}?limit=${limit}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.config.bearerToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`MCP similarity search failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Health check for the MCP server
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.config.serverUrl}/health`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.bearerToken}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create MCP client from environment variables
 */
export function createMCPClient(): MCPKnowledgeClient | null {
  const serverUrl = process.env.MCP_KNOWLEDGE_SERVER;
  const bearerToken = process.env.MCP_BEARER_TOKEN;

  if (!serverUrl || !bearerToken) {
    return null;
  }

  return new MCPKnowledgeClient({
    serverUrl,
    bearerToken,
  });
}
