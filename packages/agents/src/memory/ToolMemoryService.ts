/**
 * Tool Memory Service - Manages agent-specific tool libraries
 * Handles tool storage, retrieval, and similarity search
 */

import { log, logError } from '@soup/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import { pipeline } from '@xenova/transformers';

export interface ToolInfo {
  id: string;
  toolName: string;
  toolCode: string;
  description: string;
  category: string;
  successCount: number;
  failureCount: number;
  avgQuality: number;
  lastUsed: Date;
  createdAt: Date;
}

export interface ToolSearchOptions {
  category?: string;
  minSuccessCount?: number;
  minQuality?: number;
  limit?: number;
}

export class ToolMemoryService {
  private static instance: ToolMemoryService;
  private embeddingPipeline?: any;

  private constructor() {}

  static getInstance(): ToolMemoryService {
    if (!ToolMemoryService.instance) {
      ToolMemoryService.instance = new ToolMemoryService();
    }
    return ToolMemoryService.instance;
  }

  private async getEmbeddingPipeline() {
    if (!this.embeddingPipeline) {
      try {
        // Use a small, fast model for embeddings
        this.embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          revision: 'main',
        });
        log('[ToolMemory] Embedding pipeline initialized');
      } catch (error) {
        logError('[ToolMemory] Failed to initialize embedding pipeline:', error);
        // Continue without embeddings
      }
    }
    return this.embeddingPipeline;
  }

  private async generateEmbedding(text: string): Promise<string | null> {
    try {
      const pipeline = await this.getEmbeddingPipeline();
      if (!pipeline) return null;

      const output = await pipeline(text, { pooling: 'mean', normalize: true });
      return JSON.stringify(Array.from(output.data));
    } catch (error) {
      logError('[ToolMemory] Failed to generate embedding:', error);
      return null;
    }
  }

  /**
   * Save a tool to the agent's personal library
   */
  async saveTool(
    agentId: string,
    toolName: string,
    toolCode: string,
    description: string,
    category: string
  ): Promise<void> {
    try {
      // Generate embedding for similarity search
      const embeddingText = `${toolName} ${description} ${category}`;
      const embedding = await this.generateEmbedding(embeddingText);

      await prisma.agentTool.upsert({
        where: {
          agentId_toolName: {
            agentId,
            toolName,
          },
        },
        update: {
          toolCode,
          description,
          category,
          embedding,
        },
        create: {
          agentId,
          toolName,
          toolCode,
          description,
          category,
          embedding,
        },
      });

      log(`[ToolMemory] Saved tool "${toolName}" for agent ${agentId}`);
    } catch (error) {
      logError(`[ToolMemory] Failed to save tool "${toolName}":`, error);
      throw error;
    }
  }

  /**
   * Update tool performance metrics after use
   */
  async updateToolPerformance(
    agentId: string,
    toolName: string,
    succeeded: boolean,
    qualityScore?: number
  ): Promise<void> {
    try {
      const tool = await prisma.agentTool.findUnique({
        where: {
          agentId_toolName: {
            agentId,
            toolName,
          },
        },
      });

      if (!tool) {
        logError(`[ToolMemory] Tool "${toolName}" not found for agent ${agentId}`);
        return;
      }

      const newSuccessCount = succeeded ? tool.successCount + 1 : tool.successCount;
      const newFailureCount = succeeded ? tool.failureCount : tool.failureCount + 1;

      // Update average quality if quality score provided
      let newAvgQuality = tool.avgQuality;
      if (qualityScore !== undefined && succeeded) {
        const totalSuccess = newSuccessCount;
        const oldTotal = tool.avgQuality * tool.successCount;
        newAvgQuality = totalSuccess > 0 ? (oldTotal + qualityScore) / totalSuccess : qualityScore;
      }

      await prisma.agentTool.update({
        where: {
          agentId_toolName: {
            agentId,
            toolName,
          },
        },
        data: {
          successCount: newSuccessCount,
          failureCount: newFailureCount,
          avgQuality: newAvgQuality,
          lastUsed: new Date(),
        },
      });

      log(
        `[ToolMemory] Updated performance for tool "${toolName}": ${succeeded ? 'success' : 'failure'}`
      );
    } catch (error) {
      logError(`[ToolMemory] Failed to update tool performance:`, error);
    }
  }

  /**
   * Find tools by category and performance criteria
   */
  async findTools(agentId: string, options: ToolSearchOptions = {}): Promise<ToolInfo[]> {
    try {
      const { category, minSuccessCount = 0, minQuality = 0, limit = 10 } = options;

      const where: any = {
        agentId,
        successCount: { gte: minSuccessCount },
        avgQuality: { gte: minQuality },
      };

      if (category) {
        where.category = category;
      }

      const tools = await prisma.agentTool.findMany({
        where,
        orderBy: [{ avgQuality: 'desc' }, { successCount: 'desc' }, { lastUsed: 'desc' }],
        take: limit,
      });

      return tools.map((tool: any) => ({
        id: tool.id,
        toolName: tool.toolName,
        toolCode: tool.toolCode,
        description: tool.description,
        category: tool.category,
        successCount: tool.successCount,
        failureCount: tool.failureCount,
        avgQuality: tool.avgQuality,
        lastUsed: tool.lastUsed,
        createdAt: tool.createdAt,
      }));
    } catch (error) {
      logError(`[ToolMemory] Failed to find tools:`, error);
      return [];
    }
  }

  /**
   * Find similar tools based on description/name similarity
   */
  async findSimilarTools(agentId: string, query: string, limit = 5): Promise<ToolInfo[]> {
    try {
      // For now, use simple text matching
      // TODO: Implement proper vector similarity with SQLite-VSS
      const tools = await prisma.agentTool.findMany({
        where: {
          agentId,
          OR: [{ toolName: { contains: query } }, { description: { contains: query } }],
        },
        orderBy: [{ avgQuality: 'desc' }, { successCount: 'desc' }],
        take: limit,
      });

      return tools.map((tool: any) => ({
        id: tool.id,
        toolName: tool.toolName,
        toolCode: tool.toolCode,
        description: tool.description,
        category: tool.category,
        successCount: tool.successCount,
        failureCount: tool.failureCount,
        avgQuality: tool.avgQuality,
        lastUsed: tool.lastUsed,
        createdAt: tool.createdAt,
      }));
    } catch (error) {
      logError(`[ToolMemory] Failed to find similar tools:`, error);
      return [];
    }
  }

  /**
   * Get tool by name
   */
  async getTool(agentId: string, toolName: string): Promise<ToolInfo | null> {
    try {
      const tool = await prisma.agentTool.findUnique({
        where: {
          agentId_toolName: {
            agentId,
            toolName,
          },
        },
      });

      if (!tool) return null;

      return {
        id: tool.id,
        toolName: tool.toolName,
        toolCode: tool.toolCode,
        description: tool.description,
        category: tool.category,
        successCount: tool.successCount,
        failureCount: tool.failureCount,
        avgQuality: tool.avgQuality,
        lastUsed: tool.lastUsed,
        createdAt: tool.createdAt,
      };
    } catch (error) {
      logError(`[ToolMemory] Failed to get tool:`, error);
      return null;
    }
  }

  /**
   * Get agent's tool library summary
   */
  async getToolLibrarySummary(agentId: string): Promise<{
    totalTools: number;
    categoryCounts: Record<string, number>;
    topPerformingTools: ToolInfo[];
  }> {
    try {
      const tools = await prisma.agentTool.findMany({
        where: { agentId },
      });

      const categoryCounts: Record<string, number> = {};
      for (const tool of tools) {
        categoryCounts[tool.category] = (categoryCounts[tool.category] || 0) + 1;
      }

      const topPerformingTools = await this.findTools(agentId, { limit: 5 });

      return {
        totalTools: tools.length,
        categoryCounts,
        topPerformingTools,
      };
    } catch (error) {
      logError(`[ToolMemory] Failed to get tool library summary:`, error);
      return {
        totalTools: 0,
        categoryCounts: {},
        topPerformingTools: [],
      };
    }
  }
}
