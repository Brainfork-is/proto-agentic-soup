/**
 * Execution Node for LangGraph Agent
 * Executes tools based on the plan
 */

import { AgentState, ToolResult } from '../agentState';
import { Tools } from '../../tools';

export async function executeNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[ExecuteNode] Agent ${state.agentId}: Starting execution`);
  
  if (!state.plan) {
    return {
      error: 'No plan to execute',
      checkpoint: 'failed',
    };
  }

  const toolResults: ToolResult[] = [...state.toolResults];
  let totalStepsUsed = state.totalStepsUsed;
  
  try {
    // Execute the current step
    const currentStep = state.plan.steps[state.currentStep];
    console.log(
      `[ExecuteNode] Agent ${state.agentId}: Executing step ${state.currentStep + 1}/${state.plan.steps.length} - ${currentStep.action}`
    );

    const startTime = Date.now();
    const result = await executeToolStep(currentStep, state.agentId);
    const duration = Date.now() - startTime;

    // Record the result
    const toolResult: ToolResult = {
      tool: currentStep.tool,
      input: currentStep.params,
      output: result.output,
      success: result.success,
      error: result.error,
      stepsUsed: result.stepsUsed || 0,
      duration,
    };
    
    toolResults.push(toolResult);
    totalStepsUsed += result.stepsUsed || 0;

    // Check if there are more steps
    const nextStep = state.currentStep + 1;
    const hasMoreSteps = nextStep < state.plan.steps.length;

    return {
      toolResults,
      totalStepsUsed,
      currentStep: nextStep,
      checkpoint: hasMoreSteps ? 'executing' : 'executed',
      error: null,
    };
  } catch (error) {
    console.error(`[ExecuteNode] Agent ${state.agentId}: Execution failed`, error);
    
    return {
      toolResults,
      totalStepsUsed,
      error: error instanceof Error ? error.message : 'Execution failed',
      checkpoint: 'failed',
      retryCount: state.retryCount + 1,
    };
  }
}

async function executeToolStep(
  step: any,
  agentId: string
): Promise<{ output: any; success: boolean; error?: string; stepsUsed?: number }> {
  try {
    let result: any;
    
    switch (step.tool) {
      case 'browser':{
        result = await Tools.browser(step.params as { url: string; steps: any[] });
        return {
          output: result,
          success: !result.error,
          error: result.error,
          stepsUsed: result.stepsUsed || 0,
        };
        
      case 'stringKit':{
        result = await Tools.stringKit(
          step.params as {
            text: string;
            mode: 'summarize' | 'classify';
            labels?: string[];
            maxWords?: number;
          },
          agentId
        );
        return {
          output: result,
          success: !result.error,
          error: result.error,
        };
        
      case 'calc':{
        result = await Tools.calc(step.params as { expr: string });
        return {
          output: result,
          success: result.ok,
          error: result.ok ? undefined : 'Calculation failed',
        };
        
      case 'retrieval':{
        result = await Tools.retrieval(
          step.params as {
            query: string;
            useKnowledgeServer?: boolean;
          }
        );
        return {
          output: result,
          success: !result.error,
          error: result.error,
        };
        
      default:
        return {
          output: null,
          success: false,
          error: `Unknown tool: ${step.tool}`,
        };
    }
  } catch (error) {
    return {
      output: null,
      success: false,
      error: error instanceof Error ? error.message : 'Tool execution failed',
    };
  }
}