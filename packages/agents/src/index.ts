/**
 * Agents package exports - Simplified React Agent implementation
 */

// Simple React agents
export { SimpleReactAgent, createAgentForBlueprint } from './SimpleReactAgent';
export type { AgentArchetype } from './SimpleReactAgent';

// Simple job generation
export { simpleJobGenerator } from './simpleJobGenerator';
export type { SimpleJob } from './simpleJobGenerator';

// Core utilities (kept for compatibility)
export { memoryManager } from './agentMemory';

// Legacy exports (deprecated)
export { jobGenerator } from './jobGenerator';
export { LangGraphAgent } from './langgraph/LangGraphAgent';
