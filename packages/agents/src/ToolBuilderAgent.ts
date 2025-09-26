/**
 * Tool Builder Agent - Orchestrates tool creation and execution without LangChain's React agent.
 */

import { JobData, log, logError } from '@soup/common';
import { CodeGeneratorTool } from './tools/codeGenerator';
import { dynamicToolLoader } from './tools/dynamicToolLoader';
import { builderPlan } from './toolBuilder/builder';
import { runnerExecute } from './toolBuilder/runner';
import { createToolBuilderLLM } from './toolBuilder/llm';
import {
  extractErrorMessage,
  normalizeCodeGeneratorRequest,
  sanitizeToolInput,
  toStringContent,
} from './toolBuilder/utils';
import { AvailableToolSummary } from './types';
import { ToolMemoryService, AgentMemoryService } from './memory';

export class ToolBuilderAgent {
  private availableTools: AvailableToolSummary[] = [];
  private initializationPromise: Promise<void>;
  public id: string;
  public archetype = 'tool-builder';
  private strictModeEnabled: boolean;
  private toolMemory: ToolMemoryService;
  private agentMemory: AgentMemoryService;

  constructor(id: string) {
    this.id = id;
    const strictEnv = (process.env.TOOL_BUILDER_STRICT_MODE || 'true').toLowerCase();
    this.strictModeEnabled = !(strictEnv === '0' || strictEnv === 'false' || strictEnv === 'off');

    // Initialize memory services
    this.toolMemory = ToolMemoryService.getInstance();
    this.agentMemory = AgentMemoryService.getInstance();

    log(`[ToolBuilderAgent] Constructor called for agent ${id} with memory enabled`);
    this.initializationPromise = this.initializeAgent();
  }

  private async initializeAgent() {
    try {
      await this.reloadTools();
      log(
        `[ToolBuilderAgent] Initialized agent ${this.id} with ${this.availableTools.length} tools`
      );
    } catch (error) {
      const errorMsg = extractErrorMessage(error, 'Unknown initialization error');
      logError(`[ToolBuilderAgent] Failed to initialize agent ${this.id}: ${errorMsg}`, error);
      throw new Error(`ToolBuilderAgent initialization failed: ${errorMsg}`);
    }
  }

