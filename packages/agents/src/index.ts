/**
 * Agents package exports - Simplified React Agent implementation
 */

// Simple React agents
export { SimpleReactAgent, createAgentForBlueprint } from './SimpleReactAgent';
export type { AgentArchetype } from './SimpleReactAgent';

// Simple job generation
export { simpleJobGenerator } from './simpleJobGenerator';
export type { SimpleJob } from './simpleJobGenerator';

// LLM-based grading
export { llmGrader, LLMGrader } from './llmGrader';
export type { GradeResult } from './llmGrader';

// Tool Builder Agent
export { ToolBuilderAgent } from './ToolBuilderAgent';
export { codeGeneratorTool } from './tools/codeGenerator';
export { dynamicToolLoader } from './tools/dynamicToolLoader';
export { toolValidator } from './tools/toolValidator';

// Core utilities (kept for compatibility)
export { memoryManager } from './agentMemory';

// Legacy exports (deprecated)
export { jobGenerator } from './jobGenerator';
export { LangGraphAgent } from './langgraph/LangGraphAgent';
