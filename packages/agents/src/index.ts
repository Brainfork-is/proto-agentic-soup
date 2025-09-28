/**
 * Agents package exports - Simplified React Agent implementation
 */

// Simple React agents
export { SimpleReactAgent, createAgentForBlueprint } from './SimpleReactAgent';
export type { AgentArchetype } from './SimpleReactAgent';

// Job generation
export { jobGenerator } from './jobGenerator';
export type { Job } from './jobGenerator';

// LLM-based grading
export { llmGrader, LLMGrader } from './llmGrader';
export type { GradeResult } from './llmGrader';

// Name generation
export { NameGenerator } from './nameGenerator';
export type { AgentName } from './nameGenerator';

// Model preloading
export { ModelPreloader, preloadModels } from './llm/modelPreloader';
export type { PreloadOptions, PreloadResult } from './llm/modelPreloader';

// Tool Builder Agent
export { ToolBuilderAgent } from './ToolBuilderAgent';
export { codeGeneratorTool } from './tools/codeGenerator';
export { dynamicToolLoader } from './tools/dynamicToolLoader';
export { toolValidator } from './tools/toolValidator';

// Swarm Agent
export { SwarmAgent, createSwarmAgent } from './SwarmAgent';
export type { SwarmConfig, SwarmMember } from './SwarmAgent';

// Core utilities (kept for compatibility)
export { memoryManager } from './agentMemory';

export { PatchedChatVertexAI } from './patchedVertexAI';
