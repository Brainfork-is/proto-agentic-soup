/**
 * Dedicated timeout and HTTP error logging utilities
 * Provides structured logging for debugging remote LLM provider issues
 */

import { log, logError } from '@soup/common';
import * as fs from 'fs-extra';
import * as path from 'path';

// Configuration for log files
// Default to soup-runner's logs directory if we're in the monorepo structure
const defaultLogDir = fs.existsSync('./apps/soup-runner/logs')
  ? './apps/soup-runner/logs'
  : path.join(process.cwd(), 'logs');
const LOG_DIR = process.env.TIMEOUT_LOG_DIR || defaultLogDir;
const TIMEOUT_LOG_FILE = path.join(LOG_DIR, 'timeouts.jsonl');
const PERFORMANCE_LOG_FILE = path.join(LOG_DIR, 'performance.jsonl');
const MAX_LOG_SIZE_MB = 50; // Rotate logs when they exceed this size
const MAX_LOG_FILES = 5; // Keep this many rotated files

// Ensure log directory exists
async function ensureLogDirectory(): Promise<void> {
  try {
    await fs.ensureDir(LOG_DIR);
  } catch (error) {
    console.warn('Failed to create log directory:', error);
  }
}

// Rotate log file if it's too large
async function rotateLogIfNeeded(logFile: string): Promise<void> {
  try {
    const stats = await fs.stat(logFile).catch(() => null);
    if (stats && stats.size > MAX_LOG_SIZE_MB * 1024 * 1024) {
      // Rotate existing files
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const oldFile = `${logFile}.${i}`;
        const newFile = `${logFile}.${i + 1}`;
        if (await fs.pathExists(oldFile)) {
          await fs.move(oldFile, newFile, { overwrite: true });
        }
      }

      // Move current log to .1
      await fs.move(logFile, `${logFile}.1`);
    }
  } catch (error) {
    console.warn('Failed to rotate log file:', error);
  }
}

// Write to log file with rotation
async function writeToLogFile(logFile: string, data: any): Promise<void> {
  try {
    await ensureLogDirectory();
    await rotateLogIfNeeded(logFile);

    const logLine = JSON.stringify(data) + '\n';
    await fs.appendFile(logFile, logLine, 'utf8');
  } catch (error) {
    console.warn(`Failed to write to log file ${logFile}:`, error);
  }
}

export interface TimeoutErrorContext {
  requestId: string;
  url: string;
  model: string;
  promptLength: number;
  promptPreview: string;
  responseTime: number;
  httpStatus?: number;
  statusText?: string;
  errorBody?: string;
  headers?: Record<string, string>;
  component?: string;
  config?: Record<string, any>;
}

/**
 * Logs timeout errors with full context for debugging
 */
export async function logTimeoutError(context: TimeoutErrorContext): Promise<void> {
  const {
    requestId,
    url,
    model,
    promptLength,
    promptPreview,
    responseTime,
    httpStatus,
    statusText,
    errorBody,
    headers,
    component,
    config,
  } = context;

  const timeoutType =
    httpStatus === 524
      ? 'GATEWAY_TIMEOUT'
      : httpStatus === 504
        ? 'GATEWAY_TIMEOUT_504'
        : 'CLIENT_TIMEOUT';

  const consoleLogData = {
    // Request identification
    requestId,
    component: component || 'unknown',
    timestamp: new Date().toISOString(),

    // Server details
    url,
    model,
    httpStatus,
    statusText,

    // Request details
    promptLength,
    promptPreview,
    responseTime,

    // Configuration
    config,

    // Response details
    errorBody: errorBody?.substring(0, 1000),
    responseHeaders: headers,

    // Analysis flags
    isRemoteEndpoint: url.includes('https://'),
    isLongRequest: promptLength > 5000,
    isSlowResponse: responseTime > 30000,
    isGatewayTimeout: httpStatus === 524 || httpStatus === 504,

    // Debugging hints
    debugHints: {
      likelyOverloaded: responseTime > 60000,
      possibleNetworkIssue: httpStatus === 524,
      suggestRetry: responseTime < 30000,
      suggestFallback: responseTime > 60000,
    },
  };

  // Log to console
  logError(
    `🔥 TIMEOUT ERROR [${timeoutType}] Request ${requestId} failed after ${responseTime}ms`,
    consoleLogData
  );

  // Create detailed log entry for file
  const fileLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    type: 'TIMEOUT',
    timeoutType,
    requestId,
    component: component || 'unknown',

    // Request details
    url,
    model,
    promptLength,
    promptPreview,
    responseTime,

    // HTTP details
    httpStatus,
    statusText,
    errorBody: errorBody?.substring(0, 2000), // More detail in file
    responseHeaders: headers,

    // Configuration
    config,

    // Analysis
    analysis: {
      isRemoteEndpoint: url.includes('https://'),
      isLongRequest: promptLength > 5000,
      isSlowResponse: responseTime > 30000,
      isGatewayTimeout: httpStatus === 524 || httpStatus === 504,
      likelyOverloaded: responseTime > 60000,
      possibleNetworkIssue: httpStatus === 524,
      suggestRetry: responseTime < 30000,
      suggestFallback: responseTime > 60000,
    },

    // Full context for debugging
    fullContext: context,
  };

  // Write to timeout log file (async, don't wait for it)
  writeToLogFile(TIMEOUT_LOG_FILE, fileLogEntry).catch((error) => {
    console.warn('Failed to write timeout to log file:', error);
  });

  // Also log a simple entry to console for grep-ability
  log(
    `[TIMEOUT_LOG] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      component,
      url,
      model,
      promptLength,
      responseTime,
      httpStatus,
      error: statusText,
      type: timeoutType,
    })}`
  );
}

