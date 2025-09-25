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
 * Execute tool code in sandboxed environment
 */
export async function executeToolInSandbox(
  code: string,
  toolName: string,
  params: any
): Promise<string> {
  try {
    const context = createToolContext();

    // Add the params to the context
    (context as any).params = params;

    // Wrap the code to capture the exported tool
    const wrappedCode = `
      ${code}

      // Execute the tool if it exists
      (async () => {
        const tool = typeof ${toolName} !== 'undefined' ? ${toolName} : module.exports;
        if (tool && typeof tool.invoke === 'function') {
          return await tool.invoke(params);
        } else {
          throw new Error('Tool ${toolName} not found or does not have invoke method');
        }
      })();
    `;

    const script = new vm.Script(wrappedCode);
    const result = await script.runInContext(context, {
      timeout: 30000, // 30 second timeout
      displayErrors: true,
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown execution error';
    logError(`[ToolEnv] Execution error for ${toolName}: ${errorMsg}`);
    throw error;
  }
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

  for (const { pattern, message } of dangerousPatterns) {
    if (pattern.test(code)) {
      errors.push(message);
    }
  }

  // Check for required structure
  if (!code.includes('invoke')) {
    errors.push('Tool must have an invoke method');
  }

  if (!code.includes('module.exports') && !code.includes('export')) {
    errors.push('Tool must export itself');
  }

  return {
    valid: errors.length === 0,
    errors,
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
