/**
 * Tool Builder Agent - Self-improving agent that can create custom tools
 * Extends SimpleReactAgent with dynamic tool creation capabilities
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { DynamicTool } from '@langchain/core/tools';
import { JobData, log, logError } from '@soup/common';
import { CodeGeneratorTool } from './tools/codeGenerator';
import { dynamicToolLoader } from './tools/dynamicToolLoader';

// Create Vertex AI LLM instance
function createVertexAILLM() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const model = process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';
  const temperature = parseFloat(process.env.VERTEX_AI_TEMPERATURE || '0.7');
  const maxOutputTokens = parseInt(process.env.VERTEX_AI_MAX_OUTPUT_TOKENS || '1500');

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

// Convert our tool interface to LangChain-compatible tools
function createLangChainTool(tool: any) {
  return {
    name: tool.name,
    description: tool.description,
    func: async (input: string) => {
      try {
        // Parse input if it's a JSON string
        let params;
        try {
          params = JSON.parse(input);
        } catch {
          // If not JSON, treat as simple string parameter
          params = { input };
        }

        return await tool.invoke(params);
      } catch (error) {
        const errorMsg =
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Tool execution failed';
        return JSON.stringify({
          success: false,
          error: errorMsg,
        });
      }
    },
  };
}

export class ToolBuilderAgent {
  private agent: any;
  private availableTools: any[] = [];
  private initializationPromise: Promise<void>;
  public id: string;
  public archetype = 'tool-builder';

  constructor(id: string) {
    this.id = id;
    log(`[ToolBuilderAgent] Constructor called for agent ${id}`);
    this.initializationPromise = this.initializeAgent();
  }

  private async initializeAgent() {
    try {
      // Create the LLM
      const llm = createVertexAILLM();

      // Create agent-specific code generator tool with bound agent ID
      const agentSpecificCodeGenerator = this.createAgentSpecificCodeGenerator();
      this.availableTools = [agentSpecificCodeGenerator];

      // Load existing tools for this agent
      const loadedTools = await dynamicToolLoader.loadToolsForAgent(this.id);
      const langChainTools = loadedTools.map((tool) => createLangChainTool(tool));
      this.availableTools.push(...langChainTools);

      // Create system message
      const systemMessage = this.createSystemMessage();

      // Create the React agent
      this.agent = createReactAgent({
        llm,
        tools: this.availableTools,
        messageModifier: systemMessage,
      });

      const registryStats = dynamicToolLoader.getRegistryStats();
      log(
        `[ToolBuilderAgent] Initialized agent ${this.id} with ${this.availableTools.length} tools (${registryStats.totalTools} from registry)`
      );
    } catch (error) {
      const errorMsg =
        error && typeof error === 'object' && 'message' in error
          ? error.message
          : 'Unknown initialization error';
      logError(`[ToolBuilderAgent] Failed to initialize agent ${this.id}: ${errorMsg}`, error);
      throw new Error(`ToolBuilderAgent initialization failed: ${errorMsg}`);
    }
  }

  private createSystemMessage(): string {
    const toolNames = this.availableTools.map((t) => t.name).join(', ');
    const registryStats = dynamicToolLoader.getRegistryStats();

    return `You are an advanced AI agent with the ability to create custom tools when needed.

AVAILABLE TOOLS: ${toolNames}

TOOL CREATION CAPABILITY:
- You have access to a 'code_generator' tool that can create custom JavaScript tools
- Use this when existing tools cannot solve the task effectively
- Custom tools persist and can be reused for future similar tasks
- Currently ${registryStats.totalTools} custom tools in registry with ${(registryStats.averageSuccessRate * 100).toFixed(1)}% average success rate

WHEN TO CREATE NEW TOOLS:
1. Current tools cannot accomplish the task
2. Task requires specialized processing not available in existing tools  
3. You need a more efficient solution for a specific type of problem
4. Complex data transformations or calculations are needed

HOW TO CREATE TOOLS:
1. Use code_generator with these parameters:
   - taskDescription: Detailed description of what the tool should do
   - toolName: Unique name (alphanumeric + underscores only)
   - expectedInputs: Object describing input parameters and their types
   - expectedOutput: Description of expected output format

TOOL CREATION EXAMPLE:
To create a tool for calculating compound interest:
Use code_generator with:
{
  "taskDescription": "Calculate compound interest given principal, rate, time, and compounding frequency",
  "toolName": "compound_interest_calculator", 
  "expectedInputs": {"principal": "number", "rate": "number", "time": "number", "frequency": "number"},
  "expectedOutput": "JSON with final amount, interest earned, and calculation breakdown"
}

EXECUTION CONSTRAINTS:
- This is a ONE-SHOT task - you cannot ask for clarification
- Work with the information provided in the prompt
- Make reasonable assumptions if details seem incomplete
- Always provide complete responses
- If tool creation fails, continue with existing tools

IMPORTANT GUIDELINES:
1. Try existing tools first before creating new ones
2. Only create tools when genuinely needed for the specific task
3. Give tools descriptive, specific names
4. If a custom tool fails during execution, the entire task fails - so be careful
5. Custom tools should be focused on the specific task at hand

Always provide actionable, complete responses using the best available tools.`;
  }

  /**
   * Create agent-specific code generator tool with bound agent ID
   */
  private createAgentSpecificCodeGenerator(): DynamicTool {
    return new DynamicTool({
      name: 'code_generator',
      description:
        'Generate custom JavaScript tools for specific tasks when existing tools are insufficient. Call with JSON object containing: taskDescription (string), toolName (string), expectedInputs (object mapping param names to type descriptions), expectedOutput (string description).',
      func: async (input: any): Promise<string> => {
        try {
          log(`[AgentSpecificCodeGenerator] Agent ${this.id} calling code generator`);

          let params: any;

          // Handle different input formats from LangGraph
          if (typeof input === 'string') {
            try {
              params = JSON.parse(input);
            } catch (parseError) {
              const errorMsg = `Invalid JSON input: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`;
              return JSON.stringify({ success: false, error: errorMsg });
            }
          } else if (typeof input === 'object' && input !== null) {
            params = input;
          } else {
            const errorMsg = `Invalid input type: expected string (JSON) or object, got ${typeof input}`;
            return JSON.stringify({ success: false, error: errorMsg });
          }

          // Inject agent ID into parameters
          params.agentId = this.id;
          log(`[AgentSpecificCodeGenerator] Injected agent ID: ${this.id}`);

          // Call the actual code generator tool
          const generator = new CodeGeneratorTool();
          return await generator.invoke(params);
        } catch (error) {
          const errorMsg =
            error && typeof error === 'object' && 'message' in error
              ? error.message
              : 'Code generation failed';
          logError(
            `[AgentSpecificCodeGenerator] Agent ${this.id} tool generation failed: ${errorMsg}`
          );
          return JSON.stringify({ success: false, error: errorMsg });
        }
      },
    });
  }

  async handle(job: JobData): Promise<any> {
    try {
      // Wait for initialization to complete
      await this.initializationPromise;

      log(`[ToolBuilderAgent] Agent ${this.id} processing job`);

      // Extract the job prompt
      const prompt =
        typeof job.payload === 'string'
          ? job.payload
          : job.payload.prompt || JSON.stringify(job.payload);

      // Add agent context to the prompt for tool creation
      const contextualPrompt = `${prompt}

[AGENT_CONTEXT: You are agent ${this.id} with tool creation capabilities. Create custom tools if needed for this specific task.]`;

      // Invoke the agent with the prompt
      const result = await this.agent.invoke({
        messages: [{ role: 'user', content: contextualPrompt }],
      });

      // Extract the final response
      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];
      const response = lastMessage?.content || 'No response generated';

      // Check if new tools were created by looking for code_generator usage
      let newToolsCreated = false;
      let toolsUsed = false;

      for (const msg of messages) {
        if (msg.tool_calls || msg.additional_kwargs?.tool_calls) {
          toolsUsed = true;
          const toolCalls = msg.tool_calls || msg.additional_kwargs?.tool_calls || [];

          for (const call of toolCalls) {
            if (call.name === 'code_generator') {
              // Check if tool creation was actually successful
              try {
                log(
                  `[ToolBuilderAgent] Full tool call structure: ${JSON.stringify(call, null, 2)}`
                );

                // Try different possible output locations in LangGraph tool calls
                const outputStr = call.output || call.result || call.return_value || '{}';
                log(`[ToolBuilderAgent] Raw code_generator output: ${JSON.stringify(outputStr)}`);

                const result = JSON.parse(outputStr);
                log(`[ToolBuilderAgent] Parsed result: ${JSON.stringify(result)}`);

                if (result.success === true) {
                  newToolsCreated = true;
                  log(
                    `[ToolBuilderAgent] Agent ${this.id} successfully created tool: ${result.toolName || 'unknown'}`
                  );

                  // Reload tools to include newly created tool
                  await this.reloadTools();
                } else {
                  log(
                    `[ToolBuilderAgent] Agent ${this.id} attempted tool creation but failed: ${result.error || 'Unknown error'}`
                  );
                }
              } catch (parseError) {
                log(
                  `[ToolBuilderAgent] Agent ${this.id} called code_generator but couldn't parse result: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`
                );
              }
              break;
            }
          }
        }
      }

      log(
        `[ToolBuilderAgent] Agent ${this.id} completed job (tools used: ${toolsUsed}, new tools created: ${newToolsCreated})`
      );

      return {
        ok: true,
        artifact: response,
        stepsUsed: messages.length,
        archetype: this.archetype,
        toolsUsed,
        newToolsCreated,
        totalToolsAvailable: this.availableTools.length,
      };
    } catch (error) {
      const errorMsg =
        error && typeof error === 'object' && 'message' in error
          ? error.message
          : 'Unknown execution error';
      logError(`[ToolBuilderAgent] Agent ${this.id} failed: ${errorMsg}`, error);

      return {
        ok: false,
        artifact: `Tool builder agent execution failed: ${errorMsg}`,
        stepsUsed: 0,
        archetype: this.archetype,
        newToolsCreated: false,
      };
    }
  }

  /**
   * Reload tools to include newly created ones
   */
  private async reloadTools(): Promise<void> {
    try {
      // Get updated tools from loader
      const loadedTools = await dynamicToolLoader.loadToolsForAgent(this.id);

      // Convert to LangChain format and add to code generator
      const newLangChainTools = loadedTools.map((tool) => createLangChainTool(tool));
      const agentSpecificCodeGenerator = this.createAgentSpecificCodeGenerator();
      this.availableTools = [agentSpecificCodeGenerator, ...newLangChainTools];

      // Recreate agent with updated tools
      const llm = createVertexAILLM();
      const systemMessage = this.createSystemMessage();

      this.agent = createReactAgent({
        llm,
        tools: this.availableTools,
        messageModifier: systemMessage,
      });

      log(`[ToolBuilderAgent] Reloaded agent ${this.id} with ${this.availableTools.length} tools`);
    } catch (error) {
      const errorMsg =
        error && typeof error === 'object' && 'message' in error
          ? error.message
          : 'Unknown reload error';
      logError(
        `[ToolBuilderAgent] Failed to reload tools for agent ${this.id}: ${errorMsg}`,
        error
      );
    }
  }

  /**
   * Get agent statistics
   */
  getStats(): {
    agentId: string;
    archetype: string;
    totalTools: number;
    customToolsAvailable: number;
    registryStats: any;
  } {
    const registryStats = dynamicToolLoader.getRegistryStats();

    return {
      agentId: this.id,
      archetype: this.archetype,
      totalTools: this.availableTools.length,
      customToolsAvailable: registryStats.totalTools,
      registryStats,
    };
  }
}
