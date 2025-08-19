/**
 * Simple React Agent Implementation
 * Uses LangChain's createReactAgent for straightforward agent execution
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { WikipediaQueryRun } from '@langchain/community/tools/wikipedia_query_run';
import { WebBrowser } from 'langchain/tools/webbrowser';
import { SerpAPI } from '@langchain/community/tools/serpapi';
import { JobData } from '@soup/common';

// Agent archetype types
export type AgentArchetype = 'llm-only' | 'web-browser' | 'wikipedia' | 'google-trends';

// Create Vertex AI LLM instance
function createVertexAILLM() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const model = process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';
  const temperature = parseFloat(process.env.VERTEX_AI_TEMPERATURE || '0.7');
  const maxOutputTokens = parseInt(process.env.VERTEX_AI_MAX_OUTPUT_TOKENS || '1000');

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
  }

  return new ChatVertexAI({
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

// Create tools based on archetype
function getToolsForArchetype(archetype: AgentArchetype) {
  const llm = createVertexAILLM();

  switch (archetype) {
    case 'llm-only':
      // No tools, just the LLM
      return [];

    case 'web-browser':
      // Web browser tool for searching and extracting content
      return [
        new WebBrowser({
          model: llm,
          embeddings: null as any, // We don't need embeddings for simple browsing
        }),
      ];

    case 'wikipedia':
      // Wikipedia search tool
      return [new WikipediaQueryRun({ topKResults: 3 })];

    case 'google-trends':
      // Google Trends via SerpAPI
      return [
        new SerpAPI(
          process.env.SERPAPI_KEY ||
            'f2851b0e9f2290428332cc7b2c7578968e376cfb72e012f5b96a8b000b8edb2f',
          {
            location: 'United States',
            hl: 'en',
            gl: 'us',
          }
        ),
      ];

    default:
      return [];
  }
}

export class SimpleReactAgent {
  private agent: any;
  public id: string;
  public archetype: AgentArchetype;

  constructor(id: string, archetype: AgentArchetype) {
    this.id = id;
    this.archetype = archetype;

    // Create the LLM
    const llm = createVertexAILLM();

    // Get tools for this archetype
    const tools = getToolsForArchetype(archetype);

    // Create the React agent
    this.agent = createReactAgent({
      llm,
      tools,
    });

    console.log(`[SimpleReactAgent] Created ${archetype} agent ${id} with ${tools.length} tools`);
  }

  async handle(job: JobData): Promise<any> {
    try {
      console.log(`[SimpleReactAgent] Agent ${this.id} (${this.archetype}) processing job`);

      // Extract the job prompt (simplified - no categories)
      const prompt =
        typeof job.payload === 'string'
          ? job.payload
          : job.payload.prompt || JSON.stringify(job.payload);

      // Invoke the agent with the prompt
      const result = await this.agent.invoke({
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract the final response
      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];
      const response = lastMessage?.content || 'No response generated';

      console.log(`[SimpleReactAgent] Agent ${this.id} completed job`);

      return {
        ok: true,
        artifact: response,
        stepsUsed: messages.length,
        archetype: this.archetype,
      };
    } catch (error) {
      console.error(`[SimpleReactAgent] Agent ${this.id} failed:`, error);

      return {
        ok: false,
        artifact: `Agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stepsUsed: 0,
        archetype: this.archetype,
      };
    }
  }
}

// Factory function to create agents based on blueprint archetype
export function createAgentForBlueprint(agentId: string, archetype: string): SimpleReactAgent {
  // Validate archetype is one of our supported types
  const validArchetypes: AgentArchetype[] = [
    'llm-only',
    'web-browser',
    'wikipedia',
    'google-trends',
  ];
  const isValidArchetype = validArchetypes.includes(archetype as AgentArchetype);

  // Use archetype directly (no mapping needed) or default to llm-only
  const agentArchetype = isValidArchetype ? (archetype as AgentArchetype) : 'llm-only';

  return new SimpleReactAgent(agentId, agentArchetype);
}
