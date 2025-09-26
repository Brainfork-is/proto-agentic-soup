/**
 * Simple React Agent Implementation
 * Uses LangChain's createReactAgent for straightforward agent execution
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createVertexAILangChainLLM } from './llm';
import { WikipediaQueryRun } from '@langchain/community/tools/wikipedia_query_run';
import { WebBrowser } from 'langchain/tools/webbrowser';
import { SerpAPI } from '@langchain/community/tools/serpapi';
import { JobData, log, logError } from '@soup/common';

// Agent archetype types
export type AgentArchetype =
  | 'llm-only'
  | 'web-browser'
  | 'wikipedia'
  | 'google-trends'
  | 'tool-builder';

// Create LLM instance with fallback for non-Vertex providers
function createLLMForTools() {
  try {
    return createVertexAILangChainLLM('agent');
  } catch (error) {
    // If LangChain model creation fails (e.g., with Ollama), return null
    // Tools that require LangChain models will be skipped
    console.warn(
      '[SimpleReactAgent] LangChain model not available, some tools will be disabled:',
      (error as Error).message
    );
    return null;
  }
}

// Create tools based on archetype
function getToolsForArchetype(archetype: AgentArchetype) {
  const llm = createLLMForTools();

  switch (archetype) {
    case 'llm-only':
      // No tools, just the LLM
      return [];

    case 'web-browser': {
      // Combination of search and browse capabilities
      const tools: any[] = [
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

      // Only add WebBrowser tool if LangChain model is available
      if (llm) {
        tools.push(
          new WebBrowser({
            model: llm,
            embeddings: null as any, // For browsing specific URLs found via search
          })
        );
      }

      return tools;
    }

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

    // Create the LLM for the agent - need LangChain compatible model
    // Try to get LangChain model, fallback to basic agent if not available
    let llm: any;
    try {
      llm = createVertexAILangChainLLM('agent');
    } catch (error) {
      throw new Error(
        `Cannot create agent: LangChain model required for agent creation but not available for current provider. Error: ${(error as Error).message}`
      );
    }

    // Get tools for this archetype
    const tools = getToolsForArchetype(archetype);

    // Create system message based on archetype and available tools
    const systemMessage = this.createSystemMessage(archetype, tools);

    // Create the React agent with explicit instructions
    this.agent = createReactAgent({
      llm,
      tools,
      messageModifier: systemMessage,
    });

    log(`[SimpleReactAgent] Created ${archetype} agent ${id} with ${tools.length} tools`);
  }

  private createSystemMessage(archetype: AgentArchetype, _tools: any[]): string {
    let toolInstructions = '';

    switch (archetype) {
      case 'web-browser':
        toolInstructions = `You have both web search and browsing capabilities. When asked to research or find current information:
- Use the serpapi tool to search Google for information, news, data, and current facts
- Use the web-browser tool to access and extract content from specific URLs
- For research tasks: First search with serpapi, then browse specific results with web-browser if needed
- You MUST use these tools when research, current information, or sources are requested`;
        break;

      case 'wikipedia':
        toolInstructions = `You have Wikipedia search capabilities. When asked to research or find information:
- Use the wikipedia tool to search for relevant articles
- This tool is perfect for factual information, definitions, and general knowledge
- You MUST use this tool when research or sources are requested`;
        break;

      case 'google-trends':
        toolInstructions = `You have Google search capabilities via SerpAPI. When asked to find current information:
- Use the serpapi tool to search Google for real-time data, news, and current information
- This tool can find stock prices, news, trends, and any current web information
- You MUST use this tool when current/real-time information is requested`;
        break;

      case 'llm-only':
        toolInstructions = `You do not have external tools. Use your training knowledge to provide the best response possible.`;
        break;
    }

    return `You are an AI agent designed to complete tasks efficiently.
${toolInstructions}

IMPORTANT: If the task requires current information, research, or sources, you MUST use your available tools. Do not claim you cannot access information if you have tools available.

EXECUTION CONSTRAINTS:
- This is a ONE-SHOT task - you cannot ask for clarification or additional information
- You MUST work only with the information provided in the prompt
- NEVER ask for more details, clarification, or user input
- If details seem incomplete, make reasonable professional assumptions and proceed
- State any assumptions clearly in your response
- Provide a complete response based on available information, even if imperfect

FORBIDDEN RESPONSES - Never say:
- "I need more information..."
- "Please specify..."
- "Could you clarify..."
- "Which specific..."
- "Please provide..."
- "Can you tell me more about..."

Instead, make reasonable assumptions and deliver a complete response.

Always provide complete, actionable responses based on the tools at your disposal.`;
  }

  async handle(job: JobData): Promise<any> {
    try {
      log(`[SimpleReactAgent] Agent ${this.id} (${this.archetype}) processing job`);

      // Extract the job prompt (simplified - no categories)
      const prompt =
        typeof job.payload === 'string'
          ? job.payload
          : job.payload.prompt || JSON.stringify(job.payload);

      // Invoke the agent with the prompt
      const result = await this.agent.invoke({
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract the final response and check for tool usage
      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];
      const response = lastMessage?.content || 'No response generated';

      // Track tool usage by examining messages
      let toolsUsed = false;
      for (const msg of messages) {
        if (
          msg.tool_calls ||
          msg.additional_kwargs?.tool_calls ||
          (typeof msg.content === 'string' && msg.content.includes('Action:'))
        ) {
          toolsUsed = true;
          break;
        }
      }

      log(`[SimpleReactAgent] Agent ${this.id} completed job (tools used: ${toolsUsed})`);

      return {
        ok: true,
        artifact: response,
        stepsUsed: messages.length,
        archetype: this.archetype,
        toolsUsed,
      };
    } catch (error) {
      logError(`[SimpleReactAgent] Agent ${this.id} failed:`, error);

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
export function createAgentForBlueprint(
  agentId: string,
  archetype: string
): SimpleReactAgent | any {
  // Import ToolBuilderAgent here to avoid circular dependencies
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ToolBuilderAgent = require('./ToolBuilderAgent').ToolBuilderAgent;

  // Validate archetype is one of our supported types
  const validArchetypes: AgentArchetype[] = [
    'llm-only',
    'web-browser',
    'wikipedia',
    'google-trends',
    'tool-builder',
  ];
  const isValidArchetype = validArchetypes.includes(archetype as AgentArchetype);

  // Use archetype directly (no mapping needed) or default to llm-only
  const agentArchetype = isValidArchetype ? (archetype as AgentArchetype) : 'llm-only';

  // Create specialized agent for tool-builder archetype
  if (agentArchetype === 'tool-builder') {
    return new ToolBuilderAgent(agentId);
  }

  return new SimpleReactAgent(agentId, agentArchetype);
}
