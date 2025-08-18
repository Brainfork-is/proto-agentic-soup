/**
 * LangGraph Agent State Definitions
 * Defines the state shape that flows through the agent graph
 */

import { Annotation } from '@langchain/langgraph';
import { JobData } from '@soup/common';

// Define the structure of a tool execution result
export interface ToolResult {
  tool: string;
  input: any;
  output: any;
  success: boolean;
  error?: string;
  stepsUsed?: number;
  duration?: number;
}

// Define the structure of an execution plan
export interface ExecutionPlan {
  goal: string;
  steps: Array<{
    action: string;
    tool: string;
    params: any;
    reasoning: string;
  }>;
  strategy?: string;
}

// Define job memory for learning
export interface JobMemory {
  category: string;
  payload: any;
  success: boolean;
  artifact: any;
  stepsUsed: number;
  timestamp: Date;
  planUsed?: string;
  adjustments?: string[];
}

// Create the state annotation for LangGraph
export const AgentStateAnnotation = Annotation.Root({
  // Agent identity
  agentId: Annotation<string>,
  temperature: Annotation<number>,
  availableTools: Annotation<string[]>,

  // Current job
  jobData: Annotation<JobData | null>,

  // Planning phase
  plan: Annotation<ExecutionPlan | null>,

  // Execution phase
  currentStep: Annotation<number>,
  toolResults: Annotation<ToolResult[]>,
  totalStepsUsed: Annotation<number>,

  // Reflection phase
  reflection: Annotation<string | null>,
  finalOutput: Annotation<any>,
  success: Annotation<boolean>,

  // Memory and learning
  memory: Annotation<JobMemory[]>,

  // Control flow
  checkpoint: Annotation<string>,
  retryCount: Annotation<number>,
  error: Annotation<string | null>,
});

// Type alias for easier use
export type AgentState = typeof AgentStateAnnotation.State;

// Initial state factory
export function createInitialState(
  agentId: string,
  temperature: number,
  availableTools: string[],
  jobData?: JobData
): AgentState {
  return {
    agentId,
    temperature,
    availableTools,
    jobData: jobData || null,
    plan: null,
    currentStep: 0,
    toolResults: [],
    totalStepsUsed: 0,
    reflection: null,
    finalOutput: null,
    success: false,
    memory: [],
    checkpoint: 'start',
    retryCount: 0,
    error: null,
  };
}
