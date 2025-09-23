/**
 * Name Generator for Agents - Creates fantasy-style names with characteristics
 * Format: [Name] the [Characteristic]
 */

import { PatchedChatVertexAI } from './patchedVertexAI';
import { log, logError, getVertexTokenLimit } from '@soup/common';

export interface AgentName {
  fullName: string;
  firstName: string;
  characteristic: string;
}

export class NameGenerator {
  private llm: PatchedChatVertexAI;

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
    }

    const maxOutputTokens = getVertexTokenLimit('name_generator');

    this.llm = new PatchedChatVertexAI({
      model: process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash',
      temperature: 0.8, // Higher temperature for more creative names
      maxOutputTokens, // Use config-based limit (undefined = no limit)
      authOptions: {
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? undefined
          : process.env.GOOGLE_CLOUD_CREDENTIALS
            ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
            : undefined,
      },
    });
  }

  /**
   * Generate names for multiple agents in a single batch LLM call
   */
  async generateNames(
    agents: Array<{ archetype: string; temperature: number; tools: string[] }>
  ): Promise<AgentName[]> {
    try {
      log(`[NameGenerator] Generating ${agents.length} names in batch...`);

      const prompt = this.createBatchPrompt(agents);
      const response = await this.llm.invoke(prompt);
      const content = response.content as string;

      const names = this.parseBatchResponse(content, agents.length);

      if (names.length !== agents.length) {
        logError(
          `[NameGenerator] Expected ${agents.length} names, got ${names.length}. Filling missing names...`
        );
        // Fill any missing names with fallbacks
        while (names.length < agents.length) {
          const index = names.length;
          names.push(this.createFallbackName(agents[index]));
        }
      }

      log(`[NameGenerator] Successfully generated ${names.length} names`);
      return names;
    } catch (error) {
      logError(`[NameGenerator] Batch name generation failed:`, error);
      // Return fallback names for all agents
      return agents.map((agent) => this.createFallbackName(agent));
    }
  }

  private createBatchPrompt(
    agents: Array<{ archetype: string; temperature: number; tools: string[] }>
  ): string {
    const agentDescriptions = agents
      .map((agent, index) => {
        const toolsList = agent.tools.length > 0 ? agent.tools.join(', ') : 'none';
        return `${index + 1}. Archetype: ${agent.archetype}, Temperature: ${agent.temperature}, Tools: [${toolsList}]`;
      })
      .join('\n');

    return `You are a creative fantasy name generator for AI agents. Generate exactly ${agents.length} unique fantasy-style names in the format "[Name] the [Characteristic]" for the following AI agents:

${agentDescriptions}

Requirements:
1. Each name must be in the exact format: "Firstname the Characteristic"
2. First names should be fantasy-style but pronounceable (think D&D character names)
3. Characteristics should be funny but descriptive of what the agent does
4. Make characteristics reflect the agent's archetype, tools, and personality (temperature)
5. Be creative and humorous - these are AI agents competing for jobs!
6. Avoid offensive or inappropriate content
7. Make each name unique and memorable

Examples of the style wanted:
- "Zephyr the Code-Weaver" (for a tool-builder agent)
- "Mordak the Wiki-Wanderer" (for a wikipedia agent)
- "Luna the Calculation-Crusher" (for a mathematical agent)
- "Bramble the Browser-Breaker" (for a web-browser agent)
- "Quill the Question-Quencher" (for an llm-only agent)

Return ONLY the names, one per line, numbered 1-${agents.length}:`;
  }

  private parseBatchResponse(content: string, expectedCount: number): AgentName[] {
    const names: AgentName[] = [];
    const lines = content.trim().split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Try to extract name from numbered format: "1. Name the Characteristic"
      const numberedMatch = trimmed.match(/^\d+\.?\s*(.+)$/);
      const nameText = numberedMatch ? numberedMatch[1] : trimmed;

      // Parse "Firstname the Characteristic" format
      const nameMatch = nameText.match(/^(.+?)\s+the\s+(.+)$/i);
      if (nameMatch) {
        const firstName = nameMatch[1].trim();
        const characteristic = nameMatch[2].trim();
        const fullName = `${firstName} the ${characteristic}`;

        names.push({
          fullName,
          firstName,
          characteristic,
        });

        if (names.length >= expectedCount) break;
      }
    }

    return names;
  }

  private createFallbackName(agent: {
    archetype: string;
    temperature: number;
    tools: string[];
  }): AgentName {
    // Fallback names when LLM generation fails
    const fallbackFirstNames = [
      'Zara',
      'Finn',
      'Luna',
      'Rex',
      'Nova',
      'Sage',
      'Raven',
      'Storm',
      'Echo',
      'Blaze',
      'Frost',
      'Dawn',
      'Ember',
      'Vale',
      'Orion',
      'Iris',
    ];

    const archetypeCharacteristics: Record<string, string[]> = {
      'tool-builder': ['Tool-Forger', 'Code-Crafter', 'Widget-Wizard', 'Function-Finder'],
      wikipedia: ['Wiki-Walker', 'Fact-Finder', 'Knowledge-Keeper', 'Info-Investigator'],
      'web-browser': ['Web-Wanderer', 'Link-Leaper', 'Site-Surfer', 'Page-Prowler'],
      'google-trends': ['Trend-Tracker', 'Search-Seeker', 'Data-Detective', 'Query-Quester'],
      'llm-only': ['Thought-Thinker', 'Logic-Lord', 'Reason-Ruler', 'Mind-Master'],
    };

    const firstName = fallbackFirstNames[Math.floor(Math.random() * fallbackFirstNames.length)];
    const characteristics = archetypeCharacteristics[agent.archetype] || ['Mystery-Maker'];
    const characteristic = characteristics[Math.floor(Math.random() * characteristics.length)];

    return {
      fullName: `${firstName} the ${characteristic}`,
      firstName,
      characteristic,
    };
  }
}

// Export singleton instance
export const nameGenerator = new NameGenerator();
