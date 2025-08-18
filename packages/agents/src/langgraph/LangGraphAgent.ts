/**
 * LangGraph Agent with Vertex AI Integration
 * Implements the plan-execute-reflect workflow using LangGraph
 */

import { JobData } from '@soup/common';
import { ChatVertexAI } from '@langchain/google-vertexai';
import { StateGraph, END, START } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';

import { AgentState, AgentStateType } from './agentState';
import { planNode, executeNode, reflectNode } from './nodes';
// Tools are imported and used in executeNode
import { memoryManager } from '../agentMemory';

// Initialize Vertex AI LLM
function createVertexAILLM() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const model = process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';
  const temperature = parseFloat(process.env.VERTEX_AI_TEMPERATURE || '0.7');
  const maxOutputTokens = parseInt(process.env.VERTEX_AI_MAX_OUTPUT_TOKENS || '1000');

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
  }

  console.log(
    `[LangGraphAgent] Initializing Vertex AI with model: ${model}, temperature: ${temperature}, maxTokens: ${maxOutputTokens}`
  );

  return new ChatVertexAI({
    model,
    temperature,
    maxOutputTokens,
    // Add authentication
    authOptions: {
      credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? undefined // Use file path
        : process.env.GOOGLE_CLOUD_CREDENTIALS
          ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
          : undefined,
    },
  });
}

// Create the workflow graph
function createAgentGraph() {
  const llm = createVertexAILLM();

  // Use plain LLM without tool binding (tools handled separately in executeNode)

  // Define the workflow nodes with LLM integration
  async function planWithLLM(state: AgentStateType): Promise<Partial<AgentStateType>> {
    // First get the planning messages
    const planResult = await planNode(state);

    // Then call the LLM to generate the actual plan
    const response = await llm.invoke(planResult.messages || []);

    // Parse the plan from the response
    let plan = null;
    try {
      // Extract JSON from the response
      const content = response.content as string;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        plan = JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('[LangGraph] Failed to parse plan:', error);
    }

    return {
      ...planResult,
      plan,
      messages: [...(planResult.messages || []), response],
    };
  }

  async function reflectWithLLM(state: AgentStateType): Promise<Partial<AgentStateType>> {
    // First get the reflection messages
    const reflectResult = await reflectNode(state);

    // Then call the LLM for deeper analysis (optional - can use basic reflection)
    // For now, we'll use the basic reflection to avoid additional LLM calls
    return reflectResult;
  }

  // Create the state graph
  const workflow = new StateGraph(AgentState)
    .addNode('planning', planWithLLM)
    .addNode('execute', executeNode)
    .addNode('reflect', reflectWithLLM)
    .addEdge(START, 'planning')
    .addEdge('planning', 'execute')
    .addEdge('execute', 'reflect')
    .addEdge('reflect', END);

  // Add memory for checkpoints
  const checkpointer = new MemorySaver();

  return workflow.compile({ checkpointer });
}

export class LangGraphAgent {
  private graph: ReturnType<typeof createAgentGraph>;
  public id: string;
  public temperature: number;
  public tools: string[];

  constructor(id: string, temperature: number, tools: string[]) {
    this.id = id;
    this.temperature = temperature;
    this.tools = tools;
    this.graph = createAgentGraph();
  }

  async handle(job: JobData) {
    try {
      // Get agent memory for context
      const memory = memoryManager.getMemory(this.id);
      const agentJobMemory = memory.recallAll();

      // Convert agentMemory format to LangGraph format
      const jobMemory = agentJobMemory.map((m) => ({
        category: m.category,
        payload: m.payload,
        success: m.success,
        artifact: m.artifact,
        stepsUsed: m.stepsUsed,
        planUsed: m.planUsed || 'No plan',
        adjustments: m.adjustments || [],
      }));

      // Initialize the agent state
      const initialState: AgentStateType = {
        agentId: this.id,
        jobData: job,
        messages: [],
        plan: null,
        toolResults: [],
        memory: jobMemory,
        finalResult: null,
        success: false,
        stepsUsed: 0,
        reflection: null,
        adjustments: [],
      };

      // Create thread configuration for this job execution
      const config: RunnableConfig = {
        configurable: { thread_id: `${this.id}-${Date.now()}` },
      };

      // Execute the workflow
      console.log(
        `[LangGraphAgent] Starting workflow for agent ${this.id}, job category: ${job.category}`
      );

      const result = await this.graph.invoke(initialState, config);

      console.log(
        `[LangGraphAgent] Workflow completed. Success: ${result.success}, Steps: ${result.stepsUsed}`
      );

      // Store the experience in memory
      memory.remember({
        category: job.category,
        payload: job.payload,
        success: result.success,
        artifact: result.finalResult || 'No result',
        stepsUsed: result.stepsUsed,
        planUsed: result.plan?.goal || 'No plan',
        adjustments: result.adjustments || [],
      });

      return {
        ok: result.success,
        artifact: result.finalResult || 'No result generated',
        stepsUsed: result.stepsUsed,
        planUsed: result.plan?.goal || 'No plan generated',
        adjustments: result.adjustments || [],
      };
    } catch (error) {
      console.error(`[LangGraphAgent] Agent ${this.id} failed:`, error);

      // Store failed experience
      const memory = memoryManager.getMemory(this.id);
      memory.remember({
        category: job.category,
        payload: job.payload,
        success: false,
        artifact: 'Agent execution failed',
        stepsUsed: 0,
        planUsed: 'No plan - execution failed',
        adjustments: ['Fix agent execution errors'],
      });

      return {
        ok: false,
        artifact: `Agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        stepsUsed: 0,
        planUsed: 'Failed to generate plan',
        adjustments: ['Investigate agent execution failures'],
      };
    }
  }

  // Method to check if Vertex AI is properly configured
  static isVertexAIConfigured(): boolean {
    return !!(
      process.env.GOOGLE_CLOUD_PROJECT &&
      (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_CREDENTIALS)
    );
  }
}
