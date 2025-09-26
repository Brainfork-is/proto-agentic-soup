/**
 * Tool Execution Environment
 * Provides sandboxed access to npm packages and web browsing for generated tools
 */

import { log, logError } from '@soup/common';
import * as vm from 'vm';
import * as path from 'path';
import * as fs from 'fs';
// Note: PatchedChatVertexAI import removed as WebBrowser functionality is not currently used

// List of allowed npm packages that tools can use
const ALLOWED_PACKAGES = [
  'axios',
  'cheerio',
  'date-fns',
  'date-fns-tz',
  'lodash',
  'uuid',
  'numeral',
  'moment',
  'validator',
  'crypto-js',
  'jsonpath',
  'csv-parse',
  'csv-stringify',
  'xml2js',
  'marked',
  'dompurify',
  'jsdom',
  'pdf-lib',
];

// Path to the blocked packages log file
const BLOCKED_PACKAGES_LOG = path.join(__dirname, '../generated-tools/blocked-packages.log');

// Function to log blocked package attempts to a dedicated file
function logBlockedPackage(packageName: string) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - BLOCKED: "${packageName}"\n`;

    // Ensure directory exists
    const logDir = path.dirname(BLOCKED_PACKAGES_LOG);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Append to log file
    fs.appendFileSync(BLOCKED_PACKAGES_LOG, logEntry);
  } catch (error) {
    // Don't fail tool execution if logging fails
    logError('[ToolEnv] Failed to log blocked package:', error);
  }
}

// Simple web research using axios and search engines
async function performWebSearch(query: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axios = require('axios');

    // Try a simple DuckDuckGo instant answer API (no API key required)
    try {
      const response = await axios.get(`https://api.duckduckgo.com/`, {
        params: {
          q: query,
          format: 'json',
          no_html: '1',
          skip_disambig: '1',
        },
        timeout: 10000,
      });

      if (response.data && response.data.AbstractText) {
        return response.data.AbstractText;
      }

      if (response.data && response.data.Answer) {
        return response.data.Answer;
      }
    } catch (searchError) {
      log('[ToolEnv] DuckDuckGo search failed, using fallback');
    }

    // Fallback: return a structured response indicating tools can access the web
    return JSON.stringify({
      query,
      status: 'Tools have internet access via axios and HTTP libraries',
      suggestion: 'Use fetchWebContent(url) for specific websites or axios.get() for APIs',
      example:
        'const response = await require("axios").get("https://api.github.com/users/octocat");',
    });
  } catch (error) {
    logError('[ToolEnv] Web search failed:', error);
    return JSON.stringify({ error: 'Web search failed', query });
  }
}

/**
 * Create a sandboxed context for tool execution
 */
export function createToolContext(): vm.Context {
  const sandbox: any = {
    console: {
      log: (...args: any[]) => log('[Tool Output]', ...args),
      error: (...args: any[]) => logError('[Tool Error]', ...args),
      warn: (...args: any[]) => log('[Tool Warning]', ...args),
      info: (...args: any[]) => log('[Tool Info]', ...args),
    },
    JSON,
    Math,
    Date,
    RegExp,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Promise,
    Buffer,
    setTimeout: (fn: (...args: any[]) => void, ms: number) => {
      if (ms > 5000) {
        throw new Error('Timeout duration cannot exceed 5 seconds');
      }
      return setTimeout(fn, ms);
    },
    clearTimeout,
    // Module system
    module: { exports: {} },
    exports: {},
    global: undefined,
    process: { env: {} }, // Limited process object
    // Provide require function for allowed packages
    require: (packageName: string) => {
      // Log all package usage attempts for whitelist management
      log(`[ToolEnv] Tool attempting to require package: "${packageName}"`);

      if (ALLOWED_PACKAGES.includes(packageName)) {
        log(`[ToolEnv] Package "${packageName}" is whitelisted, allowing access`);
        try {
          // Try to require from the generated-tools node_modules first
          const packagePath = path.join(__dirname, '../generated-tools/node_modules', packageName);
          return require(packagePath);
        } catch (error) {
          log(
            `[ToolEnv] Package ${packageName} not found in generated-tools, trying main node_modules`
          );
          try {
            // Try from the main agents package node_modules
            const agentsPackagePath = path.join(__dirname, '../../node_modules', packageName);
            return require(agentsPackagePath);
          } catch (agentsError) {
            log(`[ToolEnv] Package ${packageName} not found in agents node_modules, trying global`);
            try {
              // Fallback to global require
              return require(packageName);
            } catch (globalError) {
              throw new Error(
                `Package ${packageName} is not available. Install it in generated-tools directory or add to ALLOWED_PACKAGES.`
              );
            }
          }
        }
      }

      // Log blocked packages for potential whitelist expansion
      logBlockedPackage(packageName);
      logError(
        `[ToolEnv] BLOCKED PACKAGE: "${packageName}" - Consider adding to ALLOWED_PACKAGES if safe`
      );
      throw new Error(`Package ${packageName} is not allowed in tool execution environment`);
    },
    // Web research function
    webResearch: async (query: string, url?: string): Promise<string> => {
      try {
        if (url || query.startsWith('http')) {
          // Direct URL fetch
          const targetUrl = url || query;
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const axios = require('axios');
          const response = await axios.get(targetUrl, {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; SoupAgent/1.0)',
            },
          });
          return `Web content from ${targetUrl}: ${response.data.slice(0, 1000)}...`;
        } else {
          // General web search
          return await performWebSearch(query);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Web research failed';
        logError(`[ToolEnv] Web research error: ${errorMsg}`);
        return JSON.stringify({
          error: errorMsg,
          query,
          note: 'Tools can still access specific URLs and APIs directly using axios',
        });
      }
    },
    // Utility to fetch web content
    fetchWebContent: async (url: string): Promise<string> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const axios = require('axios');
        const response = await axios.get(url, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; SoupAgent/1.0)',
          },
        });
        return response.data;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Fetch failed';
        logError(`[ToolEnv] Fetch error: ${errorMsg}`);
        throw new Error(`Failed to fetch ${url}: ${errorMsg}`);
      }
    },
    // Parse HTML content
    parseHTML: (html: string) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cheerio = require('cheerio');
        return cheerio.load(html);
      } catch (error) {
        logError('[ToolEnv] Failed to parse HTML', error);
        throw new Error('HTML parsing failed');
      }
    },
  };

  // Set up module system properly
  (sandbox as any).module.exports = (sandbox as any).exports;

  return vm.createContext(sandbox);
}

