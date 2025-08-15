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
    const recentFailures = this.recallFailures(3);
    const recentSuccesses = this.recallSuccesses(3);

    let context = `Previous Performance:
- Success Rate: ${(stats.successRate * 100).toFixed(1)}%
- Average Steps: ${stats.averageSteps.toFixed(1)}
- Total Jobs: ${stats.totalJobs}

Category Performance:`;

    for (const [category, catStats] of Object.entries(stats.categoryStats)) {
      const successRate =
        catStats.attempts > 0 ? ((catStats.successes / catStats.attempts) * 100).toFixed(1) : '0';
      context += `\n- ${category}: ${successRate}% success (${catStats.attempts} attempts, avg ${catStats.avgSteps.toFixed(1)} steps)`;
    }

    if (recentFailures.length > 0) {
      context += `\n\nRecent Failures:`;
      for (const failure of recentFailures) {
        context += `\n- ${failure.category}: ${failure.adjustments?.join(', ') || 'Unknown issue'}`;
      }
    }

    if (recentSuccesses.length > 0) {
      context += `\n\nRecent Successes:`;
      for (const success of recentSuccesses) {
        context += `\n- ${success.category}: Used ${success.stepsUsed} steps`;
      }
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
