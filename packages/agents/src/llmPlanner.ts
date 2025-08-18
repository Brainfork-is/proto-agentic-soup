/**
 * LLM-powered planner implementing the Plan-Act-Reflect pattern
 * Uses Google Vertex AI for intelligent planning and reflection
 */

import { Plan, PlanStep, ExecutionResult } from './mockPlanner';
import { llmProvider } from './llmProvider';
import { memoryManager } from './agentMemory';
import fs from 'fs';
import path from 'path';

// Debug logger for LLM planner issues
class LLMDebugLogger {
  private static instance: LLMDebugLogger;
  private logFile: string;

  constructor() {
    this.logFile = path.join(process.cwd(), 'llm-debug.log');
    this.log('='.repeat(80));
    this.log(`LLM Debug log started at ${new Date().toISOString()}`);
    this.log('='.repeat(80));
  }

  static getInstance(): LLMDebugLogger {
    if (!LLMDebugLogger.instance) {
      LLMDebugLogger.instance = new LLMDebugLogger();
    }
    return LLMDebugLogger.instance;
  }

  log(message: string) {
    const timestamp = new Date().toISOString().substring(11, 23);
    const logLine = `[${timestamp}] ${message}`;

    // Write to console and file
    console.log(logLine);
    try {
      fs.appendFileSync(this.logFile, logLine + '\n');
    } catch (error) {
      // Ignore file write errors
    }
  }
}

const llmDebugLogger = LLMDebugLogger.getInstance();

export class LLMPlanner {
  private temperature: number;
  private availableTools: string[];
  private agentId: string;

  constructor(temperature: number = 0.5, tools: string[] = [], agentId: string = 'unknown') {
    this.temperature = temperature;
    this.availableTools = tools;
    this.agentId = agentId;
  }

