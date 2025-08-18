/**
 * LangGraph Agent State Definition
 * Defines the state structure for our agent workflow
 */

import { JobData } from '@soup/common';
import { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';

// Job memory entry for tracking past performance
export interface JobMemory {
  category: string;
  payload: any;
  success: boolean;
  artifact: string;
  stepsUsed: number;
  planUsed: string;
  adjustments: string[];
}

// Tool execution result
export interface ToolResult {
  tool: string;
  success: boolean;
  result: any;
  error?: string;
  stepsUsed?: number;
}

// Agent plan structure
export interface AgentPlan {
  goal: string;
  steps: Array<{
    tool: string;
    params: Record<string, any>;
    reasoning: string;
  }>;
}

// Main agent state - this flows through the graph
export const AgentState = Annotation.Root({
  // Core job information
  agentId: Annotation<string>(),
  jobData: Annotation<JobData>(),

  // Message history for LLM conversation
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  // Agent planning and execution
  plan: Annotation<AgentPlan | null>(),

  // Tool execution results
  toolResults: Annotation<ToolResult[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  // Agent memory context
  memory: Annotation<JobMemory[]>(),

  // Final result and metadata
  finalResult: Annotation<string | null>(),

  success: Annotation<boolean>(),

  stepsUsed: Annotation<number>(),

  // Reflection and learning
  reflection: Annotation<string | null>(),

  adjustments: Annotation<string[]>(),
});

export type AgentStateType = typeof AgentState.State;