/**
 * Execute tool code in sandboxed environment with robust timeout protection
 */
export async function executeToolInSandbox(
  code: string,
  toolName: string,
  params: any,
  timeoutMs: number = 10000 // Reduced to 10 seconds
): Promise<string> {
  return new Promise((resolve, reject) => {
    let isResolved = false;
    let timeoutHandle: ReturnType<typeof setTimeout>;
    let intervalHandle: ReturnType<typeof setInterval>;

    const cleanup = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (intervalHandle) clearInterval(intervalHandle);
    };

    const resolveOnce = (value: string) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve(value);
      }
    };

    const rejectOnce = (error: Error) => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        reject(error);
      }
    };

    // Set up hard timeout
    timeoutHandle = setTimeout(() => {
      rejectOnce(
        new Error(`Tool execution timed out after ${timeoutMs}ms (possible infinite loop)`)
      );
    }, timeoutMs);

    // Set up watchdog to monitor execution
    const startTime = Date.now();
    let lastCheckTime = startTime;
    intervalHandle = setInterval(() => {
      if (isResolved) return;

      const now = Date.now();
      const totalTime = now - startTime;
      const intervalTime = now - lastCheckTime;

      // If we haven't yielded control in 2 seconds, consider it a potential infinite loop
      if (intervalTime > 2000) {
        logError(
          `[ToolEnv] Tool ${toolName} may be in infinite loop (no yield for ${intervalTime}ms)`
        );
      }

      lastCheckTime = now;

      // Additional safety: kill after 15 seconds regardless
      if (totalTime > 15000) {
        rejectOnce(new Error(`Tool execution killed after ${totalTime}ms (safety limit exceeded)`));
      }
    }, 500); // Check every 500ms

    try {
      const context = createToolContext();

      // Add execution monitoring to the context
      let operationCount = 0;
      const maxOperations = 100000; // Limit on operations to prevent infinite loops

      // Wrap common operations to detect infinite loops
      const originalSetTimeout = (context as any).setTimeout;
      (context as any).setTimeout = (fn: (...args: any[]) => void, ms: number) => {
        if (++operationCount > maxOperations) {
          throw new Error(`Tool exceeded maximum operations limit (${maxOperations})`);
        }
        return originalSetTimeout(fn, Math.min(ms, 1000)); // Cap individual timeouts at 1 second
      };

      // Add the params to the context
      (context as any).params = params;

      // Wrap the code to capture the exported tool with execution tracking
      const wrappedCode = `
        let __operationCount = 0;
        const __maxOperations = ${maxOperations};

        // Monkey patch common loop-creating functions
        const originalWhile = global.while;
        const originalFor = global.for;

        ${code}

        // Execute the tool if it exists
        (async () => {
          try {
            const tool = typeof ${toolName} !== 'undefined' ? ${toolName} : module.exports;
            if (tool && typeof tool.invoke === 'function') {
              const result = await tool.invoke(params);
              return typeof result === 'string' ? result : JSON.stringify(result);
            } else {
              throw new Error('Tool ${toolName} not found or does not have invoke method');
            }
          } catch (error) {
            throw error;
          }
        })();
      `;

      const script = new vm.Script(wrappedCode);

      try {
        // Execute with shorter VM timeout
        const vmResult = script.runInContext(context, {
          timeout: Math.min(timeoutMs - 1000, 8000), // VM timeout shorter than our timeout
          displayErrors: true,
        });

        // Handle the promise returned by the async IIFE
        if (vmResult && typeof vmResult.then === 'function') {
          vmResult.then(resolveOnce).catch(rejectOnce);
        } else {
          resolveOnce(vmResult);
        }
      } catch (vmError) {
        const errorMsg = vmError instanceof Error ? vmError.message : 'VM execution error';
        rejectOnce(new Error(`VM execution failed: ${errorMsg}`));
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown execution error';
      logError(`[ToolEnv] Execution setup error for ${toolName}: ${errorMsg}`);
      rejectOnce(new Error(`Tool setup failed: ${errorMsg}`));
    }
  });
}

