/**
 * Specialized Agent Factory
 * Creates appropriate agent types based on job categories and agent affinity
 * Implements natural selection through job-specific agent specialization
 */

import { JobData } from '@soup/common';
import { HybridReActAgent } from '../hybrid-agents/HybridReActAgent';
import { HybridMemoryAgent } from '../hybrid-agents/HybridMemoryAgent';
import { HybridResearchAgent } from '../hybrid-agents/HybridResearchAgent';
import { HybridRetrievalAgent } from '../hybrid-agents/HybridRetrievalAgent';

export type AgentType = 'react' | 'memory' | 'research' | 'retrieval';

export interface SpecializedAgent {
  handle(job: JobData): Promise<{
    ok: boolean;
    artifact: string;
    stepsUsed: number;
    planUsed: string;
    adjustments: string[];
  }>;
}

/**
 * Agent affinity mapping - defines which agent types are best suited for each job category
 * Higher scores indicate better affinity
 */
export const AGENT_JOB_AFFINITY: Record<string, Record<AgentType, number>> = {
  web_research: {
    research: 0.9, // Primary specialization
    retrieval: 0.7, // Secondary (good at knowledge search)
    react: 0.5, // Fallback (general reasoning)
    memory: 0.3, // Least suited
  },
  math: {
    react: 0.9, // Primary (good at step-by-step reasoning)
    retrieval: 0.6, // Secondary (can find mathematical methods)
    memory: 0.4, // Tertiary (can learn from past calculations)
    research: 0.3, // Least suited
  },
  summarize: {
    memory: 0.9, // Primary (specializes in text processing)
    retrieval: 0.7, // Secondary (can find context)
    research: 0.5, // Tertiary (good at analysis)
    react: 0.4, // Least suited
  },
  classify: {
    memory: 0.9, // Primary (excels at categorization)
    retrieval: 0.8, // Secondary (can find classification examples)
    react: 0.6, // Tertiary (good reasoning)
    research: 0.4, // Least suited
  },
};

/**
 * Creates specialized agents based on job requirements and natural selection pressure
 */
// Archetype to AgentType mapping
export const ARCHETYPE_TO_AGENT_TYPE: Record<string, AgentType> = {
  'research-specialist': 'research',
  'problem-solver': 'react',
  'data-analyst': 'retrieval',
  'memory-expert': 'memory',
};

export class SpecializedAgentFactory {
  /**
   * Creates an agent based on blueprint archetype (preferred) or job category
   */
  static createAgent(
    id: string,
    temperature: number,
    tools: string[],
    preferredType?: AgentType,
    jobCategory?: string,
    archetype?: string
  ): SpecializedAgent {
    let agentType: AgentType;

    if (preferredType) {
      // Use explicitly specified agent type
      agentType = preferredType;
    } else if (archetype && ARCHETYPE_TO_AGENT_TYPE[archetype]) {
      // Use archetype from blueprint (Phase 5 enhancement)
      agentType = ARCHETYPE_TO_AGENT_TYPE[archetype];
      console.log(
        `[SpecializedAgentFactory] Using archetype ${archetype} -> ${agentType} agent for job ${jobCategory || 'unknown'}`
      );
    } else if (jobCategory && AGENT_JOB_AFFINITY[jobCategory]) {
      // Fall back to job category affinity (Phase 1-4 behavior)
      agentType = this.selectBestAgentType(jobCategory);
      console.log(
        `[SpecializedAgentFactory] Selected ${agentType} agent for job category: ${jobCategory} (affinity-based)`
      );
    } else {
      // Default to ReAct for unknown types
      agentType = 'react';
      console.log(
        `[SpecializedAgentFactory] Defaulting to ${agentType} agent for unknown job/archetype`
      );
    }

    switch (agentType) {
      case 'memory':
        return new HybridMemoryAgent(id, temperature, tools);

      case 'research':
        return new HybridResearchAgent(id, temperature, tools);

      case 'retrieval':
        return new HybridRetrievalAgent(id, temperature, tools);

      case 'react':
      default:
        return new HybridReActAgent(id, temperature, tools);
    }
  }

