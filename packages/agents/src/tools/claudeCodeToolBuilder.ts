/**
 * Claude Code Tool Builder - Uses Claude Code CLI to generate tools via subprocess
 */

import { spawn } from 'child_process';
import { log, logError } from '@soup/common';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';

export interface GeneratedToolRequest {
  taskDescription: string;
  toolName: string;
  expectedInputs: Record<string, string>;
  expectedOutput: string;
  agentId?: string;
}

interface GeneratedToolResponse {
  success: boolean;
  toolCode?: string;
  toolName?: string;
  filePath?: string;
  error?: string;
}

export class ClaudeCodeToolBuilder {
  private toolsDir: string;

  constructor() {
    this.toolsDir = path.join(__dirname, '../generated-tools/code');
  }

  /**
   * Invoke method for compatibility with existing code
   */
  async invoke(input: any): Promise<string> {
    try {
      let params: GeneratedToolRequest;

      // Parse input
      if (typeof input === 'string') {
        try {
          params = JSON.parse(input);
        } catch (parseError) {
          return JSON.stringify({
            success: false,
            error: `Invalid JSON input: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`,
          });
        }
      } else if (typeof input === 'object' && input !== null) {
        params = input;
      } else {
        return JSON.stringify({
          success: false,
          error: `Invalid input type: expected string (JSON) or object, got ${typeof input}`,
        });
      }

      // Validate required fields
      const { taskDescription, toolName, expectedInputs, expectedOutput } = params;
      const requiredFields = { taskDescription, toolName, expectedInputs, expectedOutput };
      const missing = Object.entries(requiredFields)
        .filter(([, value]) => !value)
        .map(([key]) => key);

      if (missing.length > 0) {
        return JSON.stringify({
          success: false,
          error: `Missing required fields: ${missing.join(', ')}`,
        });
      }

      // Generate tool
      const result = await this.generateTool(params);

      return JSON.stringify(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logError(`[ClaudeCodeToolBuilder] Tool generation error:`, errorMsg);
      return JSON.stringify({
        success: false,
        error: errorMsg,
      });
    }
  }

  async generateTool(request: GeneratedToolRequest): Promise<GeneratedToolResponse> {
    const { taskDescription, toolName, expectedInputs, expectedOutput, agentId } = request;

    log(`[ClaudeCodeToolBuilder] Generating tool "${toolName}" using Claude Code CLI`);

    // Sanitize tool name
    const sanitizedToolName = toolName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();

    // Create unique file path
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(taskDescription).digest('hex').substring(0, 8);
    const agentPrefix = agentId ? `${agentId}_` : '';
    const fileName = `${agentPrefix}${sanitizedToolName}_${timestamp}_${hash}.js`;
    const filePath = path.join(this.toolsDir, fileName);

    // Ensure directory exists
    await fs.ensureDir(this.toolsDir);

    // Construct prompt for Claude Code
    const prompt = this.constructPrompt({
      toolName: sanitizedToolName,
      taskDescription,
      expectedInputs,
      expectedOutput,
      filePath,
    });

    try {
      // Spawn Claude Code CLI
      await this.spawnClaudeCLI(prompt, this.toolsDir);

      // Verify file was created
      const fileExists = await fs.pathExists(filePath);
      if (!fileExists) {
        throw new Error(`Tool file was not created at ${filePath}`);
      }

      // Read generated code
      const toolCode = await fs.readFile(filePath, 'utf-8');

      log(
        `[ClaudeCodeToolBuilder] Successfully generated tool "${sanitizedToolName}" at ${filePath}`
      );

      return {
        success: true,
        toolCode,
        toolName: sanitizedToolName,
        filePath,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logError(`[ClaudeCodeToolBuilder] Failed to generate tool "${sanitizedToolName}":`, errorMsg);

      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  private constructPrompt(params: {
    toolName: string;
    taskDescription: string;
    expectedInputs: Record<string, string>;
    expectedOutput: string;
    filePath: string;
  }): string {
    const { toolName, taskDescription, expectedInputs, expectedOutput, filePath } = params;

    return `Create a LangChain-compatible tool with the following specifications:

**Tool Name:** ${toolName}

**Task Description:** ${taskDescription}

**Expected Inputs:** ${JSON.stringify(expectedInputs, null, 2)}

**Expected Output:** ${expectedOutput}

**Output File Path:** ${filePath}

**Requirements:**

1. Create a CommonJS module that exports a tool object with:
   - \`name\` property (string): "${toolName}"
   - \`description\` property (string): Clear description of what the tool does
   - \`invoke\` method (async function): Takes \`params\` object, returns JSON string

2. The invoke method MUST:
   - Extract parameters from the \`params\` object
   - Validate required parameters (throw errors for missing required params)
   - Perform the task using REAL data (use axios for HTTP, require npm packages as needed)
   - Return JSON.stringify({ success: true, result: actualData, toolName: "${toolName}" })
   - On error: return JSON.stringify({ success: false, error: errorMessage, toolName: "${toolName}" })

3. Code structure template:
\`\`\`javascript
// Require npm packages at the top
const axios = require('axios');
// ... other requires as needed

const ${toolName} = {
  name: '${toolName}',
  description: 'Your description here',
  async invoke(params) {
    try {
      // Extract and validate parameters
      const { /* your params */ } = params;

      // Validate required parameters
      if (!requiredParam) {
        throw new Error('requiredParam is required');
      }

      // Perform the actual task with REAL data
      // Use axios for HTTP requests, web scraping, API calls, etc.
      const result = await yourImplementation(params);

      // Return success response
      return JSON.stringify({
        success: true,
        result: result,
        toolName: '${toolName}'
      });
    } catch (error) {
      // Return error response
      return JSON.stringify({
        success: false,
        error: error.message || 'Tool execution failed',
        toolName: '${toolName}'
      });
    }
  }
};

module.exports = ${toolName};
\`\`\`

4. Important rules:
   - Use REAL data sources (APIs, web scraping with axios/cheerio)
   - NEVER use mock data, placeholder data, or fake responses
   - If real data isn't available, throw an error - don't fake it
   - Use proper error handling with try/catch
   - All returns must be JSON.stringify() of an object
   - Use 'success: true' or 'success: false' (literal booleans, not variables)

5. Available npm packages you can require:
   - axios (HTTP requests)
   - cheerio (HTML parsing)
   - lodash (utilities)
   - moment (date/time)
   - validator (validation)
   - csv-parse, csv-stringify (CSV handling)
   - marked (Markdown)

**Action:** Use the Write tool to create the file at the specified path with the complete, working tool code.`;
  }

  private async spawnClaudeCLI(prompt: string, workingDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      log(`[ClaudeCodeToolBuilder] Spawning Claude CLI in ${workingDir}`);

      const claudeProcess = spawn(
        'claude',
        [
          '--print',
          '--output-format',
          'json',
          '--dangerously-skip-permissions',
          '--allowed-tools',
          'Write,Edit,Read',
          '--add-dir',
          workingDir,
          prompt,
        ],
        {
          cwd: workingDir,
          stdio: ['ignore', 'pipe', 'pipe'], // Don't pipe stdin - Claude hangs waiting for it
          // shell: false (default) - shell mode causes prompt to be split on spaces
        }
      );

      let stdout = '';
      let stderr = '';

      claudeProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      claudeProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      claudeProcess.on('close', (code) => {
        if (code !== 0) {
          logError(`[ClaudeCodeToolBuilder] Claude CLI exited with code ${code}`);
          logError(`[ClaudeCodeToolBuilder] stderr:`, stderr);
          reject(new Error(`Claude CLI failed with exit code ${code}: ${stderr}`));
          return;
        }

        try {
          // Parse JSON output to verify success
          JSON.parse(stdout);
          log(`[ClaudeCodeToolBuilder] Claude CLI completed successfully`);
          resolve();
        } catch (parseError) {
          // If not JSON, might still have succeeded - check if file exists
          log(`[ClaudeCodeToolBuilder] Claude CLI output (non-JSON):`, stdout.substring(0, 200));
          resolve();
        }
      });

      claudeProcess.on('error', (error) => {
        logError(`[ClaudeCodeToolBuilder] Failed to spawn Claude CLI:`, error);
        reject(error);
      });
    });
  }
}

// Export a singleton instance and the DynamicTool wrapper for compatibility
export function createClaudeCodeToolBuilderTool() {
  const builder = new ClaudeCodeToolBuilder();

  return {
    name: 'codeGeneratorTool',
    description: 'Generates custom JavaScript tools using Claude Code CLI',
    invoke: async (input: any): Promise<string> => {
      try {
        let params: GeneratedToolRequest;

        // Parse input
        if (typeof input === 'string') {
          try {
            params = JSON.parse(input);
          } catch (parseError) {
            return JSON.stringify({
              success: false,
              error: `Invalid JSON input: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`,
            });
          }
        } else if (typeof input === 'object' && input !== null) {
          params = input;
        } else {
          return JSON.stringify({
            success: false,
            error: `Invalid input type: expected string (JSON) or object, got ${typeof input}`,
          });
        }

        // Validate required fields
        const { taskDescription, toolName, expectedInputs, expectedOutput } = params;
        const requiredFields = { taskDescription, toolName, expectedInputs, expectedOutput };
        const missing = Object.entries(requiredFields)
          .filter(([, value]) => !value)
          .map(([key]) => key);

        if (missing.length > 0) {
          return JSON.stringify({
            success: false,
            error: `Missing required fields: ${missing.join(', ')}`,
          });
        }

        // Generate tool
        const result = await builder.generateTool(params);

        return JSON.stringify(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logError(`[ClaudeCodeToolBuilder] Tool generation error:`, errorMsg);
        return JSON.stringify({
          success: false,
          error: errorMsg,
        });
      }
    },
  };
}
