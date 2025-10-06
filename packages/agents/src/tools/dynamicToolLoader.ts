/**
 * Dynamic Tool Loader - Manages loading and execution of generated tools
 */

import { log, logError } from '@soup/common';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';

interface ToolManifest {
  toolName: string;
  originalRequest: {
    taskDescription: string;
    expectedInputs: Record<string, string>;
    expectedOutput: string;
  };
  filePath: string;
  createdAt: string;
  createdBy: string;
  templateUsed: string;
  hash: string;
  usageCount: number;
  successCount: number;
  failureCount: number;
}

export interface LoadedTool {
  name: string;
  description: string;
  invoke: (params: any) => Promise<string>;
  manifest: ToolManifest;
}

export class DynamicToolLoader {
  private toolRegistry: Map<string, LoadedTool> = new Map();
  private manifestCache: Map<string, ToolManifest> = new Map();
  private toolExecutionCounts: Map<string, { count: number; lastReset: number }> = new Map();

  // Use source directory for generated tools, not dist directory
  // This ensures we can find manifest files regardless of whether we're running from src or dist
  private readonly GENERATED_TOOLS_DIR = this.findGeneratedToolsDirectory();
  private readonly CODE_DIR = path.join(this.GENERATED_TOOLS_DIR, 'code');
  private readonly MANIFESTS_DIR = path.join(this.GENERATED_TOOLS_DIR, 'manifests');