  private async reloadTools(): Promise<void> {
    try {
      const loadedTools = await dynamicToolLoader.loadToolsForAgent(this.id);
      this.availableTools = loadedTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));
    } catch (error) {
      const errorMsg = extractErrorMessage(error, 'Unknown reload error');
      logError(`[ToolBuilderAgent] Failed to reload tools for agent ${this.id}: ${errorMsg}`);
    }
  }

  /**
   * Check memory for existing tools that could handle this job before creating new ones
   */
  private async checkMemoryForSuitableTools(
    jobPrompt: string,
    jobCategory: string
  ): Promise<string | null> {
    try {
      // First, try to find tools by category
      const categoryTools = await this.toolMemory.findTools(this.id, {
        category: jobCategory,
        minSuccessCount: 1,
        minQuality: 0.3,
        limit: 3,
      });

      if (categoryTools.length > 0) {
        log(
          `[ToolBuilderAgent] Found ${categoryTools.length} existing tools for category ${jobCategory}`
        );
        // Return the best performing tool
        return categoryTools[0].toolName;
      }

      // If no category match, try similarity search
      const similarTools = await this.toolMemory.findSimilarTools(this.id, jobPrompt, 3);

      if (similarTools.length > 0) {
        // Only use tools that have proven success
        const provenTools = similarTools.filter(
          (tool) => tool.successCount > 0 && tool.avgQuality > 0.3
        );
        if (provenTools.length > 0) {
          log(`[ToolBuilderAgent] Found ${provenTools.length} similar tools with proven success`);
          return provenTools[0].toolName;
        }
      }

      return null;
    } catch (error) {
      logError(`[ToolBuilderAgent] Failed to check memory for suitable tools:`, error);
      return null;
    }
  }

  async handle(job: JobData & { dbJobId?: string }): Promise<any> {
    await this.initializationPromise;

    const jobPrompt =
      typeof job.payload === 'string'
        ? job.payload
        : job.payload.prompt || JSON.stringify(job.payload);
    const jobId = (job as any).dbJobId || 'unknown';

    try {
      // First, check memory for existing tools before going through the planning process
      const memoryTool = await this.checkMemoryForSuitableTools(
        jobPrompt,
        job.category || 'general'
      );

      const registryStats = dynamicToolLoader.getRegistryStats();
      const plan = await builderPlan(
        {
          jobPrompt,
          availableTools: this.availableTools,
          strictMode: this.strictModeEnabled,
          registrySuccessRate: registryStats.averageSuccessRate || 0,
        },
        createToolBuilderLLM
      );

      let newToolsCreated = false;
      let toolUsed = plan.reuseTool?.trim() || '';

      // Prefer memory tool over plan suggestion if memory found a proven tool
      if (memoryTool && !toolUsed) {
        toolUsed = memoryTool;
        log(`[ToolBuilderAgent] Using tool from memory: ${memoryTool}`);
      }

      if (plan.createTool) {
        const normalized = normalizeCodeGeneratorRequest({
          ...(plan.createTool as unknown as Record<string, unknown>),
          agentId: this.id,
        });
        const generator = new CodeGeneratorTool();
        log(
          `[ToolBuilderAgent] Job ${jobId} generating tool ${normalized.toolName} with description: ${normalized.taskDescription}`
        );
        const raw = await generator.invoke(normalized);
        const parsed = JSON.parse(raw || '{}');
        if (
          !parsed ||
          parsed.success !== true ||
          typeof parsed.toolName !== 'string' ||
          parsed.toolName.length === 0
        ) {
          throw new Error(parsed?.error || 'Tool generation failed');
        }
        toolUsed = parsed.toolName;
        newToolsCreated = true;
        await this.reloadTools();

        // Store the newly created tool in memory
        try {
          await this.toolMemory.saveTool(
            this.id,
            toolUsed,
            'Generated tool code', // We'll get the actual code later when the tool manifest system is available
            normalized.taskDescription || 'Generated tool',
            job.category || 'general'
          );
          log(`[ToolBuilderAgent] Saved new tool "${toolUsed}" to memory`);
        } catch (memoryError) {
          logError(`[ToolBuilderAgent] Failed to save tool to memory:`, memoryError);
          // Continue execution even if memory storage fails
        }
      }

      const loadedTool = await dynamicToolLoader.ensureTool(toolUsed);
      const expectedInputs = loadedTool.manifest?.originalRequest?.expectedInputs || {};

      const initialArgs = sanitizeToolInput(plan.executionArgs ?? {});
      const initialArgObject =
        initialArgs && typeof initialArgs === 'object' && !Array.isArray(initialArgs)
          ? (initialArgs as Record<string, unknown>)
          : {};

      const enrichedArgs = await this.enrichExecutionArgs({
        toolName: toolUsed,
        jobPrompt,
        builderRationale: plan.rationale,
        currentArgs: initialArgObject,
        expectedInputs,
      });

      const sanitizedArgsRaw = sanitizeToolInput(enrichedArgs);
      const sanitizedArgs =
        sanitizedArgsRaw && typeof sanitizedArgsRaw === 'object' && !Array.isArray(sanitizedArgsRaw)
          ? (sanitizedArgsRaw as Record<string, unknown>)
          : {};
      const argsPreview = JSON.stringify(sanitizedArgs).slice(0, 200);

      if (!toolUsed) {
        const rationale = plan.rationale || 'Builder did not select a usable tool.';
        log(
          `[ToolBuilderAgent] Job ${jobId} produced no tool selection (strictMode=${this.strictModeEnabled}). Rationale: ${rationale}`
        );

        if (this.strictModeEnabled) {
          return {
            ok: false,
            artifact: this.buildArtifact({
              answer: rationale,
              toolsUsed: [],
              error: true,
              errorDescription: 'Builder did not select a tool in strict mode.',
            }),
            stepsUsed: 1,
            archetype: this.archetype,
            toolsUsed: false,
            newToolsCreated,
            totalToolsAvailable: this.availableTools.length,
            selectedTool: null,
            builderRationale: plan.rationale,
            executionArgs: sanitizedArgs,
          };
        }

        return {
          ok: true,
          artifact: this.buildArtifact({
            answer: rationale,
            toolsUsed: [],
            error: false,
            errorDescription: '',
          }),
          stepsUsed: 1,
          archetype: this.archetype,
          toolsUsed: false,
          newToolsCreated,
          totalToolsAvailable: this.availableTools.length,
          selectedTool: null,
          builderRationale: plan.rationale,
          executionArgs: sanitizedArgs,
        };
      }

      const runnerResult = await runnerExecute(
        {
          toolName: toolUsed,
          args: sanitizedArgs,
          jobPrompt,
          builderRationale: plan.rationale,
        },
        createToolBuilderLLM
      );

      log(
        `[ToolBuilderAgent] Job ${jobId} executed ${toolUsed} (newTool=${newToolsCreated}) args=${argsPreview} ok=${runnerResult.ok}`
      );
      log(
        `[ToolBuilderAgent] Job ${jobId} tool output snippet: ${runnerResult.toolOutput.slice(0, 200)}`
      );

      const stepsUsed = 2 + (newToolsCreated ? 1 : 0);

      // Update tool performance in memory after execution
      try {
        // Calculate quality score based on success and response length (simple heuristic)
        const qualityScore = runnerResult.ok
          ? Math.min(90, Math.max(30, runnerResult.toolOutput?.length > 50 ? 70 : 40))
          : 20;

        await this.toolMemory.updateToolPerformance(
          this.id,
          toolUsed,
          runnerResult.ok,
          qualityScore
        );

        // Store experience in general memory
        const outcome = runnerResult.ok ? 'success' : 'failure';
        await this.agentMemory.storeExperience(
          this.id,
          job.category || 'general',
          outcome,
          `Used tool "${toolUsed}" for task: ${jobPrompt.slice(0, 100)}`,
          `Tool execution with args: ${JSON.stringify(sanitizedArgs).slice(0, 100)}`,
          qualityScore
        );

        log(
          `[ToolBuilderAgent] Updated memory for tool "${toolUsed}": ${outcome}, quality=${qualityScore}`
        );
      } catch (memoryError) {
        logError(`[ToolBuilderAgent] Failed to update memory:`, memoryError);
        // Continue execution even if memory storage fails
      }

      return {
        ok: runnerResult.ok,
        artifact: runnerResult.finalResponse,
        stepsUsed,
        archetype: this.archetype,
        toolsUsed: true,
        newToolsCreated,
        totalToolsAvailable: this.availableTools.length,
        selectedTool: toolUsed,
        builderRationale: plan.rationale,
        executionArgs: sanitizedArgs,
        toolOutputSnippet: runnerResult.toolOutput.slice(0, 500),
        summarySource: runnerResult.summarySource,
      };
    } catch (error) {
      const errorMsg = extractErrorMessage(error, 'Unknown execution error');
      logError(`[ToolBuilderAgent] Agent ${this.id} failed on job ${jobId}: ${errorMsg}`, error);

      return {
        ok: false,
        artifact: this.buildArtifact({
          answer: 'Tool builder agent execution failed.',
          toolsUsed: [],
          error: true,
          errorDescription: errorMsg,
        }),
        stepsUsed: 0,
        archetype: this.archetype,
        newToolsCreated: false,
      };
    }
  }

  getStats(): {
    agentId: string;
    archetype: string;
    totalTools: number;
    customToolsAvailable: number;
    registryStats: any;
  } {
    const registryStats = dynamicToolLoader.getRegistryStats();
    return {
      agentId: this.id,
      archetype: this.archetype,
      totalTools: this.availableTools.length,
      customToolsAvailable: registryStats.totalTools,
      registryStats,
    };
  }

  private buildArtifact(options: {
    answer: string;
    toolsUsed: string[];
    error: boolean;
    errorDescription: string;
  }): string {
    const payload = {
      answer: options.answer,
      tools_used: options.toolsUsed,
      error: options.error,
      error_description: options.errorDescription,
    };

    return JSON.stringify(payload, null, 2);
  }

  private async enrichExecutionArgs(options: {
    toolName: string;
    jobPrompt: string;
    builderRationale: string;
    currentArgs: Record<string, unknown>;
    expectedInputs: Record<string, string>;
  }): Promise<Record<string, unknown>> {
    const { toolName, jobPrompt, builderRationale, currentArgs, expectedInputs } = options;
    const entries = Object.entries(expectedInputs || {});

    if (entries.length === 0) {
      return currentArgs;
    }

    const missingKeys = entries
      .map(([key]) => key)
      .filter((key) => currentArgs[key] === undefined || currentArgs[key] === '');

    if (missingKeys.length === 0) {
      return currentArgs;
    }

    const fieldsDescription = entries.map(([key, desc]) => `- ${key}: ${desc}`).join('\n');

    try {
      const llm = createToolBuilderLLM({ responseMimeType: 'application/json' });
      const response = await llm.invoke([
        {
          role: 'system',
          content:
            'You generate concrete JSON arguments to invoke a tool. ' +
            'Return ONLY a JSON object mapping input names to usable values. ' +
            'Numbers must be numeric (no quotes) and arrays must be proper JSON arrays.',
        },
        {
          role: 'user',
          content: [
            `Tool: ${toolName}`,
            `Job request:\n${jobPrompt}`,
            `Builder rationale: ${builderRationale}`,
            `Expected inputs:\n${fieldsDescription}`,
            `Existing arguments: ${JSON.stringify(currentArgs)}`,
            'Provide values for every expected input. Return ONLY JSON.',
          ].join('\n\n'),
        },
      ]);

      let raw = toStringContent(response.content).trim();
      if (raw.startsWith('```')) {
        raw = raw
          .replace(/^```(?:json)?/i, '')
          .replace(/```$/i, '')
          .trim();
      }

      const parsed = JSON.parse(raw || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Synthesised arguments were not a JSON object');
      }

      return { ...currentArgs, ...(parsed as Record<string, unknown>) };
    } catch (error) {
      logError(
        `[ToolBuilderAgent] Failed to synthesise execution args for ${toolName}: ${extractErrorMessage(error)}`,
        error
      );
      return currentArgs;
    }
  }
}