  /**
   * Selects the best agent type for a given job category based on affinity scores
   */
  static selectBestAgentType(jobCategory: string): AgentType {
    const affinities = AGENT_JOB_AFFINITY[jobCategory];

    if (!affinities) {
      return 'react'; // Default fallback
    }

    // Find agent type with highest affinity score
    let bestType: AgentType = 'react';
    let bestScore = 0;

    for (const [type, score] of Object.entries(affinities)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as AgentType;
      }
    }

    console.log(
      `[SpecializedAgentFactory] Selected ${bestType} agent for ${jobCategory} (affinity: ${bestScore})`
    );
    return bestType;
  }

  /**
   * Gets the affinity score for a specific agent type and job category
   */
  static getAffinityScore(agentType: AgentType, jobCategory: string): number {
    const affinities = AGENT_JOB_AFFINITY[jobCategory];
    return affinities ? affinities[agentType] || 0 : 0;
  }

  /**
   * Gets all agent types ranked by affinity for a job category
   */
  static getRankedAgentTypes(jobCategory: string): Array<{ type: AgentType; score: number }> {
    const affinities = AGENT_JOB_AFFINITY[jobCategory];

    if (!affinities) {
      return [
        { type: 'react', score: 0.5 },
        { type: 'memory', score: 0.4 },
        { type: 'research', score: 0.3 },
        { type: 'retrieval', score: 0.2 },
      ];
    }

    return Object.entries(affinities)
      .map(([type, score]) => ({ type: type as AgentType, score }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Determines if an agent should evolve/adapt based on performance
   * This could be used for future evolution mechanics
   */
  static shouldEvolveAgent(
    currentType: AgentType,
    jobCategory: string,
    successRate: number
  ): { shouldEvolve: boolean; suggestedType?: AgentType } {
    const currentAffinity = this.getAffinityScore(currentType, jobCategory);
    const rankedTypes = this.getRankedAgentTypes(jobCategory);
    const bestType = rankedTypes[0];

    // If success rate is low and there's a better agent type, suggest evolution
    if (successRate < 0.3 && currentAffinity < bestType.score) {
      return {
        shouldEvolve: true,
        suggestedType: bestType.type,
      };
    }

    return { shouldEvolve: false };
  }

  /**
   * Creates an agent with evolutionary pressure towards job specialization
   * This simulates natural selection by favoring agents that perform well
   */
  static createEvolutionaryAgent(
    id: string,
    temperature: number,
    tools: string[],
    jobHistory: Array<{ category: string; success: boolean }>
  ): SpecializedAgent {
    // Analyze job history to determine most successful agent type
    const categoryPerformance: Record<string, { attempts: number; successes: number }> = {};

    jobHistory.forEach((job) => {
      if (!categoryPerformance[job.category]) {
        categoryPerformance[job.category] = { attempts: 0, successes: 0 };
      }
      categoryPerformance[job.category].attempts++;
      if (job.success) {
        categoryPerformance[job.category].successes++;
      }
    });

    // Find the job category this agent performs best on
    let bestCategory = '';
    let bestSuccessRate = 0;

    for (const [category, perf] of Object.entries(categoryPerformance)) {
      const successRate = perf.successes / perf.attempts;
      if (successRate > bestSuccessRate && perf.attempts >= 3) {
        // Require minimum attempts
        bestSuccessRate = successRate;
        bestCategory = category;
      }
    }

    // Create agent optimized for their best category
    if (bestCategory && bestSuccessRate > 0.6) {
      const agentType = this.selectBestAgentType(bestCategory);
      console.log(
        `[SpecializedAgentFactory] Creating evolutionary ${agentType} agent based on ${bestCategory} success (${bestSuccessRate.toFixed(2)})`
      );
      return this.createAgent(id, temperature, tools, agentType, bestCategory);
    }

    // Default to balanced ReAct agent for new/unspecialized agents
    return this.createAgent(id, temperature, tools, 'react');
  }
}
