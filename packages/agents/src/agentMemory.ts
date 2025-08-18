/**
 * Agent memory system for storing and retrieving past experiences
 * P-5: Memory stub - In-process KV for last K jobs
 */

export interface JobMemory {
  id: string;
  category: string;
  payload: any;
  success: boolean;
  artifact: string;
  stepsUsed: number;
  timestamp: Date;
  planUsed?: string;
  adjustments?: string[];
}

export class AgentMemory {
  private agentId: string;
  private maxJobs: number;
  private memories: JobMemory[] = [];

  constructor(agentId: string, maxJobs: number = 10) {
    this.agentId = agentId;
    this.maxJobs = maxJobs;
  }

  /**
   * Store a job experience in memory
   */
  remember(memory: Omit<JobMemory, 'id' | 'timestamp'>): void {
    const jobMemory: JobMemory = {
      ...memory,
      id: `${this.agentId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };

    this.memories.unshift(jobMemory); // Add to beginning

    // Keep only the last K jobs
    if (this.memories.length > this.maxJobs) {
      this.memories = this.memories.slice(0, this.maxJobs);
    }

    console.log(
      `[Memory] Agent ${this.agentId}: Stored memory for ${memory.category} job (${memory.success ? 'SUCCESS' : 'FAIL'})`
    );
  }

  /**
   * Recall experiences by category
   */
  recallByCategory(category: string, limit: number = 5): JobMemory[] {
    return this.memories.filter((m) => m.category === category).slice(0, limit);
  }

  /**
   * Recall recent successful experiences
   */
  recallSuccesses(limit: number = 5): JobMemory[] {
    return this.memories.filter((m) => m.success).slice(0, limit);
  }

  /**
   * Recall recent failures
   */
  recallFailures(limit: number = 5): JobMemory[] {
    return this.memories.filter((m) => !m.success).slice(0, limit);
  }

  /**
   * Get all memories
   */
  recallAll(): JobMemory[] {
    return [...this.memories];
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    totalJobs: number;
    successRate: number;
    averageSteps: number;
    categoryStats: Record<string, { attempts: number; successes: number; avgSteps: number }>;
  } {
    const total = this.memories.length;
    const successes = this.memories.filter((m) => m.success).length;
    const totalSteps = this.memories.reduce((sum, m) => sum + m.stepsUsed, 0);

    const categoryStats: Record<string, { attempts: number; successes: number; avgSteps: number }> =
      {};

    for (const memory of this.memories) {
      if (!categoryStats[memory.category]) {
        categoryStats[memory.category] = { attempts: 0, successes: 0, avgSteps: 0 };
      }

      const stats = categoryStats[memory.category];
      stats.attempts++;
      if (memory.success) stats.successes++;
      stats.avgSteps = (stats.avgSteps * (stats.attempts - 1) + memory.stepsUsed) / stats.attempts;
    }

    return {
      totalJobs: total,
      successRate: total > 0 ? successes / total : 0,
      averageSteps: total > 0 ? totalSteps / total : 0,
      categoryStats,
    };
  }

  /**
   * Generate context for LLM prompts based on memory
   */
  generateContext(): string {
    if (this.memories.length === 0) {
      return 'No previous experience.';
    }

    const stats = this.getStats();

    // Keep context concise to reduce token usage
    let context = `Experience: ${(stats.successRate * 100).toFixed(0)}% success, ${stats.totalJobs} jobs, avg ${stats.averageSteps.toFixed(1)} steps`;

    // Only show category stats if we have diverse experience
    const categories = Object.keys(stats.categoryStats);
    if (categories.length > 1) {
      context += '\nCategories: ';
      context += categories
        .map((cat) => {
          const catStats = stats.categoryStats[cat];
          const successRate =
            catStats.attempts > 0
              ? ((catStats.successes / catStats.attempts) * 100).toFixed(0)
              : '0';
          return `${cat}:${successRate}%`;
        })
        .join(', ');
    }

    // Only include recent lessons if we have failures with adjustments
    const recentFailures = this.recallFailures(2);
    const relevantLessons = recentFailures
      .filter((f) => f.adjustments && f.adjustments.length > 0)
      .slice(0, 2);

    if (relevantLessons.length > 0) {
      context +=
        '\nLessons: ' +
        relevantLessons
          .map((f) => f.adjustments?.[0] || '')
          .filter(Boolean)
          .join(', ');
    }

    return context;
  }

  /**
   * Clear all memories (for testing or reset)
   */
  clear(): void {
    this.memories = [];
    console.log(`[Memory] Agent ${this.agentId}: Memory cleared`);
  }
}

// Memory manager for all agents
class MemoryManager {
  private memories: Map<string, AgentMemory> = new Map();

  getMemory(agentId: string, maxJobs: number = 10): AgentMemory {
    if (!this.memories.has(agentId)) {
      this.memories.set(agentId, new AgentMemory(agentId, maxJobs));
    }
    return this.memories.get(agentId)!;
  }

  clearAll(): void {
    this.memories.clear();
    console.log('[MemoryManager] All agent memories cleared');
  }

  getStats(): Record<string, any> {
    const stats: Record<string, any> = {};
    for (const [agentId, memory] of this.memories) {
      stats[agentId] = memory.getStats();
    }
    return stats;
  }
}

// Singleton memory manager
export const memoryManager = new MemoryManager();
