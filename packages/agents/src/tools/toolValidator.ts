/**
 * Tool Validator - Safety and quality checks for generated tools
 */

import { log, logError } from '@soup/common';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

export class ToolValidator {
  /**
   * Validate generated tool code for safety and quality
   */
  validateToolCode(code: string, toolName: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      riskLevel: 'low',
    };

    try {
      // Basic syntax validation
      this.validateBasicStructure(code, toolName, result);

      // Security validation
      this.validateSecurity(code, result);

      // Performance validation
      this.validatePerformance(code, result);

      // Quality validation
      this.validateQuality(code, result);

      // Determine overall validity
      result.isValid = result.errors.length === 0;

      // Determine risk level
      if (result.errors.length > 0) {
        result.riskLevel = 'high';
      } else if (result.warnings.length > 2) {
        result.riskLevel = 'medium';
      } else {
        result.riskLevel = 'low';
      }

      log(
        `[ToolValidator] Validation complete for ${toolName}: ${result.isValid ? 'VALID' : 'INVALID'} (${result.riskLevel} risk)`
      );
    } catch (error) {
      result.isValid = false;
      result.errors.push(
        `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      result.riskLevel = 'high';
      logError('[ToolValidator] Validation process failed:', error);
    }

    return result;
  }

  /**
   * Validate basic tool structure
   */
  private validateBasicStructure(code: string, toolName: string, result: ValidationResult): void {
    // Check for required components
    if (!code.includes(`name: '${toolName}'`) && !code.includes(`name: "${toolName}"`)) {
      result.errors.push(`Tool must have name property set to '${toolName}'`);
    }

    if (!code.includes('description:')) {
      result.errors.push('Tool must have description property');
    }

    if (!code.includes('async invoke(') && !code.includes('invoke: async')) {
      result.errors.push('Tool must have async invoke method');
    }

    if (!code.includes('JSON.stringify')) {
      result.errors.push('Tool must return JSON strings using JSON.stringify');
    }

    if (!code.includes('try') || !code.includes('catch')) {
      result.errors.push('Tool must include try-catch error handling');
    }

    // Check for proper exports
    if (!code.includes('export') && !code.includes('module.exports')) {
      result.errors.push('Tool must properly export the tool object');
    }
  }

  /**
   * Validate security aspects
   */
  private validateSecurity(code: string, result: ValidationResult): void {
    // Dangerous Node.js modules
    const dangerousModules = [
      'fs',
      'fs-extra',
      'child_process',
      'cluster',
      'dgram',
      'dns',
      'http',
      'https',
      'http2',
      'net',
      'tls',
      'worker_threads',
      'vm',
      'vm2',
      'inspector',
    ];

    for (const module of dangerousModules) {
      const patterns = [
        new RegExp(`require\\s*\\(\\s*['"\`]${module}['"\`]\\s*\\)`, 'g'),
        new RegExp(`import\\s+.*\\s+from\\s+['"\`]${module}['"\`]`, 'g'),
        new RegExp(`import\\s*\\(\\s*['"\`]${module}['"\`]\\s*\\)`, 'g'),
      ];

      for (const pattern of patterns) {
        if (pattern.test(code)) {
          result.errors.push(`Dangerous module usage detected: ${module}`);
        }
      }
    }

    // Dangerous global objects and functions
    const dangerousGlobals = [
      'eval',
      'Function',
      'setTimeout',
      'setInterval',
      'setImmediate',
      'process.exit',
      'process.kill',
      'global',
      'globalThis',
    ];

    for (const dangerous of dangerousGlobals) {
      if (code.includes(dangerous)) {
        result.errors.push(`Dangerous global usage detected: ${dangerous}`);
      }
    }

    // Dynamic code execution patterns
    const dynamicExecution = [
      /new\s+Function\s*\(/g,
      /eval\s*\(/g,
      /setTimeout\s*\(\s*['"`]/g,
      /setInterval\s*\(\s*['"`]/g,
    ];

    for (const pattern of dynamicExecution) {
      if (pattern.test(code)) {
        result.errors.push(`Dynamic code execution detected: ${pattern.source}`);
      }
    }

    // File system access patterns
    const fileSystemPatterns = [
      /\.readFile\s*\(/g,
      /\.writeFile\s*\(/g,
      /\.unlink\s*\(/g,
      /\.mkdir\s*\(/g,
      /\.rmdir\s*\(/g,
      /\.stat\s*\(/g,
    ];

    for (const pattern of fileSystemPatterns) {
      if (pattern.test(code)) {
        result.warnings.push(`File system operation detected: ${pattern.source}`);
      }
    }

    // Network access patterns
    const networkPatterns = [
      /fetch\s*\(/g,
      /XMLHttpRequest/g,
      /axios\./g,
      /\.get\s*\(/g,
      /\.post\s*\(/g,
    ];

    for (const pattern of networkPatterns) {
      if (pattern.test(code)) {
        result.warnings.push(`Network operation detected: ${pattern.source}`);
      }
    }
  }

  /**
   * Validate performance aspects
   */
  private validatePerformance(code: string, result: ValidationResult): void {
    // Check for infinite loops
    const loopPatterns = [/while\s*\(\s*true\s*\)/g, /for\s*\(\s*;;\s*\)/g, /while\s*\(\s*1\s*\)/g];

    for (const pattern of loopPatterns) {
      if (pattern.test(code)) {
        result.errors.push(`Potential infinite loop detected: ${pattern.source}`);
      }
    }

    // Check for recursive functions without base case
    if (code.includes('function') && code.includes('return ')) {
      // Simple heuristic for recursion detection
      const functionNameMatch = code.match(/function\s+(\w+)/);
      if (functionNameMatch) {
        const functionName = functionNameMatch[1];
        if (code.includes(functionName + '(')) {
          result.warnings.push('Recursive function detected - ensure proper base case');
        }
      }
    }

    // Check for large data structures
    const largeDataPatterns = [/new\s+Array\s*\(\s*\d{6,}\s*\)/g, /\.repeat\s*\(\s*\d{4,}\s*\)/g];

    for (const pattern of largeDataPatterns) {
      if (pattern.test(code)) {
        result.warnings.push(`Large data structure detected: ${pattern.source}`);
      }
    }

    // Check for missing input validation
    if (!code.includes('typeof') && !code.includes('instanceof')) {
      result.warnings.push('Consider adding input type validation');
    }
  }

  /**
   * Validate code quality
   */
  private validateQuality(code: string, result: ValidationResult): void {
    // Check for console.log usage (should use proper logging)
    if (code.includes('console.log')) {
      result.warnings.push('Consider using proper logging instead of console.log');
    }

    // Check for hardcoded values
    const hardcodedPatterns = [
      /['"`]\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}['"`]/g, // IP addresses
      /['"`][a-zA-Z0-9+/]{20,}['"`]/g, // Potential API keys/tokens
      /['"`]pk_[a-zA-Z0-9_]+['"`]/g, // API key patterns
      /['"`]sk_[a-zA-Z0-9_]+['"`]/g, // Secret key patterns
    ];

    for (const pattern of hardcodedPatterns) {
      if (pattern.test(code)) {
        result.warnings.push('Hardcoded sensitive value detected');
      }
    }

    // Check for proper error messages
    const errorCount = (code.match(/throw new Error/g) || []).length;
    const returnErrorCount = (code.match(/return JSON.stringify.*error/g) || []).length;

    if (errorCount === 0 && returnErrorCount === 0) {
      result.warnings.push('Consider adding more specific error handling');
    }

    // Check for documentation
    if (!code.includes('//') && !code.includes('/*')) {
      result.warnings.push('Consider adding code comments for complex logic');
    }

    // Check code length (too simple might not be useful, too complex might be risky)
    const codeLength = code.length;
    if (codeLength < 200) {
      result.warnings.push('Tool appears very simple - ensure it provides value');
    } else if (codeLength > 5000) {
      result.warnings.push('Tool is very complex - consider breaking into smaller functions');
    }
  }

  /**
   * Validate tool execution result
   */
  validateExecutionResult(
    result: string,
    toolName: string
  ): { isValid: boolean; parsedResult?: any; error?: string } {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(result);

      // Check for expected structure
      if (typeof parsed !== 'object' || parsed === null) {
        return {
          isValid: false,
          error: 'Tool result must be a JSON object',
        };
      }

      // Check for success indicator
      if (!('success' in parsed)) {
        return {
          isValid: false,
          error: 'Tool result must include success field',
        };
      }

      return {
        isValid: true,
        parsedResult: parsed,
      };
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid JSON result from tool ${toolName}: ${error instanceof Error ? error.message : 'Parse error'}`,
      };
    }
  }

  /**
   * Generate safety score for a tool based on validation results
   */
  calculateSafetyScore(validation: ValidationResult): number {
    let score = 100;

    // Deduct for errors (major issues)
    score -= validation.errors.length * 25;

    // Deduct for warnings (minor issues)
    score -= validation.warnings.length * 5;

    // Risk level adjustment
    switch (validation.riskLevel) {
      case 'high':
        score -= 20;
        break;
      case 'medium':
        score -= 10;
        break;
      case 'low':
        // No additional deduction
        break;
    }

    return Math.max(0, Math.min(100, score));
  }
}

// Create singleton instance
export const toolValidator = new ToolValidator();