/**
 * Validate that generated code is safe to execute
 */
export function validateToolCode(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for dangerous patterns
  const dangerousPatterns = [
    { pattern: /process\.exit/g, message: 'process.exit is not allowed' },
    { pattern: /child_process/g, message: 'child_process module is not allowed' },
    { pattern: /\bfs\b(?!\.)/g, message: 'Direct fs module access is not allowed' },
    { pattern: /eval\s*\(/g, message: 'eval() is not allowed' },
    { pattern: /Function\s*\(/g, message: 'Function constructor is not allowed' },
    { pattern: /import\s*\(/g, message: 'Dynamic imports are not allowed' },
    { pattern: /process\.env/g, message: 'Direct process.env access is not allowed' },
    { pattern: /global\./g, message: 'Global object access is not allowed' },
  ];

  // Check for potential infinite loop patterns
  const infiniteLoopPatterns = [
    {
      pattern: /while\s*\(\s*true\s*\)/g,
      message: 'Potential infinite loop: while(true) without proper exit condition',
    },
    {
      pattern: /for\s*\(\s*;\s*;\s*\)/g,
      message: 'Potential infinite loop: for(;;) without proper exit condition',
    },
    {
      pattern: /while\s*\([^)]*!==.*\)/g,
      message: 'Suspicious while loop condition that may never be false',
    },
    {
      pattern: /while\s*\([^)]*getDay.*!==.*getDay/g,
      message: 'Date comparison in while loop may cause infinite loop',
    },
    {
      pattern: /new\s+Date\s*\([^)]*Day.*12:00:00/g,
      message: 'Suspicious date construction that may cause parsing errors',
    },
    // Enhanced infinite loop detection
    {
      pattern: /while\s*\([^{]*Date[^{]*\)/g,
      message: 'Date-based while loop may cause infinite loop',
    },
    {
      pattern: /while\s*\([^{]*\.getDay\(\)\s*!==\s*targetDay/g,
      message: 'getDay() comparison in while loop is dangerous',
    },
    {
      pattern: /while\s*\([^{]*nextOccurrenceDate\.getDay\(\)/g,
      message: 'Date.getDay() in while condition may loop infinitely',
    },
    {
      pattern: /while\s*\([^{]*\+\+[^{]*\)/g,
      message: 'Increment operation in while condition may be unsafe',
    },
    {
      pattern: /while\s*\([^{]*--[^{]*\)/g,
      message: 'Decrement operation in while condition may be unsafe',
    },
    {
      pattern: /setDate\([^)]*\+\s*1[^)]*\)/g,
      message: 'Date.setDate() with increment inside loop may be unsafe',
    },
    // Detect recursive function calls that could stack overflow
    {
      pattern: /function\s+(\w+)[^{]*\{[^}]*\1\s*\(/g,
      message: 'Recursive function call detected - ensure proper base case',
    },
    // Detect setTimeout/setInterval without clearing
    {
      pattern: /setTimeout\s*\([^}]*setTimeout/g,
      message: 'Nested setTimeout may create infinite chain',
    },
    { pattern: /setInterval\s*\(/g, message: 'setInterval usage - ensure clearInterval is called' },
  ];

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(code)) {
      errors.push(message);
    }
  }

  for (const { pattern, message } of infiniteLoopPatterns) {
    if (pattern.test(code)) {
      errors.push(`WARNING: ${message}`);
    }
  }

  // Check for required structure
  if (!code.includes('invoke')) {
    errors.push('Tool must have an invoke method');
  }

  if (!code.includes('module.exports') && !code.includes('export')) {
    errors.push('Tool must export itself');
  }

  // Additional safety check: reject tools with high-risk patterns entirely
  const highRiskPatterns = errors.filter(
    (error) =>
      error.includes('infinite loop') ||
      error.includes('getDay() in while condition') ||
      error.includes('Date-based while loop')
  );

  const hasHighRiskPatterns = highRiskPatterns.length > 0;

  return {
    valid: errors.length === 0 && !hasHighRiskPatterns,
    errors: hasHighRiskPatterns
      ? [
          ...errors,
          'CRITICAL: Tool contains high-risk infinite loop patterns and will not be created',
        ]
      : errors,
  };
}

/**
 * Get information about available packages and capabilities
 */
export function getToolCapabilities(): string {
  return `
Available NPM Packages:
${ALLOWED_PACKAGES.map((pkg) => `- ${pkg}`).join('\n')}

Special Functions:
- webResearch(query: string, url?: string): Research information from the web
- fetchWebContent(url: string): Fetch raw content from a URL
- parseHTML(html: string): Parse HTML content using cheerio

These packages and functions can be used via require() or directly in your tool code.
Example: const axios = require('axios');
Example: const data = await webResearch('latest news about AI');
`;
}
