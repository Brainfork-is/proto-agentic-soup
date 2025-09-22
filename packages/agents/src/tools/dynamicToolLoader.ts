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

  private readonly GENERATED_TOOLS_DIR = path.join(__dirname, '../generated-tools');
  private readonly CODE_DIR = path.join(this.GENERATED_TOOLS_DIR, 'code');
  private readonly MANIFESTS_DIR = path.join(this.GENERATED_TOOLS_DIR, 'manifests');

  constructor() {
    // Ensure directories exist
    this.ensureDirectories();
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

      const shareMode = (process.env.TOOL_LOADER_SHARE_MODE || 'smart').toLowerCase();
      const recentHours = parseInt(process.env.TOOL_LOADER_RECENT_HOURS || '48', 10);
      const maxTools = parseInt(process.env.TOOL_LOADER_MAX_TOOLS || '50', 10);
      const now = Date.now();

      // Find tools created by this agent or high-success tools from others
      const availableTools: LoadedTool[] = [];
      let ownToolsCount = 0;
      let sharedToolsCount = 0;

      const seenToolNames = new Set<string>();

      for (const [toolName, manifest] of this.manifestCache) {
        try {
          // Load tools created by this agent, or successful tools from others
          const isOwnTool = manifest.createdBy === agentId;
          const isSharedTool =
            !isOwnTool &&
            manifest.usageCount >= 5 &&
            manifest.successCount / Math.max(1, manifest.usageCount) > 0.7;
          const createdAtMs = Date.parse(manifest.createdAt || '');
          const isRecent =
            !Number.isNaN(createdAtMs) && now - createdAtMs <= recentHours * 3600 * 1000;

          let shouldLoad = false;
          switch (shareMode) {
            case 'all':
              shouldLoad = true;
              break;
            case 'recent':
              shouldLoad = isOwnTool || isRecent;
              break;
            case 'smart':
            default:
              // Original behavior plus allow recent tools to encourage reuse across agents
              shouldLoad = isOwnTool || isSharedTool || isRecent;
              break;
          }

          if (shouldLoad) {
            const reason = isOwnTool
              ? 'own tool'
              : isRecent
                ? `recent tool (created ${manifest.createdAt})`
                : `shared tool (${manifest.successCount}/${manifest.usageCount} success rate)`;
            log(`[DynamicToolLoader] Loading ${manifest.toolName} for agent ${agentId}: ${reason}`);

            const tool = await this.loadSingleTool(toolName, manifest);
            if (tool) {
              if (seenToolNames.has(tool.name)) {
                log(
                  `[DynamicToolLoader] Skipping duplicate tool ${tool.name} for agent ${agentId}`
                );
              } else {
                seenToolNames.add(tool.name);
                availableTools.push(tool);
                if (isOwnTool) ownToolsCount++;
                else sharedToolsCount++;
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
        `[DynamicToolLoader] Loaded ${availableTools.length} tools for agent ${agentId} (${ownToolsCount} own, ${sharedToolsCount} shared)`
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
      // Check registry first
      if (this.toolRegistry.has(toolName)) {
        return this.toolRegistry.get(toolName)!;
      }

      // Load from manifest
      await this.loadAllManifests();

      for (const [manifestKey, manifest] of this.manifestCache) {
        if (manifest.toolName === toolName) {
          return await this.loadSingleTool(manifestKey, manifest);
        }
      }

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

    throw new Error(`Tool ${toolName} not found in registry or manifests`);
  }

  /**
   * Execute a tool and track success/failure
   */
  async executeTool(toolName: string, params: any): Promise<string> {
    const tool = this.toolRegistry.get(toolName);

    if (!tool) {
      throw new Error(`Tool ${toolName} not found in registry`);
    }

    const startTime = Date.now();

    try {
      const manifest = tool.manifest;
      log(
        `[DynamicToolLoader] 🔧 EXECUTING TOOL: ${toolName} (created by ${manifest.createdBy}, used ${manifest.usageCount} times)`
      );

      // Execute with timeout
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Tool execution timeout')), 15000); // 15 second timeout
      });

      const executionPromise = tool.invoke(params);
      const result = await Promise.race([executionPromise, timeoutPromise]);

      const executionTime = Date.now() - startTime;
      log(`[DynamicToolLoader] Tool ${toolName} executed successfully in ${executionTime}ms`);

      // Update success metrics
      await this.updateToolMetrics(tool.manifest, true);

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logError(`[DynamicToolLoader] Tool ${toolName} failed after ${executionTime}ms:`, error);

      // Update failure metrics
      await this.updateToolMetrics(tool.manifest, false);

      // Return error as JSON
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        toolName,
        executionTime,
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
    try {
      // Transform potential ESM syntax to CommonJS for runtime import
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
        return out;
      };

      const sanitizedCode = toCommonJS(code);

      // Create a safe module environment
      const moduleCode = `
        ${sanitizedCode}
        
        // Export the tool
        if (typeof ${manifest.toolName} !== 'undefined') {
          module.exports = ${manifest.toolName};
        } else {
          throw new Error('Tool not found in code: ${manifest.toolName}');
        }
      `;

      // Use dynamic import for safe code execution
      const tempFilePath = path.join(
        this.CODE_DIR,
        `temp_${manifest.hash}_${crypto.randomUUID()}.js`
      );
      await fs.writeFile(tempFilePath, moduleCode);

      try {
        // Import the tool module
        const toolModule = await import(tempFilePath);
        const toolInstance = toolModule.default || toolModule;

        // Validate tool structure
        if (!toolInstance.name || !toolInstance.invoke) {
          throw new Error('Invalid tool structure: missing name or invoke method');
        }

        // Wrap invoke method with safety checks
        const safeInvoke = async (params: any): Promise<string> => {
          try {
            return await toolInstance.invoke(params);
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
    } catch (error) {
      logError('[DynamicToolLoader] Failed to create tool from code:', error);
      return null;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
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
