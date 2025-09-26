/**
 * Agent Memory Service - Manages agent-specific experiences and learnings
 * Handles general memory storage, retrieval, and importance scoring
 */

import { log, logError } from '@soup/common';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import { pipeline } from '@xenova/transformers';

export interface MemoryInfo {
  id: string;
  memoryType: string;
  content: string;
  context: string;
  importance: number;
  accessCount: number;
  lastAccess: Date;
  createdAt: Date;
}

export interface MemorySearchOptions {
  memoryType?: string;
  minImportance?: number;
  maxAge?: number; // in days
  limit?: number;
}

export class AgentMemoryService {
  private static instance: AgentMemoryService;
  private embeddingPipeline?: any;

  private constructor() {}

  static getInstance(): AgentMemoryService {
    if (!AgentMemoryService.instance) {
      AgentMemoryService.instance = new AgentMemoryService();
    }
    return AgentMemoryService.instance;
  }

  private async getEmbeddingPipeline() {
    if (!this.embeddingPipeline) {
      try {
        // Use a small, fast model for embeddings
        this.embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          revision: 'main',
        });
        log('[AgentMemory] Embedding pipeline initialized');
      } catch (error) {
        logError('[AgentMemory] Failed to initialize embedding pipeline:', error);
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
      logError('[AgentMemory] Failed to generate embedding:', error);
      return null;
    }
  }

  /**
   * Store a memory for the agent
   */
  async storeMemory(
    agentId: string,
    memoryType: string,
    content: string,
    context: string,
    importance: number = 0.5
  ): Promise<void> {
    try {
      // Generate embedding for similarity search
      const embeddingText = `${memoryType} ${content} ${context}`;
      const embedding = await this.generateEmbedding(embeddingText);

      await prisma.agentMemory.create({
        data: {
          agentId,
          memoryType,
          content,
          context,
          importance: Math.max(0, Math.min(1, importance)), // Clamp between 0 and 1
          embedding,
        },
      });

      log(
        `[AgentMemory] Stored ${memoryType} memory for agent ${agentId}: importance=${importance}`
      );
    } catch (error) {
      logError(`[AgentMemory] Failed to store memory:`, error);
      throw error;
    }
  }

  /**
   * Retrieve memories based on criteria
   */
  async getMemories(agentId: string, options: MemorySearchOptions = {}): Promise<MemoryInfo[]> {
    try {
      const { memoryType, minImportance = 0, maxAge, limit = 20 } = options;

      const where: any = {
        agentId,
        importance: { gte: minImportance },
      };

      if (memoryType) {
        where.memoryType = memoryType;
      }

      if (maxAge) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxAge);
        where.createdAt = { gte: cutoffDate };
      }

      const memories = await prisma.agentMemory.findMany({
        where,
        orderBy: [{ importance: 'desc' }, { lastAccess: 'desc' }, { createdAt: 'desc' }],
        take: limit,
      });

      return memories.map((memory: any) => ({
        id: memory.id,
        memoryType: memory.memoryType,
        content: memory.content,
        context: memory.context,
        importance: memory.importance,
        accessCount: memory.accessCount,
        lastAccess: memory.lastAccess,
        createdAt: memory.createdAt,
      }));
    } catch (error) {
      logError(`[AgentMemory] Failed to get memories:`, error);
      return [];
    }
  }

  /**
   * Access a memory (updates access count and timestamp)
   */
  async accessMemory(memoryId: string): Promise<void> {
    try {
      await prisma.agentMemory.update({
        where: { id: memoryId },
        data: {
          accessCount: { increment: 1 },
          lastAccess: new Date(),
        },
      });
    } catch (error) {
      logError(`[AgentMemory] Failed to update memory access:`, error);
    }
  }

  /**
   * Find similar memories based on content similarity
   */
  async findSimilarMemories(agentId: string, query: string, limit = 5): Promise<MemoryInfo[]> {
    try {
      // For now, use simple text matching
      // TODO: Implement proper vector similarity with SQLite-VSS
      const memories = await prisma.agentMemory.findMany({
        where: {
          agentId,
          OR: [{ content: { contains: query } }, { context: { contains: query } }],
        },
        orderBy: [{ importance: 'desc' }, { accessCount: 'desc' }],
        take: limit,
      });

      // Update access count for retrieved memories
      for (const memory of memories) {
        await this.accessMemory(memory.id);
      }

      return memories.map((memory: any) => ({
        id: memory.id,
        memoryType: memory.memoryType,
        content: memory.content,
        context: memory.context,
        importance: memory.importance,
        accessCount: memory.accessCount + 1, // Reflect the access we just made
        lastAccess: new Date(),
        createdAt: memory.createdAt,
      }));
    } catch (error) {
      logError(`[AgentMemory] Failed to find similar memories:`, error);
      return [];
    }
  }

  /**
   * Store experience from a completed task
   */
  async storeExperience(
    agentId: string,
    taskType: string,
    outcome: 'success' | 'failure',
    description: string,
    context: string,
    qualityScore?: number
  ): Promise<void> {
    const importance =
      outcome === 'success'
        ? Math.min(0.8, (qualityScore || 50) / 100)
        : Math.max(0.3, 1 - (qualityScore || 50) / 100);

    const content = `Task: ${taskType} - Outcome: ${outcome} - ${description}`;

    await this.storeMemory(agentId, 'experience', content, context, importance);
  }

  /**
   * Store a learning from agent behavior
   */
  async storeLearning(
    agentId: string,
    learning: string,
    context: string,
    importance: number = 0.6
  ): Promise<void> {
    await this.storeMemory(agentId, 'learning', learning, context, importance);
  }

  /**
   * Store a strategy that worked well
   */
  async storeStrategy(
    agentId: string,
    strategy: string,
    context: string,
    effectiveness: number
  ): Promise<void> {
    const importance = Math.min(0.9, effectiveness / 100);

    await this.storeMemory(agentId, 'strategy', strategy, context, importance);
  }

  /**
   * Store a failure to avoid repeating mistakes
   */
  async storeFailure(
    agentId: string,
    failure: string,
    context: string,
    severity: number = 0.5
  ): Promise<void> {
    // Failures are important to remember
    const importance = Math.min(0.8, 0.4 + severity);

    await this.storeMemory(agentId, 'failure', failure, context, importance);
  }

  /**
   * Get memory summary for an agent
   */
  async getMemorySummary(agentId: string): Promise<{
    totalMemories: number;
    memoryTypeCounts: Record<string, number>;
    avgImportance: number;
    recentMemories: MemoryInfo[];
  }> {
    try {
      const memories = await prisma.agentMemory.findMany({
        where: { agentId },
      });

      const memoryTypeCounts: Record<string, number> = {};
      let importanceSum = 0;

      for (const memory of memories) {
        memoryTypeCounts[memory.memoryType] = (memoryTypeCounts[memory.memoryType] || 0) + 1;
        importanceSum += memory.importance;
      }

      const recentMemories = await this.getMemories(agentId, { limit: 5 });

      return {
        totalMemories: memories.length,
        memoryTypeCounts,
        avgImportance: memories.length > 0 ? importanceSum / memories.length : 0,
        recentMemories,
      };
    } catch (error) {
      logError(`[AgentMemory] Failed to get memory summary:`, error);
      return {
        totalMemories: 0,
        memoryTypeCounts: {},
        avgImportance: 0,
        recentMemories: [],
      };
    }
  }

  /**
   * Clean up old, low-importance memories to prevent database bloat
   */
  async cleanupMemories(agentId: string, maxMemories: number = 1000): Promise<void> {
    try {
      const memoryCount = await prisma.agentMemory.count({
        where: { agentId },
      });

      if (memoryCount <= maxMemories) {
        return; // No cleanup needed
      }

      // Delete memories with low importance and low access count
      const toDelete = memoryCount - maxMemories;

      const lowValueMemories = await prisma.agentMemory.findMany({
        where: { agentId },
        orderBy: [{ importance: 'asc' }, { accessCount: 'asc' }, { createdAt: 'asc' }],
        take: toDelete,
      });

      const idsToDelete = lowValueMemories.map((m: any) => m.id);

      await prisma.agentMemory.deleteMany({
        where: {
          id: { in: idsToDelete },
        },
      });

      log(`[AgentMemory] Cleaned up ${idsToDelete.length} memories for agent ${agentId}`);
    } catch (error) {
      logError(`[AgentMemory] Failed to cleanup memories:`, error);
    }
  }
}
