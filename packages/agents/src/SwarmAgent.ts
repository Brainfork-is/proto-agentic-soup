/**
 * SwarmAgent - Manages a swarm of specialized agents using collaborative approach
 */

import { PatchedChatVertexAI } from './patchedVertexAI';
import { JobData, log, logError, getVertexTokenLimit } from '@soup/common';
import { createAgentForBlueprint, AgentArchetype } from './SimpleReactAgent';
import { ToolBuilderAgent } from './ToolBuilderAgent';
import { LangChainToolBuilderAgent } from './LangChainToolBuilderAgent';

export interface SwarmConfig {
  id: string;
  name: string;
  description?: string;
  agentTypes: AgentArchetype[];
  agentCount: number;
  existingAgents?: any[]; // Pre-loaded agent instances from database
}

export interface SwarmMember {
  id: string;
  name: string;
  archetype: AgentArchetype;
  agent: any; // SimpleReactAgent or ToolBuilderAgent
}

export class SwarmAgent {
  public id: string;
  public name: string;
  public description?: string;
  private members: SwarmMember[];
  private swarm: any;
  private llm: PatchedChatVertexAI;

  constructor(config: SwarmConfig) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.members = [];

    // Initialize LLM for swarm coordination
    this.llm = this.createVertexAILLM();

    // Create swarm members
    this.initializeMembers(config);