  /**
   * Plan phase: Create a plan using LLM reasoning
   */
  async plan(category: string, payload: any): Promise<Plan> {
    const prompt = this.buildPlanningPrompt(category, payload);

    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: this.temperature,
        maxTokens: 1200,
      },
      this.agentId
    );

    if (!response) {
      llmDebugLogger.log(
        `[LLMPlanner] Agent ${this.agentId}: LLM planning failed - no response from provider`
      );
      throw new Error('LLM planning failed - no response from provider');
    }

    try {
      const plan = this.parsePlanResponse(response.content, category, payload);
      llmDebugLogger.log(
        `[LLMPlanner] Agent ${this.agentId}: Generated LLM plan for ${category} using ${response.provider}`
      );
      return plan;
    } catch (error) {
      llmDebugLogger.log(`[LLMPlanner] Agent ${this.agentId}: Failed to parse LLM plan`);
      llmDebugLogger.log(`[LLMPlanner] LLM Response Length: ${response.content.length} chars`);
      llmDebugLogger.log(`[LLMPlanner] Full LLM Response: ${response.content}`);
      llmDebugLogger.log(`[LLMPlanner] Parse Error: ${(error as Error).message}`);
      throw error; // Let it fail gracefully
    }
  }

  /**
   * Reflection phase: Analyze execution results using LLM
   */
  async reflect(
    plan: Plan,
    results: ExecutionResult[]
  ): Promise<{
    success: boolean;
    finalResult: any;
    adjustments?: string[];
  }> {
    const prompt = this.buildReflectionPrompt(plan, results);

    const response = await llmProvider.generateContent(
      {
        prompt,
        temperature: this.temperature * 0.8, // Slightly lower temperature for reflection
        maxTokens: 600,
      },
      this.agentId
    );

    if (!response) {
      llmDebugLogger.log(
        `[LLMPlanner] Agent ${this.agentId}: LLM reflection failed - no response from provider`
      );
      throw new Error('LLM reflection failed - no response from provider');
    }

    try {
      const reflection = this.parseReflectionResponse(response.content, results);
      llmDebugLogger.log(
        `[LLMPlanner] Agent ${this.agentId}: Generated LLM reflection using ${response.provider}`
      );
      return reflection;
    } catch (error) {
      llmDebugLogger.log(`[LLMPlanner] Agent ${this.agentId}: Failed to parse LLM reflection`);
      llmDebugLogger.log(`[LLMPlanner] Reflection Error: ${(error as Error).message}`);
      throw error; // Let it fail gracefully
    }
  }

  private buildPlanningPrompt(category: string, payload: any): string {
    const toolsStr = this.availableTools.join(', ');
    const memory = memoryManager.getMemory(this.agentId);
    const memoryContext = memory.generateContext();

    return `You are an AI agent with temperature ${this.temperature.toFixed(2)} planning how to complete a task.

AGENT MEMORY:
${memoryContext}

Based on your past experience, plan accordingly.

AVAILABLE TOOLS: ${toolsStr}
⚠️  CRITICAL: You can ONLY use tools from the AVAILABLE TOOLS list above. Do NOT use any other tools.

TASK CATEGORY: ${category}
TASK PAYLOAD: ${JSON.stringify(payload, null, 2)}

TOOL CAPABILITIES:
- browser: Navigate web pages, extract content. REQUIRED: {"url": "...", "steps": [...]}
- stringKit: Summarize or classify text. REQUIRED: {"text": "...", "mode": "summarize"|"classify"}
- calc: Evaluate math expressions. REQUIRED: {"expr": "..."}
- retrieval: Search knowledge base. REQUIRED: {"query": "..."}

⚠️  CRITICAL RULES:
1. Every step MUST use a tool from your AVAILABLE TOOLS: ${toolsStr}
2. Browser tool MUST always include "url" parameter
3. All params must be properly formatted with required properties
4. Use double quotes for ALL strings and property names

CORRECT JSON examples (copy exactly):
- Browser: {"tool": "browser", "params": {"url": "https://example.com", "steps": [{"type": "wait", "ms": 1000}]}}
- StringKit: {"tool": "stringKit", "params": {"text": "some text", "mode": "summarize", "maxWords": 10}}
- Calc: {"tool": "calc", "params": {"expr": "2 + 2"}}
- Retrieval: {"tool": "retrieval", "params": {"query": "search term"}}

Respond with a JSON object in this exact format:
{
  "goal": "Brief description of what you're trying to achieve",
  "steps": [
    {
      "action": "Description of this step",
      "tool": "tool_name",
      "params": {...},
      "reasoning": "Why this step is needed"
    }
  ],
  "context": {"strategy": "your overall approach"}
}`;
  }

  private buildReflectionPrompt(plan: Plan, results: ExecutionResult[]): string {
    const resultsStr = results
      .map(
        (r, i) =>
          `Step ${i + 1}: ${r.success ? 'SUCCESS' : 'FAILED'} - ${r.error || JSON.stringify(r.result)}`
      )
      .join('\n');

    return `You are an AI agent reflecting on the execution of your plan.

ORIGINAL GOAL: ${plan.goal}

EXECUTION RESULTS:
${resultsStr}

Analyze whether the plan succeeded overall and extract the final result. If there were failures, suggest what could be improved.

Respond with a JSON object in this exact format:
{
  "success": true/false,
  "finalResult": "the main output/answer from the execution",
  "adjustments": ["suggestion 1", "suggestion 2"] (optional, if improvements needed)
}`;
  }

  private sanitizeJSON(jsonStr: string): string {
    // Fix common LLM JSON formatting issues
    let sanitized = jsonStr
      // Fix nested quotes in params field - specifically for the stringKit case
      .replace(/"params":\s*\{([^}]*)\\"([^}]*)\\"([^}]*)\}/g, '"params": {$1$2$3}')
      // Fix the specific issue where stringKit params have escaped quotes
      .replace(/"params":\s*\{\s*"text":\s*\\"([^"]*)\\"([^}]*)\}/g, '"params": {"text": "$1"$2}')
      .replace(/"mode":\s*\\"([^"]*)\\"([^}]*)/g, '"mode": "$1"$2')
      // Fix escaped quotes within string values
      .replace(/\\"([^"]*?)\\"/g, '$1')
      // Fix single quotes around string values
      .replace(/'([^']*?)'/g, '"$1"')
      // Fix unquoted property names (but be careful with nested objects)
      .replace(/(\w+):\s*(["{[])/g, '"$1": $2')
      // Fix unquoted property names followed by strings
      .replace(/(\w+):\s*'([^']*)'/g, '"$1": "$2"')
      // Fix type: 'wait' patterns specifically
      .replace(/type:\s*'(\w+)'/g, '"type": "$1"')
      .replace(/mode:\s*'(\w+)'/g, '"mode": "$1"')
      // Fix empty tool names
      .replace(/"tool":\s*"",/g, '"tool": "unknown",')
      // Fix empty query params
      .replace(/"query":\s*""/g, '"query": "search"')
      // Fix empty expr params
      .replace(/"expr":\s*""/g, '"expr": "1+1"')
      // Fix browser steps missing URL
      .replace(/"params":\s*\{\s*"steps":/g, '"params": {"url": "https://example.com", "steps":')
      // Fix missing commas between object properties
      .replace(/"\s*([}\]])([^,\s])/g, '"$1,$2')
      .replace(/([^,\s])\s*"([^"]*)":\s*"/g, '$1, "$2": "')
      // Fix trailing commas
      .replace(/,(\s*[}\]])/g, '$1')
      // Clean up any double-double quotes that might have been created
      .replace(/""/g, '"')
      // Remove control characters that break JSON
      .replace(/[\x00-\x1F\x7F]/g, ''); // eslint-disable-line no-control-regex

    // Additional validation and aggressive fixes
    try {
      JSON.parse(sanitized);
      return sanitized;
    } catch (error) {
      // More aggressive structural fixes
      sanitized = sanitized
        // Fix common comma issues around position markers
        .replace(/("reasoning":\s*"[^"]*")\s*([}\]])/g, '$1$2')
        .replace(/("context":\s*\{[^}]*\})\s*([}\]])/g, '$1$2')
        // Ensure proper object closure
        .replace(/\s*$/, '')
        // Remove invalid trailing content
        .replace(/\}[^}]*$/, '}');

      // Final attempt - if still broken, throw the error
      try {
        JSON.parse(sanitized);
        return sanitized;
      } catch (finalError) {
        llmDebugLogger.log(`[LLMPlanner] JSON sanitization failed completely`);
        throw finalError; // Let it fail gracefully instead of using fallback
      }
    }
  }

  private parsePlanResponse(content: string, _category: string, _payload: any): Plan {
    // Extract JSON from response - handle markdown code blocks and other formats
    let jsonStr = '';

    // Try to extract from markdown code block first (with or without json specifier)
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    } else {
      // Fall back to finding the first JSON object between braces
      const jsonMatch = content.match(/\{[\s\S]*?\}(?=\s*$|\s*```|\s*Note:|\s*\n\n)/);
      if (!jsonMatch) {
        throw new Error('No JSON found in plan response');
      }
      jsonStr = jsonMatch[0];
    }

    // Sanitize common JSON formatting issues
    jsonStr = this.sanitizeJSON(jsonStr);

    const planData = JSON.parse(jsonStr);

    // Validate required fields
    if (!planData.goal || !planData.steps || !Array.isArray(planData.steps)) {
      throw new Error('Invalid plan structure');
    }

    // Validate steps and filter out tools not available to this agent
    llmDebugLogger.log(
      `[LLMPlanner] Agent ${this.agentId}: Available tools: [${this.availableTools.join(', ')}]`
    );
    llmDebugLogger.log(
      `[LLMPlanner] Agent ${this.agentId}: Plan has ${planData.steps.length} steps`
    );

    const validSteps = planData.steps.filter((step: any, index: number) => {
      llmDebugLogger.log(
        `[LLMPlanner] Step ${index + 1}: tool="${step.tool}", action="${step.action}", params=${step.params ? 'present' : 'missing'}`
      );

      if (
        !step.tool ||
        step.tool === '' ||
        step.tool === 'unknown' ||
        !this.availableTools.includes(step.tool)
      ) {
        llmDebugLogger.log(
          `[LLMPlanner] ❌ Skipping step ${index + 1} with unavailable tool: ${step.tool || 'empty'}`
        );
        return false;
      }

      if (!step.action || !step.params) {
        llmDebugLogger.log(`[LLMPlanner] ❌ Skipping step ${index + 1} missing action or params`);
        return false;
      }

      llmDebugLogger.log(`[LLMPlanner] ✅ Step ${index + 1} is valid`);
      return true;
    });

    if (validSteps.length === 0) {
      throw new Error('No valid steps in plan');
    }

    return {
      goal: planData.goal,
      steps: validSteps as PlanStep[],
      context: planData.context || {},
    };
  }

  private parseReflectionResponse(
    content: string,
    _results: ExecutionResult[]
  ): {
    success: boolean;
    finalResult: any;
    adjustments?: string[];
  } {
    // Extract JSON from response - handle markdown code blocks and other formats
    let jsonStr = '';

    // Try to extract from markdown code block first
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    } else {
      // Fall back to finding the first JSON object between braces
      const jsonMatch = content.match(/\{[\s\S]*?\}(?=\s*$|\s*```|\s*Note:|\s*\n\n)/);
      if (!jsonMatch) {
        throw new Error('No JSON found in reflection response');
      }
      jsonStr = jsonMatch[0];
    }

    // Sanitize common JSON formatting issues
    jsonStr = this.sanitizeJSON(jsonStr);

    const reflectionData = JSON.parse(jsonStr);

    // Validate required fields
    if (typeof reflectionData.success !== 'boolean' || !reflectionData.finalResult) {
      throw new Error('Invalid reflection structure');
    }

    return {
      success: reflectionData.success,
      finalResult: reflectionData.finalResult,
      adjustments: reflectionData.adjustments || [],
    };
  }
}
