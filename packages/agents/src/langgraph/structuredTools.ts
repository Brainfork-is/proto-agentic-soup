/**
 * Structured Tools for LangGraph Agent
 * Replaces complex JSON parsing with type-safe tool definitions
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Browser tool schema
const browserToolSchema = z.object({
  url: z.string().url().describe('The URL to navigate to'),
  steps: z.array(z.object({
    type: z.enum(['wait', 'extract', 'click', 'type']).describe('Action type'),
    ms: z.number().optional().describe('Wait time in milliseconds'),
    selector: z.string().optional().describe('CSS selector for element'),
    text: z.string().optional().describe('Text to type'),
  })).describe('Array of browser automation steps'),
});

// StringKit tool schema
const stringKitToolSchema = z.object({
  text: z.string().describe('Text to process'),
  mode: z.enum(['summarize', 'classify']).describe('Processing mode'),
  maxWords: z.number().optional().describe('Maximum words for summary'),
  labels: z.array(z.string()).optional().describe('Classification labels'),
});

// Calculator tool schema
const calcToolSchema = z.object({
  expr: z.string().describe('Mathematical expression to evaluate'),
});

// Retrieval tool schema
const retrievalToolSchema = z.object({
  query: z.string().describe('Search query for knowledge base'),
  useKnowledgeServer: z.boolean().optional().describe('Whether to use knowledge server'),
});

// Plan generation schema
export const planGenerationSchema = z.object({
  goal: z.string().describe('Brief description of what you\'re trying to achieve'),
  steps: z.array(z.object({
    action: z.string().describe('Description of this step'),
    tool: z.enum(['browser', 'stringKit', 'calc', 'retrieval']).describe('Tool to use'),
    params: z.record(z.any()).describe('Parameters for the tool'),
    reasoning: z.string().describe('Why this step is needed'),
  })).describe('Array of execution steps'),
  strategy: z.string().describe('Overall approach to the task'),
});

// Reflection schema
export const reflectionSchema = z.object({
  success: z.boolean().describe('Whether the plan succeeded overall'),
  finalResult: z.string().describe('The main output/answer from execution'),
  adjustments: z.array(z.string()).optional().describe('Suggestions for improvement'),
});

// For now, we'll use the schemas for validation but create simpler tool wrappers
// This avoids the complex union type issues while still providing structured validation

export function validateToolParams(toolName: string, params: any): boolean {
  try {
    switch (toolName) {
      case 'browser':{
        browserToolSchema.parse(params);
        return true;
      case 'stringKit':{
        stringKitToolSchema.parse(params);
        return true;
      case 'calc':{
        calcToolSchema.parse(params);
        return true;
      case 'retrieval':{
        retrievalToolSchema.parse(params);
        return true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}