    // Create the swarm workflow
    this.initializeSwarm();
  }

  private createVertexAILLM(): PatchedChatVertexAI {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const model = process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';
    const temperature = parseFloat(process.env.VERTEX_AI_TEMPERATURE || '0.7');
    const maxOutputTokens = getVertexTokenLimit('agent');

    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
    }

    return new PatchedChatVertexAI({
      model,
      temperature,
      maxOutputTokens,
      authOptions: {
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? undefined
          : process.env.GOOGLE_CLOUD_CREDENTIALS
            ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
            : undefined,
      },
    });
  }

  private initializeMembers(config: SwarmConfig): void {
    // If existing agents are provided, use them directly
    if (config.existingAgents && config.existingAgents.length > 0) {
      log(`[SwarmAgent] Using ${config.existingAgents.length} existing database agents`);

      config.existingAgents.forEach((agentInstance, index) => {
        this.members.push({
          id: agentInstance.id || `${this.id}_existing_${index}`,
          name: agentInstance.name || `Agent ${index + 1}`,
          archetype: agentInstance.archetype || 'llm-only',
          agent: agentInstance,
        });
      });
    } else {
      // Fallback to creating temporary agents (original behavior)
      log(`[SwarmAgent] No existing agents provided, creating temporary agents`);
      const membersPerType = Math.ceil(config.agentCount / config.agentTypes.length);

      config.agentTypes.forEach((archetype, _typeIndex) => {
        for (let i = 0; i < membersPerType && this.members.length < config.agentCount; i++) {
          const memberId = `${this.id}_${archetype}_${i}`;
          const memberName = `${archetype.charAt(0).toUpperCase() + archetype.slice(1)} Agent ${i + 1}`;

          let agent;
          if (archetype === 'tool-builder') {
            // Choose between old and new ToolBuilderAgent implementations
            const useLangChainToolBuilder =
              (process.env.USE_LANGCHAIN_TOOL_BUILDER || 'true').toLowerCase() === 'true';

            if (useLangChainToolBuilder) {
              log(`[SwarmAgent] Creating LangChain-based ToolBuilderAgent for ${memberId}`);
              agent = new LangChainToolBuilderAgent(memberId);
            } else {
              log(`[SwarmAgent] Creating custom ToolBuilderAgent for ${memberId}`);
              agent = new ToolBuilderAgent(memberId);
            }
          } else {
            agent = createAgentForBlueprint(memberId, archetype);
          }

          this.members.push({
            id: memberId,
            name: memberName,
            archetype,
            agent,
          });
        }
      });
    }

    log(`[SwarmAgent] Initialized swarm "${this.name}" with ${this.members.length} members`);
  }

  private initializeSwarm(): void {
    // Simple swarm initialization - members are ready to collaborate
    log(`[SwarmAgent] Swarm workflow initialized for "${this.name}"`);
  }

  private getArchetypeDescription(archetype: AgentArchetype): string {
    switch (archetype) {
      case 'llm-only':
        return 'Pure reasoning and analysis without external tools. Focus on logical thinking and problem-solving.';
      case 'web-browser':
        return 'Web browsing and content extraction. Navigate websites, extract information, and analyze web content.';
      case 'wikipedia':
        return 'Wikipedia research and knowledge retrieval. Find factual information and provide well-researched answers.';
      case 'google-trends':
        return 'Trend analysis and search insights. Analyze popularity trends and search patterns.';
      case 'tool-builder':
        return 'Dynamic tool creation and execution. Build custom tools as needed for complex tasks.';
      default:
        return 'General purpose agent with flexible capabilities.';
    }
  }

  async invoke(job: JobData): Promise<string> {
    try {
      log(`[SwarmAgent] Swarm "${this.name}" processing job category: ${job.category}`);

      // Select the best agent(s) for this job type
      const selectedAgents = this.selectAgentsForJob(job);

      if (selectedAgents.length === 0) {
        if (this.members.length === 0) {
          throw new Error(
            `Swarm "${this.name}" has no members to handle job category: ${job.category}`
          );
        }
        throw new Error(`No suitable agents found for job category: ${job.category}`);
      }

      // If only one agent is suitable, use it directly
      if (selectedAgents.length === 1) {
        const agent = selectedAgents[0];
        log(`[SwarmAgent] Single agent "${agent.archetype}" handling job`);
        return await this.invokeAgent(agent, job);
      }

      // For multiple agents, use collaborative approach
      log(`[SwarmAgent] Collaborative approach with ${selectedAgents.length} agents`);
      const results = await Promise.all(
        selectedAgents.map((agent) => this.invokeAgent(agent, job))
      );

      // Filter out error responses - only keep successful results
      const successfulResults = results.filter(
        (r) =>
          (!r.includes('encountered an error') && !r.includes('Agent')) || !r.includes('failed')
      );

      if (successfulResults.length === 0) {
        // All agents failed
        const errorMessages = results.filter((r) => r.includes('encountered an error'));
        throw new Error(
          `All ${results.length} agents failed to process job. Errors: ${errorMessages.join('; ')}`
        );
      }

      log(
        `[SwarmAgent] ${successfulResults.length}/${results.length} agents succeeded, synthesizing results`
      );

      // Combine and synthesize only successful results
      const synthesizedResult = await this.synthesizeResults(successfulResults, job);

      log(`[SwarmAgent] Swarm "${this.name}" completed job`);
      return synthesizedResult;
    } catch (error) {
      logError(`[SwarmAgent] Swarm "${this.name}" failed on job:`, error);
      throw error;
    }
  }

  private selectAgentsForJob(job: JobData): SwarmMember[] {
    // Select agents based on job category and their archetype strengths
    const suitable: SwarmMember[] = [];

    switch (job.category) {
      case 'web_research':
        // Prefer web-browser and wikipedia agents for research
        suitable.push(
          ...this.members.filter((m) => ['web-browser', 'wikipedia'].includes(m.archetype))
        );
        if (suitable.length === 0) {
          suitable.push(...this.members.filter((m) => m.archetype === 'google-trends'));
        }
        break;

      case 'math':
        // Prefer tool-builder for complex math, fallback to llm-only
        suitable.push(...this.members.filter((m) => m.archetype === 'tool-builder'));
        if (suitable.length === 0) {
          suitable.push(...this.members.filter((m) => m.archetype === 'llm-only'));
        }
        break;

      case 'summarize':
      case 'classify':
        // LLM-only is good for text processing
        suitable.push(...this.members.filter((m) => m.archetype === 'llm-only'));
        break;

      default:
        // Use tool-builder for complex or unknown tasks
        suitable.push(...this.members.filter((m) => m.archetype === 'tool-builder'));
        if (suitable.length === 0) {
          suitable.push(...this.members.filter((m) => m.archetype === 'llm-only'));
        }
        break;
    }

    // If no specific agents found, use any available
    if (suitable.length === 0 && this.members.length > 0) {
      suitable.push(this.members[0]);
    }

    return suitable.slice(0, 3); // Limit to max 3 agents for efficiency
  }

  private async invokeAgent(member: SwarmMember, job: JobData): Promise<string> {
    try {
      const result = await member.agent.handle(job);

      // Handle both object responses and string responses
      if (typeof result === 'string') {
        return result;
      } else if (result && typeof result === 'object') {
        // Extract artifact from object response
        return result.artifact || result.response || JSON.stringify(result);
      }

      return 'No response generated';
    } catch (error) {
      logError(`[SwarmAgent] Agent "${member.archetype}" failed:`, error);
      return `Agent "${member.archetype}" encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async synthesizeResults(allResults: string[], job: JobData): Promise<string> {
    // Filter out error responses - use successful ones only
    const successfulResults = allResults.filter(
      (r) =>
        !r.includes('encountered an error') &&
        !r.includes('failed to') &&
        !r.toLowerCase().includes('error:') &&
        r !== 'No response generated'
    );

    // If all results are errors, throw error
    if (successfulResults.length === 0) {
      logError(`[SwarmAgent] All agent responses failed`);
      throw new Error(`All agents failed to complete the task`);
    }

    // Log if some agents failed but we can still proceed
    if (successfulResults.length < allResults.length) {
      log(
        `[SwarmAgent] ${allResults.length - successfulResults.length}/${allResults.length} agents failed, using ${successfulResults.length} successful results`
      );
    }

    // If only one successful result, return it
    if (successfulResults.length === 1) {
      return successfulResults[0];
    }

    // Use LLM to synthesize multiple results
    const prompt = `Synthesize the following responses from different specialist agents into a comprehensive, coherent answer.

IMPORTANT: All responses below are from successful agent executions. Combine them into a single, cohesive answer that addresses the task completely.

Task: ${JSON.stringify(job.payload)}

Successful Agent Responses:
${successfulResults.map((result, index) => `Agent ${index + 1}: ${result}`).join('\n\n')}

Provide a unified, well-structured response that combines the best insights from all agents. Focus on delivering a complete, actionable answer to the task:`;

    try {
      const response = await this.llm.invoke(prompt);
      let content = response.content as string;

      // Clean up excessive whitespace that causes storage issues
      if (content) {
        const originalLength = content.length;

        // First handle excessive spaces within lines
        content = content.replace(/ {100,}/g, ' '); // Replace 100+ spaces with single space

        // Then handle line-level whitespace
        content = content
          .split('\n')
          .map((line) => line.trim()) // Trim whitespace from each line
          .filter((line) => line.length > 0 || content.includes('\n\n')) // Keep empty lines only if there are paragraph breaks
          .join('\n')
          .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with just 2
          .trim(); // Remove leading/trailing whitespace

        if (originalLength > 100000 && content.length < originalLength / 2) {
          log(
            `[SwarmAgent] Removed excessive whitespace: ${originalLength} -> ${content.length} chars`
          );
        }

        // Only truncate if still too large after cleanup
        if (content.length > 100000) {
          logError(
            `[SwarmAgent] Response still too large after cleanup (${content.length} chars), truncating`
          );
          content = content.substring(0, 100000) + '\n... [truncated due to size]';
        }
      }

      return content;
    } catch (error) {
      logError('[SwarmAgent] Failed to synthesize results:', error);
      // Fallback: return the first valid successful result (also cleaned)
      let fallback =
        successfulResults.find((r: string) => r && r.trim().length > 0) ||
        'No valid response generated';

      // Clean up whitespace in fallback too
      if (fallback) {
        const originalLength = fallback.length;

        // First handle excessive spaces within lines
        fallback = fallback.replace(/ {100,}/g, ' '); // Replace 100+ spaces with single space

        // Then handle line-level whitespace
        fallback = fallback
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.length > 0 || fallback.includes('\n\n'))
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        if (originalLength > 100000 && fallback.length < originalLength / 2) {
          log(`[SwarmAgent] Cleaned fallback: ${originalLength} -> ${fallback.length} chars`);
        }

        if (fallback.length > 100000) {
          fallback = fallback.substring(0, 100000) + '\n... [truncated due to size]';
        }
      }

      return fallback;
    }
  }

  getMembers(): SwarmMember[] {
    return [...this.members];
  }

  getMemberCount(): number {
    return this.members.length;
  }

  getArchetypes(): AgentArchetype[] {
    return [...new Set(this.members.map((m) => m.archetype))] as AgentArchetype[];
  }
}

// Factory function for creating swarms
export function createSwarmAgent(config: SwarmConfig): SwarmAgent {
  return new SwarmAgent(config);
}