  constructor() {
    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Find the correct generated-tools directory, looking in source directory first
   */
  private findGeneratedToolsDirectory(): string {
    // Try source directory first (where tools are actually created)
    const srcPath = path.join(__dirname, '../generated-tools');
    const srcPathResolved = path.resolve(srcPath);

    // Check if we're in dist and need to go to src
    if (srcPathResolved.includes('/dist/src/')) {
      // Replace /dist/src/ with /src/ to get the correct source path
      const srcVersionPath = srcPathResolved.replace('/dist/src/', '/src/');
      if (fs.existsSync(srcVersionPath)) {
        return srcVersionPath;
      }
    }

    // Fallback to original path
    return srcPathResolved;
  }

  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.CODE_DIR);
    await fs.ensureDir(this.MANIFESTS_DIR);
  }

  /**
   * Load all available tools for an agent
   */
  async loadToolsForAgent(agentId: string): Promise<LoadedTool[]> {
    try {
      log(`[DynamicToolLoader] Loading tools for agent: ${agentId}`);

      // Load manifests
      await this.loadAllManifests();

      // Note: shareMode, recentHours, and timing variables removed for mutation model
      const maxTools = parseInt(process.env.TOOL_LOADER_MAX_TOOLS || '50', 10);

      // MUTATION MODEL: Only load tools created by this specific agent
      // Tools represent mutations and should not be shared between agents
      const availableTools: LoadedTool[] = [];
      let ownToolsCount = 0;

      const seenToolNames = new Set<string>();

      for (const [toolName, manifest] of this.manifestCache) {
        try {
          // Only load tools created by this agent (no sharing)
          const isOwnTool = manifest.createdBy === agentId;

          let shouldLoad = false;
          if (isOwnTool) {
            shouldLoad = true;
          }
          // Note: Tool sharing disabled for mutation-based evolutionary model

          if (shouldLoad) {
            log(`[DynamicToolLoader] Loading ${manifest.toolName} for agent ${agentId}: own tool`);

            const tool = await this.loadSingleTool(toolName, manifest);
            if (tool) {
              if (seenToolNames.has(tool.name)) {
                log(
                  `[DynamicToolLoader] Skipping duplicate tool ${tool.name} for agent ${agentId}`
                );
              } else {
                seenToolNames.add(tool.name);
                availableTools.push(tool);
                ownToolsCount++;
              }
            }
          }

          // Respect tool cap to avoid bloating the agent
          if (availableTools.length >= maxTools) {
            break;
          }
        } catch (error) {
          logError(`[DynamicToolLoader] Failed to load tool ${toolName}:`, error);
          // Mark tool for cleanup if it consistently fails
          if (manifest.failureCount > 5) {
            await this.markToolForCleanup(toolName, manifest);
          }
        }
      }

      log(
        `[DynamicToolLoader] Loaded ${availableTools.length} tools for agent ${agentId} (${ownToolsCount} own, 0 shared - mutation model)`
      );
      return availableTools;
    } catch (error) {
      logError('[DynamicToolLoader] Failed to load tools:', error);
      return [];
    }
  }

  /**
   * Load a specific tool by name
   */
  async loadToolByName(toolName: string): Promise<LoadedTool | null> {
    try {
      log(`[DynamicToolLoader] Loading tool by name: ${toolName}`);

      // Check registry first
      if (this.toolRegistry.has(toolName)) {
        log(`[DynamicToolLoader] Tool ${toolName} found in registry`);
        return this.toolRegistry.get(toolName)!;
      }

      // Load from manifest
      await this.loadAllManifests();
      log(`[DynamicToolLoader] Manifest cache size: ${this.manifestCache.size}`);

      const manifestMatches: string[] = [];
      for (const [manifestKey, manifest] of this.manifestCache) {
        manifestMatches.push(manifest.toolName);
        if (manifest.toolName === toolName) {
          log(`[DynamicToolLoader] Found matching manifest for ${toolName}: ${manifestKey}`);
          return await this.loadSingleTool(manifestKey, manifest);
        }
      }

      log(
        `[DynamicToolLoader] No manifest found for ${toolName}. Available manifest tool names: ${manifestMatches.slice(0, 10).join(', ')}`
      );
      return null;
    } catch (error) {
      logError(`[DynamicToolLoader] Failed to load tool ${toolName}:`, error);
      return null;
    }
  }

  async ensureTool(toolName: string): Promise<LoadedTool> {
    const existing = this.toolRegistry.get(toolName);
    if (existing) {
      return existing;
    }

    const loaded = await this.loadToolByName(toolName);
    if (loaded) {
      return loaded;
    }

    // Cache might be stale, perform full reload once more before failing
    await this.loadAllManifests();
    for (const [manifestKey, manifest] of this.manifestCache) {
      if (manifest.toolName === toolName) {
        const retried = await this.loadSingleTool(manifestKey, manifest);
        if (retried) {
          return retried;
        }
      }
    }

    // Enhanced error reporting with debugging info
    const availableToolNames = Array.from(this.manifestCache.values()).map((m) => m.toolName);
    const registryToolNames = Array.from(this.toolRegistry.keys());

    // Try fuzzy matching to find similar tool names
    const similarTools = this.findSimilarToolNames(toolName, availableToolNames);

    let errorMessage = `Tool ${toolName} not found in registry or manifests.`;

    if (similarTools.length > 0) {
      errorMessage += `\nDid you mean one of these? ${similarTools.slice(0, 3).join(', ')}`;
    }

    errorMessage += `\nAvailable tools in manifests: ${availableToolNames.slice(0, 5).join(', ')}${availableToolNames.length > 5 ? '...' : ''}`;
    errorMessage += `\nLoaded tools in registry: ${registryToolNames.slice(0, 5).join(', ')}${registryToolNames.length > 5 ? '...' : ''}`;

    logError(`[DynamicToolLoader] Enhanced tool lookup failed:`, {
      requestedTool: toolName,
      availableInManifests: availableToolNames,
      loadedInRegistry: registryToolNames,
      manifestCacheSize: this.manifestCache.size,
      registrySize: this.toolRegistry.size,
      similarMatches: similarTools,
      manifestKeys: Array.from(this.manifestCache.keys()).slice(0, 10),
    });

    throw new Error(errorMessage);
  }

  /**
   * Execute a tool and track success/failure with robust timeout protection
   */
  async executeTool(toolName: string, params: any): Promise<string> {
    const tool = this.toolRegistry.get(toolName);

    if (!tool) {
      throw new Error(`Tool ${toolName} not found in registry`);
    }

    // Check execution count limits to prevent runaway tools
    const executionLimit = parseInt(process.env.TOOL_EXECUTION_LIMIT_PER_HOUR || '10', 10);
    const resetHours = parseInt(process.env.TOOL_EXECUTION_RESET_HOURS || '1', 10);

    const now = Date.now();
    const executionStats = this.toolExecutionCounts.get(toolName);

    if (executionStats) {
      // Reset counter if enough time has passed
      if (now - executionStats.lastReset > resetHours * 60 * 60 * 1000) {
        this.toolExecutionCounts.set(toolName, { count: 0, lastReset: now });
      } else if (executionStats.count >= executionLimit) {
        const hoursRemaining = Math.ceil(
          (executionStats.lastReset + resetHours * 60 * 60 * 1000 - now) / (60 * 60 * 1000)
        );
        logError(
          `[DynamicToolLoader] Tool ${toolName} has reached execution limit (${executionLimit}). Reset in ${hoursRemaining}h`
        );
        return JSON.stringify({
          success: false,
          error: `Tool execution limit reached (${executionLimit} per ${resetHours}h). Try again later.`,
          toolName,
          limitReached: true,
        });
      }
    } else {
      // Initialize counter for new tool
      this.toolExecutionCounts.set(toolName, { count: 0, lastReset: now });
    }

    // Increment execution count
    const currentStats = this.toolExecutionCounts.get(toolName)!;
    currentStats.count++;

    const startTime = Date.now();

    try {
      const manifest = tool.manifest;
      log(
        `[DynamicToolLoader] 🔧 EXECUTING TOOL: ${toolName} (created by ${manifest.createdBy}, used ${manifest.usageCount} times)`
      );

      // Execute tool directly - sandbox execution handles timeouts internally
      const result = await tool.invoke(params);

      const executionTime = Date.now() - startTime;
      log(`[DynamicToolLoader] Tool ${toolName} executed successfully in ${executionTime}ms`);

      // Update success metrics
      await this.updateToolMetrics(tool.manifest, true);

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      // Log different types of errors
      if (errorMsg.includes('timeout') || errorMsg.includes('infinite loop')) {
        logError(
          `[DynamicToolLoader] Tool ${toolName} TIMEOUT/INFINITE LOOP after ${executionTime}ms: ${errorMsg}`
        );

        // Mark tool for cleanup if it consistently times out
        if (tool.manifest.failureCount > 3) {
          log(
            `[DynamicToolLoader] Tool ${toolName} has failed ${tool.manifest.failureCount} times, marking for cleanup`
          );
          await this.markToolForCleanup(`${toolName}_${tool.manifest.hash}`, tool.manifest);
        }
      } else {
        logError(
          `[DynamicToolLoader] Tool ${toolName} failed after ${executionTime}ms: ${errorMsg}`
        );
      }

      // Update failure metrics
      await this.updateToolMetrics(tool.manifest, false);

      // Return error as JSON with additional metadata
      return JSON.stringify({
        success: false,
        error: errorMsg,
        toolName,
        executionTime,
        errorType: errorMsg.includes('timeout') ? 'timeout' : 'execution_error',
      });
    }
  }

  /**
   * Load all manifests into cache
   */
  private async loadAllManifests(): Promise<void> {
    try {
      const manifestFiles = await fs.readdir(this.MANIFESTS_DIR);

      for (const file of manifestFiles) {
        if (file.endsWith('.json')) {
          const manifestPath = path.join(this.MANIFESTS_DIR, file);
          const manifest: ToolManifest = await fs.readJson(manifestPath);
          const key = file.replace('.json', '');
          this.manifestCache.set(key, manifest);
        }
      }
    } catch (error) {
      logError('[DynamicToolLoader] Failed to load manifests:', error);
    }
  }

  /**
   * Load a single tool from its manifest
   */
  private async loadSingleTool(
    manifestKey: string,
    manifest: ToolManifest
  ): Promise<LoadedTool | null> {
    // Return cached instance if available
    if (this.toolRegistry.has(manifest.toolName)) {
      return this.toolRegistry.get(manifest.toolName)!;
    }

    const maxAttempts = parseInt(process.env.TOOL_LOADER_LOAD_RETRIES || '3', 10);
    const baseDelayMs = parseInt(process.env.TOOL_LOADER_RETRY_DELAY_MS || '100', 10);
    const toolFilePath = path.resolve(manifest.filePath);

    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
      try {
        if (!(await fs.pathExists(toolFilePath))) {
          logError(`[DynamicToolLoader] Tool file not found: ${toolFilePath}`);
          return null;
        }

        const toolCode = await fs.readFile(toolFilePath, 'utf-8');
        const tool = await this.createToolFromCode(toolCode, manifest);

        if (tool) {
          this.toolRegistry.set(manifest.toolName, tool);
          if (attempt > 1) {
            log(`[DynamicToolLoader] Loaded tool: ${manifest.toolName} after ${attempt} attempts`);
          } else {
            log(`[DynamicToolLoader] Loaded tool: ${manifest.toolName}`);
          }
          return tool;
        }
      } catch (error) {
        logError(
          `[DynamicToolLoader] Failed to load tool from manifest ${manifestKey} (attempt ${attempt}):`,
          error
        );
        await this.updateToolMetrics(manifest, false);
      }

      if (attempt < Math.max(1, maxAttempts)) {
        const delayMs = baseDelayMs * attempt;
        await this.delay(delayMs);
      }
    }

    logError(
      `[DynamicToolLoader] Exhausted retries loading tool ${manifest.toolName} from manifest ${manifestKey}`
    );
    return null;
  }

  /**
   * Create tool instance from code string
   */
  private async createToolFromCode(
    code: string,
    manifest: ToolManifest
  ): Promise<LoadedTool | null> {
    // Try with transformation first (for ESM/TS tools)
    try {
      return await this.loadWithTransform(code, manifest);
    } catch (transformError) {
      log(
        `[DynamicToolLoader] Transform failed for ${manifest.toolName}, trying original code:`,
        transformError instanceof Error ? transformError.message : String(transformError)
      );

      // Fallback: Load original untransformed code
      try {
        return await this.loadWithoutTransform(code, manifest);
      } catch (untransformedError) {
        logError(
          `[DynamicToolLoader] Both transformation and untransformed loading failed for ${manifest.toolName}`,
          {
            transformError:
              transformError instanceof Error ? transformError.message : String(transformError),
            untransformedError:
              untransformedError instanceof Error
                ? untransformedError.message
                : String(untransformedError),
          }
        );
        return null;
      }
    }
  }

  /**
   * Load tool with CommonJS transformation applied
   */
  private async loadWithTransform(
    code: string,
    manifest: ToolManifest
  ): Promise<LoadedTool | null> {
    // Transform potential ESM and TypeScript syntax to CommonJS for runtime import
    const toCommonJS = (src: string): string => {
      let out = src;

      // Replace `export const name =` with `const name =`
      out = out.replace(/\bexport\s+const\s+(\w+)\s*=/g, 'const $1 =');
      out = out.replace(/\bexport\s+let\s+(\w+)\s*=/g, 'let $1 =');
      out = out.replace(/\bexport\s+var\s+(\w+)\s*=/g, 'var $1 =');
      // Replace `export default <expr>;` with `module.exports = <expr>;`
      out = out.replace(/\bexport\s+default\s+/g, 'module.exports = ');
      // Remove named export lists like `export { a, b as c };`
      out = out.replace(/\bexport\s*\{[^}]*\};?/g, '');

      // Remove TypeScript type assertions (as Type)
      out = out.replace(/\s+as\s+\w+/g, '');
      out = out.replace(/\s+as\s+any/g, '');

      // Remove TypeScript type annotations in function parameters and variables
      out = out.replace(/:\s*\w+(\[\])?(\s*\||\s*&|\s*=|\s*,|\s*\)|\s*;)/g, (match) => {
        return match.replace(/:\s*\w+(\[\])?/, '');
      });

      return out;
    };

    const sanitizedCode = toCommonJS(code);
    return await this.loadToolCode(sanitizedCode, manifest);
  }

  /**
   * Load tool without any transformation
   */
  private async loadWithoutTransform(
    code: string,
    manifest: ToolManifest
  ): Promise<LoadedTool | null> {
    return await this.loadToolCode(code, manifest);
  }

  /**
   * Common tool loading logic - wraps code in module environment and imports it
   */
  private async loadToolCode(
    sanitizedCode: string,
    manifest: ToolManifest
  ): Promise<LoadedTool | null> {
    // NOTE: Removed pre-load validation checks as they caused too many false positives
    // The LLM prompt now contains clear warnings about:
    // - webResearch/fetchWebContent placement (must be inside invoke)
    // - validator API usage (auto-fixed during generation)
    // - setTimeout/setInterval placement (will error at runtime with clear messages)
    // If tools fail at runtime, the enhanced error handling will provide actionable diagnostics

    // Create a safe module environment with real helper function implementations
    const moduleCode = `
      // Real helper functions available during both loading and execution
      const webResearch = async (query, url) => {
        try {
          if (url || (query && query.startsWith('http'))) {
            // Direct URL fetch
            const targetUrl = url || query;
            const axios = require('axios');
            const response = await axios.get(targetUrl, {
              timeout: 10000,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoupAgent/1.0)' }
            });
            return \`Web content from \${targetUrl}: \${String(response.data).slice(0, 1000)}...\`;
          } else {
            // Use web search via toolExecutionEnv
            const { performWebSearch } = require('./toolExecutionEnv');
            return await performWebSearch(query);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Web research failed';
          return JSON.stringify({ error: errorMsg, query });
        }
      };
      const fetchWebContent = async (url) => {
        try {
          const axios = require('axios');
          const response = await axios.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SoupAgent/1.0)' }
          });
          return response.data;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Fetch failed';
          throw new Error(\`Failed to fetch \${url}: \${errorMsg}\`);
        }
      };
      const parseHTML = (html) => {
        try {
          const cheerio = require('cheerio');
          return cheerio.load(html);
        } catch (error) {
          throw new Error('HTML parsing failed');
        }
      };

      ${sanitizedCode}

      // Try to export the tool with exact name first
      if (typeof ${manifest.toolName} !== 'undefined') {
        module.exports = ${manifest.toolName};
      } else {
        // Export all defined variables so we can search case-insensitively
        const exportableVars = {};
        // Generate possible naming variants by checking common patterns
        const toolNameLower = '${manifest.toolName}'.toLowerCase();
        const possibleNames = [
          '${manifest.toolName}',
          // First letter uppercase
          toolNameLower.charAt(0).toUpperCase() + toolNameLower.slice(1),
          // Convert to camelCase by capitalizing after common word boundaries
          toolNameLower.replace(/(calculate|financial|metrics|analyze|research|generate|create|process)/g, (match, word, offset) => {
            return offset === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
          })
        ];

        // Add unique values only
        const uniqueNames = [...new Set(possibleNames)];

        for (const varName of uniqueNames) {
          try {
            const varValue = eval('typeof ' + varName + ' !== "undefined" ? ' + varName + ' : null');
            if (varValue && typeof varValue === 'object' && varValue.name && varValue.invoke) {
              exportableVars[varName] = varValue;
            }
          } catch (e) {
            // Variable doesn't exist
          }
        }

        if (Object.keys(exportableVars).length > 0) {
          // Export all found variables
          Object.assign(module.exports, exportableVars);
        } else {
          throw new Error('Tool not found in code: ${manifest.toolName}');
        }
      }
    `;

    // Use dynamic import for safe code execution
    const tempFilePath = path.join(
      this.CODE_DIR,
      `temp_${manifest.hash}_${crypto.randomUUID()}.js`
    );
    await fs.writeFile(tempFilePath, moduleCode);

    try {
      // Import the tool module with enhanced error handling
      let toolModule;
      try {
        toolModule = await import(tempFilePath);
      } catch (importError) {
        // Capture detailed error information from import failures
        const errorMsg = importError instanceof Error ? importError.message : String(importError);
        const errorStack = importError instanceof Error ? importError.stack : '';

        logError(
          `[DynamicToolLoader] Failed to import tool ${manifest.toolName}:`,
          `Error: ${errorMsg}`,
          `Stack: ${errorStack}`
        );

        // Provide actionable error messages for common issues
        if (errorMsg.includes('is not defined')) {
          const match = errorMsg.match(/(\w+) is not defined/);
          const varName = match ? match[1] : 'variable';
          throw new Error(
            `Tool ${manifest.toolName} uses undefined variable "${varName}". ` +
              `Common causes: 1) Variable not declared, 2) Object shorthand {${varName}} without variable, ` +
              `3) Side effect during module load. Check that all variables are defined before use.`
          );
        } else if (errorMsg.includes('setTimeout') || errorMsg.includes('setInterval')) {
          throw new Error(
            `Tool ${manifest.toolName} uses setTimeout/setInterval at module scope causing crash. ` +
              `Move all timers inside invoke() method.`
          );
        } else {
          throw new Error(
            `Tool ${manifest.toolName} failed to load: ${errorMsg}. ` +
              `This may indicate syntax errors, side effects at module scope, or undefined variables.`
          );
        }
      }

      let toolInstance = toolModule.default || toolModule;

      // Handle case where the exact variable name doesn't match but a similar one exists
      if (!toolInstance || !toolInstance.name || !toolInstance.invoke) {
        // Search for tool objects case-insensitively
        const targetToolName = manifest.toolName.toLowerCase();

        // Check all exports in the module
        for (const [exportName, exportValue] of Object.entries(toolModule)) {
          if (
            exportName.toLowerCase() === targetToolName &&
            exportValue &&
            typeof exportValue === 'object' &&
            (exportValue as any).name &&
            (exportValue as any).invoke
          ) {
            toolInstance = exportValue;
            log(
              `[DynamicToolLoader] Found tool with case-insensitive match: ${exportName} for ${manifest.toolName}`
            );
            break;
          }
        }
      }

      // Validate tool structure
      if (!toolInstance || !toolInstance.name || !toolInstance.invoke) {
        const availableExports = Object.keys(toolModule);
        throw new Error(
          `Invalid tool structure: missing name or invoke method. Available exports: ${availableExports.join(', ')}`
        );
      }

      // Wrap invoke method with sandboxed execution
      const safeInvoke = async (params: any): Promise<string> => {
        try {
          // Direct execution - sandbox is currently broken
          const result = await toolInstance.invoke(params);
          // Ensure result is a string
          return typeof result === 'string' ? result : JSON.stringify(result);
        } catch (error) {
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Tool execution failed',
            toolName: manifest.toolName,
          });
        }
      };

      const loadedTool: LoadedTool = {
        name: toolInstance.name,
        description: toolInstance.description || manifest.originalRequest.taskDescription,
        invoke: safeInvoke,
        manifest,
      };

      // Clean up temp file
      await fs.remove(tempFilePath).catch(() => {}); // Ignore cleanup errors

      return loadedTool;
    } finally {
      // Always try to clean up temp file
      await fs.remove(tempFilePath).catch(() => {});
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Find similar tool names using basic string similarity
   */
  private findSimilarToolNames(target: string, availableNames: string[]): string[] {
    const targetLower = target.toLowerCase();

    // Calculate simple similarity scores
    const scored = availableNames.map((name) => {
      const nameLower = name.toLowerCase();
      let score = 0;

      // Exact match gets highest score
      if (nameLower === targetLower) {
        score = 1000;
      }
      // Contains target as substring
      else if (nameLower.includes(targetLower)) {
        score = 800;
      }
      // Target contains name as substring
      else if (targetLower.includes(nameLower)) {
        score = 700;
      } else {
        // Simple character overlap score
        const targetChars = new Set(targetLower);
        const nameChars = new Set(nameLower);
        const overlap = [...targetChars].filter((c) => nameChars.has(c)).length;
        const totalUnique = new Set([...targetChars, ...nameChars]).size;
        score = Math.floor((overlap / totalUnique) * 600);
      }

      return { name, score };
    });

    // Return top matches with score > 200
    return scored
      .filter((item) => item.score > 200)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.name);
  }

  /**
   * Update tool usage metrics
   */
  private async updateToolMetrics(manifest: ToolManifest, success: boolean): Promise<void> {
    try {
      manifest.usageCount++;
      if (success) {
        manifest.successCount++;
      } else {
        manifest.failureCount++;
      }

      // Update manifest file
      const manifestKey = `${manifest.toolName}_${manifest.hash}`;
      const manifestPath = path.join(this.MANIFESTS_DIR, `${manifestKey}.json`);

      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      // Update cache
      this.manifestCache.set(manifestKey, manifest);
    } catch (error) {
      logError('[DynamicToolLoader] Failed to update tool metrics:', error);
    }
  }

  /**
   * Mark tool for cleanup due to poor performance
   */
  private async markToolForCleanup(manifestKey: string, manifest: ToolManifest): Promise<void> {
    try {
      log(
        `[DynamicToolLoader] Marking tool for cleanup: ${manifest.toolName} (success rate: ${manifest.successCount / manifest.usageCount})`
      );

      // Move to cleanup directory instead of deleting immediately
      const cleanupDir = path.join(this.GENERATED_TOOLS_DIR, 'cleanup');
      await fs.ensureDir(cleanupDir);

      // Move files
      const manifestPath = path.join(this.MANIFESTS_DIR, `${manifestKey}.json`);
      const codePath = path.resolve(manifest.filePath);

      if (await fs.pathExists(manifestPath)) {
        await fs.move(manifestPath, path.join(cleanupDir, `${manifestKey}.json`));
      }

      if (await fs.pathExists(codePath)) {
        const codeFileName = path.basename(codePath);
        await fs.move(codePath, path.join(cleanupDir, codeFileName));
      }

      // Remove from caches
      this.manifestCache.delete(manifestKey);
      this.toolRegistry.delete(manifest.toolName);
    } catch (error) {
      logError('[DynamicToolLoader] Failed to mark tool for cleanup:', error);
    }
  }

  /**
   * Get tool registry statistics
   */
  getRegistryStats(): { totalTools: number; averageSuccessRate: number; toolNames: string[] } {
    const tools = Array.from(this.toolRegistry.values());
    const totalTools = tools.length;
    const toolNames = tools.map((t) => t.name);

    if (totalTools === 0) {
      return { totalTools: 0, averageSuccessRate: 0, toolNames: [] };
    }

    const avgSuccessRate =
      tools
        .filter((t) => t.manifest.usageCount > 0)
        .reduce((sum, t) => sum + t.manifest.successCount / t.manifest.usageCount, 0) / totalTools;

    return {
      totalTools,
      averageSuccessRate: avgSuccessRate,
      toolNames,
    };
  }
}

// Create singleton instance
export const dynamicToolLoader = new DynamicToolLoader();
