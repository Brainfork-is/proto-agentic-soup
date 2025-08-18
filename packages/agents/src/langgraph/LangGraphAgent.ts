/**
 * LangGraph-based Agent Implementation
 * Replaces SimpleAgent with a graph-based architecture
 */

import { StateGraph, END } from '@langchain/langgraph';
import { JobData } from '@soup/common';
import { AgentStateAnnotation, AgentState, createInitialState } from './agentState';
import { planNode, executeNode, reflectNode } from './nodes';
import { memoryManager } from '../agentMemory';

export class LangGraphAgent {
  id: string;
  temperature: number;
  tools: string[];
  private graph: any;

  constructor(id: string, temperature: number, tools: string[]) {
    this.id = id;
    this.temperature = temperature;
    this.tools = tools;

    // Build the graph
    this.graph = this.buildGraph();
  }

  private buildGraph() {
    // Create a new state graph with our annotation
    const workflow = new StateGraph(AgentStateAnnotation)
      // Add nodes
      .addNode('planning', planNode)
      .addNode('execute', executeNode)
      .addNode('reflect', reflectNode)

      // Define edges
      .addEdge('__start__', 'planning')
      .addConditionalEdges('planning', this.routeAfterPlan.bind(this))
      .addConditionalEdges('execute', this.routeAfterExecute.bind(this))
      .addConditionalEdges('reflect', this.routeAfterReflect.bind(this));

    // Compile the graph
    return workflow.compile();
  }

  // Routing logic after planning
  private routeAfterPlan(state: AgentState): string {
    if (state.error && state.retryCount < 3) {
      console.log(`[LangGraphAgent] Retrying planning (attempt ${state.retryCount + 1})`);
      return 'planning'; // Retry planning
    }

    if (!state.plan || state.error) {
      return END; // Failed to plan
    }

    return 'execute'; // Proceed to execution
  }

  // Routing logic after execution
  private routeAfterExecute(state: AgentState): string {
    // Check if we need to execute more steps
    if (state.plan && state.currentStep < state.plan.steps.length) {
      return 'execute'; // Continue executing steps
    }

    // Check if execution failed and we should retry
    const hasErrors = state.toolResults.some((r) => !r.success);
    if (hasErrors && state.retryCount < 2) {
      console.log(`[LangGraphAgent] Execution had errors, replanning`);
      return 'planning'; // Retry with new plan
    }

    return 'reflect'; // Move to reflection
  }

  // Routing logic after reflection
  private routeAfterReflect(state: AgentState): string {
    return END; // Always end after reflection
  }

  async handle(job: JobData) {
    try {
      console.log(`[LangGraphAgent] Agent ${this.id} handling ${job.category} job`);

      // Create initial state
      const initialState = createInitialState(this.id, this.temperature, this.tools, job);

      // Run the graph
      const finalState = await this.graph.invoke(initialState);

      // Store experience in memory
      if (finalState.memory && finalState.memory.length > 0) {
        const latestMemory = finalState.memory[finalState.memory.length - 1];
        const memory = memoryManager.getMemory(this.id);
        memory.remember({
          category: latestMemory.category,
          payload: latestMemory.payload,
          success: latestMemory.success,
          artifact: latestMemory.artifact,
          stepsUsed: latestMemory.stepsUsed,
          planUsed: latestMemory.planUsed,
          adjustments: latestMemory.adjustments,
        });
      }

      // Return result in expected format
      return {
        ok: finalState.success || false,
        artifact: finalState.finalOutput || '',
        stepsUsed: finalState.totalStepsUsed || 0,
        planUsed: finalState.plan?.goal,
        adjustments: finalState.memory?.[finalState.memory.length - 1]?.adjustments,
      };
    } catch (error) {
      console.error(`[LangGraphAgent] Agent ${this.id} failed to handle job:`, error);
      throw error;
    }
  }

  // Stream execution for debugging
  async *stream(job: JobData) {
    console.log(`[LangGraphAgent] Agent ${this.id} streaming ${job.category} job`);

    // Create initial state
    const initialState = createInitialState(this.id, this.temperature, this.tools, job);

    // Stream the graph execution
    for await (const chunk of await this.graph.stream(initialState)) {
      yield chunk;
    }
  }
}
