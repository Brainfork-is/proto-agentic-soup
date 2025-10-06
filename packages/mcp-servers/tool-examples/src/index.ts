#!/usr/bin/env node
/**
 * Tool Examples MCP Server
 * Provides access to successful tool implementations for learning and code generation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ToolManifest {
  toolName: string;
  filePath: string;
  usageCount: number;
  successCount: number;
  failureCount: number;
  originalRequest: {
    taskDescription: string;
    expectedInputs: Record<string, string>;
    expectedOutput: string;
  };
  createdAt: string;
  createdBy: string;
}

interface ToolExample {
  toolName: string;
  taskDescription: string;
  successRate: string;
  usageCount: number;
  code: string;
}

class ToolExampleServer {
  private server: Server;
  private manifestsDir: string;

  constructor() {
    this.server = new Server(
      {
        name: 'tool-examples',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Point to generated-tools directory (adjust path based on deployment)
    // From packages/mcp-servers/tool-examples/dist -> packages/agents/src/generated-tools
    this.manifestsDir = path.resolve(__dirname, '../../../agents/src/generated-tools/manifests');

    console.error(`[ToolExampleServer] Manifests directory: ${this.manifestsDir}`);

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'search_successful_tools',
          description:
            'Search for successful tool implementations by keyword or pattern. Returns working code examples with high success rates.',
          inputSchema: {
            type: 'object',
            properties: {
              keywords: {
                type: 'array',
                items: { type: 'string' },
                description: 'Keywords to search for (e.g., ["webResearch", "axios", "email"])',
              },
              minSuccessRate: {
                type: 'number',
                description: 'Minimum success rate (0-1). Default: 0.7',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of examples to return. Default: 3',
              },
            },
            required: ['keywords'],
          },
        },
        {
          name: 'get_tool_by_pattern',
          description:
            'Find tools that use specific code patterns (e.g., tools that properly use webResearch inside invoke)',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description:
                  'Pattern to search for: "webResearch", "validator", "axios", "cheerio", etc.',
              },
              minSuccessRate: {
                type: 'number',
                description: 'Minimum success rate. Default: 0.8',
              },
              limit: {
                type: 'number',
                description: 'Max examples. Default: 2',
              },
            },
            required: ['pattern'],
          },
        },
        {
          name: 'get_similar_tools',
          description:
            'Find tools with similar task descriptions to learn from successful implementations',
          inputSchema: {
            type: 'object',
            properties: {
              taskDescription: {
                type: 'string',
                description: 'Description of the task you want to implement',
              },
              limit: {
                type: 'number',
                description: 'Max examples. Default: 2',
              },
            },
            required: ['taskDescription'],
          },
        },
      ];

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'search_successful_tools':
          return await this.searchSuccessfulTools(request.params.arguments);
        case 'get_tool_by_pattern':
          return await this.getToolByPattern(request.params.arguments);
        case 'get_similar_tools':
          return await this.getSimilarTools(request.params.arguments);
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private async loadManifests(): Promise<ToolManifest[]> {
    try {
      const files = await fs.readdir(this.manifestsDir);
      const manifests: ToolManifest[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const manifest = await fs.readJson(path.join(this.manifestsDir, file));
            manifests.push(manifest);
          } catch (error) {
            console.error(`[ToolExampleServer] Failed to load manifest ${file}:`, error);
          }
        }
      }

      console.error(`[ToolExampleServer] Loaded ${manifests.length} manifests`);
      return manifests;
    } catch (error) {
      console.error(`[ToolExampleServer] Failed to read manifests directory:`, error);
      return [];
    }
  }

  private async searchSuccessfulTools(args: any) {
    const { keywords, minSuccessRate = 0.7, limit = 3 } = args;
    const manifests = await this.loadManifests();

    console.error(`[ToolExampleServer] Searching for tools with keywords: ${keywords.join(', ')}`);

    // Filter by success rate
    const successful = manifests
      .filter((m) => {
        if (m.usageCount === 0) return false;
        const rate = m.successCount / m.usageCount;
        return rate >= minSuccessRate;
      })
      .sort((a, b) => {
        const rateA = a.successCount / a.usageCount;
        const rateB = b.successCount / b.usageCount;
        return rateB - rateA;
      });

    console.error(
      `[ToolExampleServer] Found ${successful.length} tools with >${minSuccessRate * 100}% success rate`
    );

    // Search by keywords
    const matching: Array<{ manifest: ToolManifest; code: string; score: number }> = [];

    for (const manifest of successful) {
      try {
        const code = await fs.readFile(manifest.filePath, 'utf-8');

        // Score based on keyword matches
        let score = 0;
        for (const keyword of keywords) {
          const regex = new RegExp(keyword, 'gi');
          const matches = (code.match(regex) || []).length;
          score += matches;

          // Bonus for task description match
          if (
            manifest.originalRequest.taskDescription.toLowerCase().includes(keyword.toLowerCase())
          ) {
            score += 5;
          }
        }

        if (score > 0) {
          matching.push({ manifest, code, score });
        }
      } catch (error) {
        // Skip tools with missing files
        console.error(`[ToolExampleServer] Failed to read tool file: ${manifest.filePath}`);
        continue;
      }
    }

    console.error(`[ToolExampleServer] Found ${matching.length} matching tools`);

    // Sort by score and take top results
    const topMatches = matching.sort((a, b) => b.score - a.score).slice(0, limit);

    // Format results
    const results: ToolExample[] = topMatches.map(({ manifest, code }) => ({
      toolName: manifest.toolName,
      taskDescription: manifest.originalRequest.taskDescription,
      successRate: (manifest.successCount / manifest.usageCount).toFixed(2),
      usageCount: manifest.usageCount,
      code: code,
    }));

    console.error(`[ToolExampleServer] Returning ${results.length} examples`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              found: results.length,
              examples: results,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async getToolByPattern(args: any) {
    const { pattern, minSuccessRate = 0.8, limit = 2 } = args;

    console.error(`[ToolExampleServer] Getting tools by pattern: ${pattern}`);

    // Use search with pattern-specific keywords
    let keywords: string[];
    switch (pattern.toLowerCase()) {
      case 'webresearch':
        keywords = ['webResearch', 'await webResearch', 'async invoke'];
        break;
      case 'validator':
        keywords = ['validator', 'isEmpty', 'isEmail', 'typeof'];
        break;
      case 'axios':
        keywords = ['axios', 'axios.get', 'axios.post'];
        break;
      case 'cheerio':
        keywords = ['cheerio', 'parseHTML', '$'];
        break;
      default:
        keywords = [pattern];
    }

    return await this.searchSuccessfulTools({ keywords, minSuccessRate, limit });
  }

  private async getSimilarTools(args: any) {
    const { taskDescription, limit = 2 } = args;

    console.error(`[ToolExampleServer] Finding similar tools for: ${taskDescription}`);

    // Extract keywords from task description
    const words = taskDescription.toLowerCase().split(/\s+/);
    const keywords = words.filter((w: string) => w.length > 4); // Skip short words

    return await this.searchSuccessfulTools({
      keywords: keywords.slice(0, 5), // Top 5 keywords
      minSuccessRate: 0.6,
      limit,
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Tool Examples MCP server running on stdio');
  }
}

const server = new ToolExampleServer();
server.run().catch(console.error);
