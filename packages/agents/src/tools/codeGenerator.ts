/**
 * Code Generator Tool - Creates custom JavaScript tools using LLM
 */

import { PatchedChatVertexAI } from '../patchedVertexAI';
import { DynamicTool } from '@langchain/core/tools';
import { log, logError } from '@soup/common';
import { selectTemplate } from '../templates/toolTemplates';
import crypto from 'crypto';
import path from 'path';

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
  templateUsed?: string;
}

export class CodeGeneratorTool {
  private llm: PatchedChatVertexAI;

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;

    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
    }

    this.llm = new PatchedChatVertexAI({
      model: process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash',
      temperature: 0.3, // Lower temperature for more consistent code generation
      maxOutputTokens: 2000,
      authOptions: {
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? undefined
          : process.env.GOOGLE_CLOUD_CREDENTIALS
            ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
            : undefined,
      },
    });
  }

  name = 'code_generator';
  description =
    'Generate custom JavaScript tools for specific tasks when existing tools are insufficient';

  async invoke(params: GeneratedToolRequest): Promise<string> {
    try {
      log(`[CodeGeneratorTool] INVOKE CALLED with params: ${JSON.stringify(params, null, 2)}`);

      const { taskDescription, toolName, expectedInputs, expectedOutput, agentId } = params;

      log(
        `[CodeGeneratorTool] Generating tool "${toolName}" for task: ${taskDescription.substring(0, 100)}...`
      );
      log(
        `[CodeGeneratorTool] Agent ID: ${agentId}, Expected inputs: ${JSON.stringify(expectedInputs)}, Expected output: ${expectedOutput}`
      );

      // Validate inputs
      if (!taskDescription || !toolName || !expectedInputs) {
        const error = `Missing required parameters: taskDescription=${!!taskDescription}, toolName=${!!toolName}, expectedInputs=${!!expectedInputs}`;
        log(`[CodeGeneratorTool] VALIDATION ERROR: ${error}`);
        throw new Error(error);
      }

      log(`[CodeGeneratorTool] Input validation passed successfully`);

      // Sanitize tool name (alphanumeric + underscores only)
      const sanitizedToolName = toolName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
      log(`[CodeGeneratorTool] Sanitized tool name: "${toolName}" -> "${sanitizedToolName}"`);

      // Select appropriate template
      const template = selectTemplate(taskDescription);
      log(
        `[CodeGeneratorTool] Selected template: ${template.name} for task: ${taskDescription.substring(0, 50)}...`
      );

      // Generate custom code using LLM
      log(`[CodeGeneratorTool] Starting LLM code generation...`);
      const generatedCode = await this.generateToolCode(
        taskDescription,
        sanitizedToolName,
        expectedInputs,
        expectedOutput,
        template
      );
      log(
        `[CodeGeneratorTool] LLM code generation completed. Code length: ${generatedCode.length} characters`
      );

      // Create tool file path
      const timestamp = Date.now();
      const hash = crypto.createHash('md5').update(generatedCode).digest('hex').substring(0, 8);
      const fileName = `${agentId || 'test'}_${sanitizedToolName}_${timestamp}_${hash}.js`;
      const filePath = path.join(__dirname, '../generated-tools/code', fileName);

      log(`[CodeGeneratorTool] Creating file: ${fileName}`);
      log(`[CodeGeneratorTool] Full file path: ${filePath}`);

      // Save the tool code
      log(`[CodeGeneratorTool] Writing tool code to file system...`);
      const fs = await import('fs-extra');

      // Ensure directory exists
      await fs.default.ensureDir(path.dirname(filePath));
      log(`[CodeGeneratorTool] Directory ensured: ${path.dirname(filePath)}`);

      await fs.default.writeFile(filePath, generatedCode, 'utf-8');
      log(`[CodeGeneratorTool] Tool code written successfully to: ${filePath}`);

      // Create metadata manifest
      const manifest = {
        toolName: sanitizedToolName,
        originalRequest: {
          taskDescription,
          expectedInputs,
          expectedOutput,
        },
        filePath,
        createdAt: new Date().toISOString(),
        createdBy: agentId || 'unknown',
        templateUsed: template.name,
        hash,
        usageCount: 0,
        successCount: 0,
        failureCount: 0,
      };

      const manifestPath = path.join(
        __dirname,
        '../generated-tools/manifests',
        `${sanitizedToolName}_${hash}.json`
      );

      log(`[CodeGeneratorTool] Writing manifest file: ${manifestPath}`);
      await fs.default.ensureDir(path.dirname(manifestPath));
      await fs.default.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      log(`[CodeGeneratorTool] Manifest written successfully`);

      log(`[CodeGeneratorTool] Successfully generated tool "${sanitizedToolName}" at ${filePath}`);

      const result = {
        success: true,
        toolCode: generatedCode,
        toolName: sanitizedToolName,
        filePath,
        templateUsed: template.name,
        hash,
        createdAt: manifest.createdAt,
      } as GeneratedToolResponse;

      const resultJson = JSON.stringify(result);
      log(`[CodeGeneratorTool] Returning result: ${resultJson.substring(0, 200)}...`);
      return resultJson;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
      logError(`[CodeGeneratorTool] Tool generation failed: ${errorMsg}`);
      logError(`[CodeGeneratorTool] Error stack:`, error);

      const errorResult = JSON.stringify({
        success: false,
        error: errorMsg,
      } as GeneratedToolResponse);

      log(`[CodeGeneratorTool] Returning error result: ${errorResult}`);
      return errorResult;
    }
  }

  private async generateToolCode(
    taskDescription: string,
    toolName: string,
    expectedInputs: Record<string, string>,
    expectedOutput: string,
    template: any
  ): Promise<string> {
    const prompt = `You are a JavaScript code generator. Produce a safe, self-contained tool that can be executed as-is inside our runtime.

TASK DESCRIPTION: ${taskDescription}

REQUIREMENTS:
1. Export a constant named ${toolName} with properties { name, description, async invoke }.
2. Ensure invoke accepts a single params object containing ${JSON.stringify(expectedInputs, null, 2)}.
3. Produce the described output format (${expectedOutput}) and return it as JSON.stringify(...).
4. Make the tool reusable: accept parameters instead of hard-coding values tied to this single request, and include comments when assumptions are made.
5. Validate inputs and surface clear error messages; always catch errors.
6. Remain self-contained (no external imports, no fs/network/process access).
7. You may adapt the template below as needed, but the final code must work without further edits.

REFERENCE TEMPLATE (adapt freely):
${template.pattern}

The code you return must be plain JavaScript (no markdown fences or commentary).`;

    const response = await this.llm.invoke(prompt);
    let generatedCode = response.content as string;

    // Clean up any markdown formatting
    generatedCode = generatedCode
      .replace(/```javascript\s*/, '')
      .replace(/```js\s*/, '')
      .replace(/```\s*$/, '')
      .trim();

    // Basic syntax validation
    this.validateGeneratedCode(generatedCode, toolName);

    return generatedCode;
  }

  private validateGeneratedCode(code: string, expectedToolName: string): void {
    // Basic syntax checks
    const escapedToolName = this.escapeForRegex(expectedToolName);
    const namePattern = new RegExp(String.raw`name\s*:\s*(["'])${escapedToolName}\1`);
    if (!namePattern.test(code)) {
      throw new Error(
        `Generated code must include tool name property matching ${expectedToolName}`
      );
    }

    const invokeRegex = /async\s+invoke\s*\(/;
    const invokePropertyRegex = /invoke\s*:\s*async\s*\(/;
    if (!invokeRegex.test(code) && !invokePropertyRegex.test(code)) {
      throw new Error('Generated code must include async invoke method');
    }

    if (!code.includes('JSON.stringify') && !code.includes('return ')) {
      throw new Error('Generated code must return JSON strings or other return statements');
    }

    if (!code.includes('try') || !code.includes('catch')) {
      throw new Error('Generated code must include error handling');
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /require\s*\(\s*['"`]fs['"`]\s*\)/,
      /require\s*\(\s*['"`]child_process['"`]\s*\)/,
      /require\s*\(\s*['"`]http['"`]\s*\)/,
      /require\s*\(\s*['"`]https['"`]\s*\)/,
      /require\s*\(\s*['"`]net['"`]\s*\)/,
      /process\.exit/,
      /eval\s*\(/,
      /Function\s*\(/,
      /import\s*\(/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error(`Generated code contains dangerous pattern: ${pattern.source}`);
      }
    }

    log('[CodeGeneratorTool] Generated code passed validation checks');
  }

  private escapeForRegex(value: string): string {
    return value.replace(/[\^$.*+?()[\]{}|]/g, (match) => '\\' + match);
  }
}

// Zod schema removed - DynamicTool doesn't support schema property

// Create singleton instance with LangChain DynamicTool
export const codeGeneratorTool = new DynamicTool({
  name: 'code_generator',
  description:
    'Generate custom JavaScript tools for specific tasks when existing tools are insufficient. Call with JSON object containing: taskDescription (string), toolName (string), expectedInputs (object mapping param names to type descriptions), expectedOutput (string description).',
  func: async (input: any): Promise<string> => {
    try {
      log(`[codeGeneratorTool] DynamicTool func called with input type: ${typeof input}`);
      log(`[codeGeneratorTool] Raw input: ${JSON.stringify(input, null, 2)}`);

      let params: GeneratedToolRequest;

      // Handle different input formats from LangGraph
      if (typeof input === 'string') {
        try {
          // Try to parse as JSON first
          params = JSON.parse(input);
          log(`[codeGeneratorTool] Parsed string input as JSON`);
        } catch (parseError) {
          // If parsing fails, return error
          const errorMsg = `Invalid JSON input: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`;
          log(`[codeGeneratorTool] ${errorMsg}`);
          return JSON.stringify({ success: false, error: errorMsg });
        }
      } else if (typeof input === 'object' && input !== null) {
        // Direct object input
        params = input as GeneratedToolRequest;
        log(`[codeGeneratorTool] Using direct object input`);
      } else {
        const errorMsg = `Invalid input type: expected string (JSON) or object, got ${typeof input}`;
        log(`[codeGeneratorTool] ${errorMsg}`);
        return JSON.stringify({ success: false, error: errorMsg });
      }

      log(`[codeGeneratorTool] Final params: ${JSON.stringify(params, null, 2)}`);

      // Validate required fields
      if (
        !params.taskDescription ||
        !params.toolName ||
        !params.expectedInputs ||
        !params.expectedOutput
      ) {
        const missing = [];
        if (!params.taskDescription) missing.push('taskDescription');
        if (!params.toolName) missing.push('toolName');
        if (!params.expectedInputs) missing.push('expectedInputs');
        if (!params.expectedOutput) missing.push('expectedOutput');

        const errorMsg = `Missing required fields: ${missing.join(', ')}`;
        log(`[codeGeneratorTool] ${errorMsg}`);
        return JSON.stringify({ success: false, error: errorMsg });
      }

      const generator = new CodeGeneratorTool();
      log(`[codeGeneratorTool] Created CodeGeneratorTool instance, calling invoke...`);

      const result = await generator.invoke(params);
      log(`[codeGeneratorTool] Generator invoke completed, result length: ${result.length}`);
      log(`[codeGeneratorTool] Result preview: ${result.substring(0, 300)}...`);

      return result; // invoke already returns JSON string
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Code generation failed';
      logError(`[codeGeneratorTool] DynamicTool func error: ${errorMsg}`);
      logError(`[codeGeneratorTool] Error stack:`, error);

      const errorResult = JSON.stringify({
        success: false,
        error: errorMsg,
      });

      log(`[codeGeneratorTool] Returning error result: ${errorResult}`);
      return errorResult;
    }
  },
});
