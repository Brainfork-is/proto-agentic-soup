import { GeneratedToolRequest } from './tools/codeGenerator';

export interface AvailableToolSummary {
  name: string;
  description?: string;
}

export interface BuilderPlan {
  rationale: string;
  reuseTool?: string;
  createTool?: GeneratedToolRequest;
  executionArgs?: Record<string, unknown>;
}

export interface BuilderContext {
  jobPrompt: string;
  availableTools: AvailableToolSummary[];
  strictMode: boolean;
  registrySuccessRate: number;
}

export interface RunnerInput {
  toolName: string;
  args: Record<string, unknown>;
  jobPrompt: string;
  builderRationale: string;
}

export interface RunnerResult {
  ok: boolean;
  toolName: string;
  args: Record<string, unknown>;
  toolOutput: string;
  finalResponse: string;
  executionMs: number;
  summarySource: 'llm' | 'fallback';
  error?: string;
}