/**
 * Logs successful requests for performance monitoring
 */
export function logSuccessfulRequest(context: {
  requestId: string;
  url: string;
  model: string;
  promptLength: number;
  responseTime: number;
  responseLength: number;
  component?: string;
}): void {
  const { requestId, url, model, promptLength, responseTime, responseLength, component } = context;

  // Log slow but successful requests for performance monitoring
  if (responseTime > 10000) {
    log(`⚠️  SLOW REQUEST [${requestId}] completed in ${responseTime}ms`, {
      requestId,
      component,
      url,
      model,
      promptLength,
      responseTime,
      responseLength,
      isSlowButSuccessful: true,
    });
  } else if (responseTime > 5000) {
    log(`📊 REQUEST [${requestId}] completed in ${responseTime}ms`, {
      requestId,
      responseTime,
      model,
      promptLength,
      responseLength,
    });
  }

  // Create performance log entry for file (log all successful requests for analysis)
  const performanceLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    type: 'PERFORMANCE',
    requestId,
    component: component || 'unknown',

    // Request details
    url,
    model,
    promptLength,
    responseTime,
    responseLength,

    // Performance metrics
    metrics: {
      requestsPerSecond: 1 / (responseTime / 1000),
      tokensPerSecond: responseLength / (responseTime / 1000),
      isSlow: responseTime > 5000,
      isVerySlow: responseTime > 10000,
      isLongPrompt: promptLength > 5000,
      isLongResponse: responseLength > 2000,
      efficiency: responseLength / responseTime, // characters per ms
    },

    // Classification
    performanceClass:
      responseTime > 10000
        ? 'SLOW'
        : responseTime > 5000
          ? 'MODERATE'
          : responseTime > 2000
            ? 'FAST'
            : 'VERY_FAST',
  };

  // Write to performance log file (async, don't wait for it)
  writeToLogFile(PERFORMANCE_LOG_FILE, performanceLogEntry).catch((error) => {
    console.warn('Failed to write performance data to log file:', error);
  });
}

/**
 * Creates a timeout error with enhanced debugging information
 */
export function createTimeoutError(context: TimeoutErrorContext): Error {
  const { requestId, responseTime, httpStatus, url, model } = context;

  let message: string;

  if (httpStatus === 524) {
    message = `Gateway timeout (524): Remote server at ${url} took too long to respond (${responseTime}ms). Model: ${model}`;
  } else if (httpStatus === 504) {
    message = `Gateway timeout (504): Remote server timeout after ${responseTime}ms. Model: ${model}`;
  } else {
    message = `Request timeout: Failed after ${responseTime}ms. Model: ${model}`;
  }

  const error = new Error(message);
  (error as any).requestId = requestId;
  (error as any).responseTime = responseTime;
  (error as any).httpStatus = httpStatus;
  (error as any).isTimeout = true;

  return error;
}

/**
 * Utility functions for analyzing log files
 */
export const LogAnalyzer = {
  /**
   * Get log file paths
   */
  getLogPaths(): { timeouts: string; performance: string; logDir: string } {
    return {
      timeouts: TIMEOUT_LOG_FILE,
      performance: PERFORMANCE_LOG_FILE,
      logDir: LOG_DIR,
    };
  },

  /**
   * Read and parse timeout log entries from a specific date
   */
  async readTimeoutLogs(date?: string): Promise<any[]> {
    try {
      const content = await fs.readFile(TIMEOUT_LOG_FILE, 'utf8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      let entries = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((entry) => entry !== null);

      if (date) {
        entries = entries.filter((entry) => entry.timestamp.startsWith(date));
      }

      return entries;
    } catch (error) {
      console.warn('Failed to read timeout logs:', error);
      return [];
    }
  },

  /**
   * Read and parse performance log entries from a specific date
   */
  async readPerformanceLogs(date?: string): Promise<any[]> {
    try {
      const content = await fs.readFile(PERFORMANCE_LOG_FILE, 'utf8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);

      let entries = lines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((entry) => entry !== null);

      if (date) {
        entries = entries.filter((entry) => entry.timestamp.startsWith(date));
      }

      return entries;
    } catch (error) {
      console.warn('Failed to read performance logs:', error);
      return [];
    }
  },

  /**
   * Generate a summary of timeout issues
   */
  async analyzeTimeouts(date?: string): Promise<{
    totalTimeouts: number;
    timeoutsByType: Record<string, number>;
    timeoutsByModel: Record<string, number>;
    averageResponseTime: number;
    mostProblematicUrl: string;
  }> {
    const entries = await this.readTimeoutLogs(date);

    const summary = {
      totalTimeouts: entries.length,
      timeoutsByType: {} as Record<string, number>,
      timeoutsByModel: {} as Record<string, number>,
      averageResponseTime: 0,
      mostProblematicUrl: '',
    };

    if (entries.length === 0) return summary;

    // Count by type
    entries.forEach((entry) => {
      const type = entry.timeoutType || 'UNKNOWN';
      summary.timeoutsByType[type] = (summary.timeoutsByType[type] || 0) + 1;

      const model = entry.model || 'UNKNOWN';
      summary.timeoutsByModel[model] = (summary.timeoutsByModel[model] || 0) + 1;
    });

    // Average response time
    const totalTime = entries.reduce((sum, entry) => sum + (entry.responseTime || 0), 0);
    summary.averageResponseTime = totalTime / entries.length;

    // Most problematic URL
    const urlCounts = entries.reduce(
      (counts, entry) => {
        const url = entry.url || 'UNKNOWN';
        counts[url] = (counts[url] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>
    );

    summary.mostProblematicUrl =
      Object.entries(urlCounts).sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] ||
      'NONE';

    return summary;
  },
};
