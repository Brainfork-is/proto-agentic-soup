/**
 * LangChain-based Tool Builder Agent
 * Uses LangChain's createReactAgent with tool creation and management capabilities
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createVertexAILangChainLLM } from './llm';
import { DynamicTool } from '@langchain/core/tools';
import { JobData, log, logError } from '@soup/common';
import { codeGeneratorTool } from './tools/codeGenerator';
import { dynamicToolLoader } from './tools/dynamicToolLoader';
import { ToolMemoryService, AgentMemoryService } from './memory';
import { AvailableToolSummary } from './types';

export class LangChainToolBuilderAgent {
  private agent: any;
  public id: string;
  public archetype = 'tool-builder';
  private toolMemory: ToolMemoryService;
  private agentMemory: AgentMemoryService;
  private availableTools: AvailableToolSummary[] = [];
  private initializationPromise: Promise<void>;

  constructor(id: string) {
    this.id = id;

    // Initialize memory services
    this.toolMemory = ToolMemoryService.getInstance();
    this.agentMemory = AgentMemoryService.getInstance();

    log(`[LangChainToolBuilderAgent] Creating LangChain-based tool builder agent ${id}`);
    this.initializationPromise = this.initializeAgent();
  }

  private async initializeAgent() {
    try {
      // Load existing tools for awareness
      await this.reloadTools();

      // Create LangChain LLM
      const llm = createVertexAILangChainLLM('tool_builder');

      // Create tools for the agent
      const tools = await this.createAgentTools();

      // Create system message for tool building
      const systemMessage = this.createSystemMessage();

      // Create the React agent
      this.agent = createReactAgent({
        llm,
        tools,
        messageModifier: systemMessage,
      });

      log(`[LangChainToolBuilderAgent] Initialized agent ${this.id} with ${tools.length} tools`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown initialization error';
      logError(
        `[LangChainToolBuilderAgent] Failed to initialize agent ${this.id}: ${errorMsg}`,
        error
      );
      throw new Error(`LangChainToolBuilderAgent initialization failed: ${errorMsg}`);
    }
  }

  private async reloadTools(): Promise<void> {
    try {
      const loadedTools = await dynamicToolLoader.loadToolsForAgent(this.id);
      this.availableTools = loadedTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown reload error';
      logError(
        `[LangChainToolBuilderAgent] Failed to reload tools for agent ${this.id}: ${errorMsg}`
      );
    }
  }

  private async createAgentTools(): Promise<any[]> {
    const tools: any[] = [];

    // Add the code generator tool
    tools.push(codeGeneratorTool);

    // Add memory search tool
    const memorySearchTool = new DynamicTool({
      name: 'search_existing_tools',
      description:
        'Search for existing tools that might be suitable for the current task. Provide a task description to find similar tools.',
      func: async (input: string): Promise<string> => {
        try {
          // First, try to find tools by similarity
          const similarTools = await this.toolMemory.findSimilarTools(this.id, input, 5);

          if (similarTools.length > 0) {
            // Only show tools that have proven success
            const provenTools = similarTools.filter(
              (tool) => tool.successCount > 0 && tool.avgQuality > 0.3
            );

            if (provenTools.length > 0) {
              const toolList = provenTools
                .map(
                  (tool) =>
                    `- ${tool.toolName}: ${tool.description} (Success rate: ${((tool.successCount / (tool.successCount + tool.failureCount)) * 100).toFixed(1)}%, Quality: ${(tool.avgQuality * 100).toFixed(1)}%)`
                )
                .join('\n');

              return `Found ${provenTools.length} existing tools that might be suitable:\n${toolList}`;
            }
          }

          // Also check currently available tools
          if (this.availableTools.length > 0) {
            const toolList = this.availableTools
              .map((tool) => `- ${tool.name}: ${tool.description}`)
              .join('\n');

            return `No proven tools found in memory, but you have ${this.availableTools.length} available tools:\n${toolList}`;
          }

          return 'No suitable existing tools found. You may need to create a new tool.';
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logError(`[LangChainToolBuilderAgent] Memory search error: ${errorMsg}`);
          return `Error searching for existing tools: ${errorMsg}`;
        }
      },
    });

    tools.push(memorySearchTool);

    // Add tool execution tool
    const executeToolTool = new DynamicTool({
      name: 'execute_tool',
      description:
        'Execute a specific tool with given arguments. Provide JSON with toolName and args properties.',
      func: async (input: string): Promise<string> => {
        try {
          const params = JSON.parse(input);
          const { toolName, args } = params;

          if (!toolName) {
            return JSON.stringify({ success: false, error: 'toolName is required' });
          }

          // Ensure tool is loaded
          await dynamicToolLoader.ensureTool(toolName);

          // Execute the tool
          const resultString = await dynamicToolLoader.executeTool(toolName, args || {});

          // Parse the result to get the actual object
          let result;
          try {
            result = JSON.parse(resultString);
          } catch (error) {
            result = { success: false, error: 'Failed to parse tool result', toolName };
          }

          // Update memory with execution result
          if (result.success) {
            await this.toolMemory.updateToolPerformance(this.id, toolName, true, 1.0);
          } else {
            await this.toolMemory.updateToolPerformance(this.id, toolName, false);
          }

          return JSON.stringify(result);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          logError(`[LangChainToolBuilderAgent] Tool execution error: ${errorMsg}`);
          return JSON.stringify({ success: false, error: errorMsg });
        }
      },
    });

    tools.push(executeToolTool);

    return tools;
  }

  private createSystemMessage(): string {
    return `You are a specialized Tool Builder Agent designed to create and execute custom tools for complex tasks.

YOUR CAPABILITIES:
1. **search_existing_tools** - Search for existing tools that might be suitable for the current task
2. **code_generator** - Create custom JavaScript tools when needed
3. **execute_tool** - Run specific tools with given arguments

YOUR APPROACH:
1. **First, always search for existing tools** using search_existing_tools before creating new ones
2. **If suitable tools exist**, use execute_tool to run them
3. **If no suitable tools exist**, use code_generator to create a new LangChain-compatible tool
4. **Always execute the tool** after creation to complete the task

TOOL CREATION GUIDELINES:
When creating tools with code_generator, ensure they are LangChain-compatible by:
- Using proper JavaScript syntax and structure
- Including comprehensive error handling
- Returning structured JSON results: {success: boolean, result: any, toolName: string}
- Making tools reusable with clear parameter schemas

EXECUTION CONSTRAINTS:
- This is a ONE-SHOT task - provide a complete solution
- Never ask for clarification or additional information
- If details are incomplete, make reasonable assumptions
- Always aim to complete the requested task fully

MEMORY INTEGRATION:
- Your tool creations are stored in memory for future reuse
- Always check memory first to avoid recreating existing tools
- Quality tools will be automatically reused by other agents

Your goal is to either find and use existing tools or create new ones to successfully complete any given task.`;
  }

  async handle(job: JobData): Promise<any> {
    await this.initializationPromise;

    try {
      log(`[LangChainToolBuilderAgent] Agent ${this.id} processing job`);

      // Extract the job prompt
      const prompt =
        typeof job.payload === 'string'
          ? job.payload
          : job.payload.prompt || JSON.stringify(job.payload);

      // Invoke the LangChain agent
      const result = await this.agent.invoke({
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract the final response
      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];
      const response = lastMessage?.content || 'No response generated';

      // Check if tools were used
      const toolMessages = messages.filter((msg: any) => msg.type === 'tool');
      const usedTools = toolMessages.length > 0;

      log(`[LangChainToolBuilderAgent] Agent ${this.id} completed job (tools used: ${usedTools})`);

      // Store experience in memory
      await this.agentMemory.storeExperience(
        this.id,
        'tool-builder',
        'success',
        response,
        prompt,
        usedTools ? 90 : 70 // Quality score out of 100
      );

      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logError(`[LangChainToolBuilderAgent] Agent ${this.id} failed: ${errorMsg}`, error);

      // Store failure experience
      await this.agentMemory.storeExperience(
        this.id,
        'tool-builder',
        'failure',
        `Error: ${errorMsg}`,
        typeof job.payload === 'string' ? job.payload : JSON.stringify(job.payload),
        20 // Low quality score for failures
      );

      throw error;
    }
  }
}

// Factory function for creating LangChain-based tool builder agents
export function createLangChainToolBuilderAgent(id: string): LangChainToolBuilderAgent {
  return new LangChainToolBuilderAgent(id);
}
