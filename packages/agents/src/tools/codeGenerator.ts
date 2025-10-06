/**
 * Code Generator Tool - Creates custom JavaScript tools using LLM
 */

import { PatchedChatVertexAI } from '../patchedVertexAI';
import { DynamicTool } from '@langchain/core/tools';
import { log, logError, getVertexTokenLimit } from '@soup/common';
import { selectTemplate } from '../templates/toolTemplates';
import crypto from 'crypto';
import path from 'path';
import { getToolCapabilities } from './toolExecutionEnv';
import * as acorn from 'acorn';

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

    const maxOutputTokens = getVertexTokenLimit('code_generator');

    this.llm = new PatchedChatVertexAI({
      model: process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash',
      temperature: 0.3, // Lower temperature for more consistent code generation
      maxOutputTokens, // Use config-based limit (undefined = no limit)
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
    _template: any
  ): Promise<string> {
    const capabilities = getToolCapabilities();
    const prompt = `You are a specialized JavaScript tool generator for LangChain/LangGraph agents. Create production-ready, LangChain-compatible tools.

TASK DESCRIPTION: ${taskDescription}

AVAILABLE CAPABILITIES:
${capabilities}

LANGCHAIN COMPATIBILITY REQUIREMENTS:
This tool will be used by LangChain ReAct agents, so it must:
1. Follow LangChain's DynamicTool patterns
2. Return structured JSON that LangChain agents can parse
3. Have clear, descriptive names and descriptions for agent reasoning
4. Include comprehensive error handling for agent reliability

CRITICAL RETURN STRUCTURE:
Success Response:
{
  "success": true,
  "result": <actual data>,
  "toolName": "${toolName}"
}

Error Response:
{
  "success": false,
  "error": "<descriptive error message>",
  "toolName": "${toolName}"
}

TOOL SPECIFICATION:
- Name: ${toolName}
- Input Parameters: ${JSON.stringify(expectedInputs, null, 2)}
- Expected Output: ${expectedOutput}
- Must work seamlessly with LangChain agents and LangGraph workflows

IMPLEMENTATION REQUIREMENTS:
1. **Real Data Only**: Use actual APIs, web content, or computed data - never mock/placeholder data
2. **LangChain Integration**: Tool must be easily callable by LangChain agents
3. **Robust Error Handling**: Catch all errors and return structured error responses
4. **Input Validation**: Validate all parameters with clear error messages
5. **Comprehensive Logging**: Use descriptive variable names and clear logic flow
6. **Reusable Design**: Make the tool generic and reusable for similar tasks

JAVASCRIPT BEST PRACTICES:
- Use proper syntax: "case value:" not "case value ="
- Quote object properties with spaces: {"property name": value}
- No duplicate declarations in same scope
- Escape quotes properly: "text with \\"quotes\\""
- Use : for object properties, = for assignments

LANGCHAIN TOOL TEMPLATE:
const ${toolName} = {
  name: '${toolName}',
  description: 'Clear description that helps LangChain agents understand when to use this tool',
  async invoke(params) {
    try {
      // Extract and validate input parameters
      const { /* destructure expected inputs */ } = params;

      // Comprehensive input validation with helpful error messages
      // if (!requiredParam) throw new Error('requiredParam is required for...');

      // Main processing logic using real data sources
      // Use webResearch(), fetchWebContent(), or npm packages as needed
      const result = /* your implementation */;

      // Return structured success response
      return JSON.stringify({
        success: true,
        result: result,
        toolName: '${toolName}'
      });

    } catch (error) {
      // Structured error response for LangChain agents
      return JSON.stringify({
        success: false,
        error: error.message || 'Tool execution failed',
        toolName: '${toolName}'
      });
    }
  }
};

module.exports = ${toolName};

DATA ACCESS FUNCTIONS (globally available):
- webResearch(query): Search web for information
- fetchWebContent(url): Fetch content from specific URLs
- Available NPM packages: axios, cheerio, lodash, moment, validator, jsonpath, csv-parse, marked, etc.

QUALITY STANDARDS:
- Process real, current data whenever possible
- Provide actionable, complete results
- Handle edge cases gracefully
- Make tools that LangChain agents will want to use repeatedly

Return only the JavaScript code (no markdown formatting or explanations).`;

    const response = await this.llm.invoke(prompt);
    let generatedCode = response.content as string;

    // Clean up any markdown formatting
    generatedCode = generatedCode
      .replace(/```javascript\s*/, '')
      .replace(/```js\s*/, '')
      .replace(/```\s*$/, '')
      .trim();

    // AST-based syntax validation first
    const syntaxValidation = this.validateJavaScriptSyntax(generatedCode, toolName);
    if (!syntaxValidation.valid) {
      throw new Error(syntaxValidation.error || 'Syntax validation failed');
    }

    // Additional validation checks
    this.validateGeneratedCode(generatedCode, toolName);

    return generatedCode;
  }

  private validateJavaScriptSyntax(
    code: string,
    toolName: string
  ): { valid: boolean; error?: string } {
    try {
      // Parse the code to check for syntax errors
      acorn.parse(code, {
        ecmaVersion: 2020,
        sourceType: 'script',
        allowReturnOutsideFunction: true,
      });

      // Additional validations
      this.validateRequiredStructure(code, toolName);
      // Disabled: detectCommonSyntaxErrors has too many false positives
      // this.detectCommonSyntaxErrors(code);

      return { valid: true };
    } catch (syntaxError: any) {
      return {
        valid: false,
        error: `Syntax error: ${syntaxError.message}`,
      };
    }
  }

  private validateRequiredStructure(code: string, _toolName: string): void {
    // Check for proper export structure
    const hasModuleExports = code.includes('module.exports');
    const hasExport = code.includes('export');

    if (!hasModuleExports && !hasExport) {
      throw new Error('Code must include module.exports or export statement');
    }

    // Check for invoke method
    const hasInvokeMethod = /invoke\s*[:()]/.test(code);
    if (!hasInvokeMethod) {
      throw new Error('Code must include an invoke method');
    }

    // Check for proper return structure in success case
    const hasSuccessReturn = code.includes('success: true') && code.includes('toolName:');
    if (!hasSuccessReturn) {
      throw new Error('Code must return {success: true, result: data, toolName: "name"} structure');
    }

    // Check for proper return structure in error case
    const hasErrorReturn = code.includes('success: false') && code.includes('error:');
    if (!hasErrorReturn) {
      throw new Error(
        'Code must return {success: false, error: message, toolName: "name"} structure in catch blocks'
      );
    }
  }

  private detectCommonSyntaxErrors(code: string): void {
    const errors: string[] = [];

    // Check for common patterns from the logs
    if (code.includes('case ') && / case\s+[^:]+\s*=/.test(code)) {
      errors.push('Switch case using = instead of :');
    }

    // Check for unescaped quotes in strings
    if (/"[^"]*"[^"]*"[^"]*:/.test(code)) {
      errors.push('Potential string escaping issue - nested quotes not properly escaped');
    }

    // Check for duplicate const declarations
    const constMatches = code.match(/const\s+(\w+)/g);
    if (constMatches) {
      const constNames = constMatches.map((m) => m.replace('const ', ''));
      const duplicates = constNames.filter((name, index) => constNames.indexOf(name) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate const declarations: ${duplicates.join(', ')}`);
      }
    }

    // Check for malformed object properties
    if (/\w+\s+\w+\s*:/.test(code) && !/["']\w+\s+\w+["']\s*:/.test(code)) {
      errors.push('Object property names with spaces must be quoted');
    }

    // Check for missing colons in object properties
    if (/\{\s*\w+\s*=/.test(code)) {
      errors.push('Object properties must use : not = for assignment');
    }

    if (errors.length > 0) {
      throw new Error(`Common syntax errors detected: ${errors.join(', ')}`);
    }
  }

  private validateGeneratedCode(code: string, _expectedToolName: string): void {
    // Check for basic name property existence (but don't enforce exact matching)
    const hasNameProperty = /name\s*:\s*["'][^"']+["']/i.test(code);
    if (!hasNameProperty) {
      throw new Error('Generated code must include a name property');
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
