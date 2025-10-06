import Fastify from 'fastify';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
// Prisma is imported dynamically to avoid requiring a generated client in bootstrap mode
import { gini, topKShare, loadRunnerConfig, log, logError } from '@soup/common';
import fs from 'fs-extra';
import path from 'path';

// Load config first to ensure environment variables are available for agents
const cfg = loadRunnerConfig();

// Import agents after config is loaded to ensure env vars are available
import {
  createAgentForBlueprint,
  jobGenerator,
  llmGrader,
  createSwarmAgent,
  ToolBuilderAgent,
} from '@soup/agents';
import { NameGenerator } from '@soup/agents';
import { ModelPreloader } from '@soup/agents';
import type { SwarmConfig } from '@soup/agents';
const BOOTSTRAP = cfg.SOUP_BOOTSTRAP;

// Initialize name generator
const nameGenerator = new NameGenerator();

const app = Fastify();

// Add CORS headers
app.addHook('preHandler', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return reply.status(200).send();
  }
});
let redis: any;
let prisma: any;

const JOBS_PER_MIN = cfg.JOBS_PER_MIN;
const EPOCH_MINUTES = cfg.EPOCH_MINUTES;
const FAIL_PENALTY = cfg.FAIL_PENALTY;

const RUN_DIR = path.join(process.cwd(), 'runs', String(Date.now()));
const METRICS_DIR = path.join(RUN_DIR, 'metrics');
fs.ensureDirSync(METRICS_DIR);

// Debug logging functionality removed - using console.log directly

// System control state
let systemState: {
  status: 'running' | 'paused';
  startedAt: Date | null;
  pausedAt: Date | null;
} = {
  status: 'running', // Start in running state by default
  startedAt: new Date(),
  pausedAt: null,
};

// Workers and intervals to control
let jobWorkers: Worker[] = [];
let jobGeneratorInterval: ReturnType<typeof setInterval> | null = null;
let metricsInterval: ReturnType<typeof setInterval> | null = null;

// System control endpoints
app.post('/api/system/start', async (_request, _reply) => {
  if (systemState.status === 'running') {
    return { success: false, message: 'System is already running' };
  }

  try {
    systemState = {
      status: 'running',
      startedAt: new Date(),
      pausedAt: null,
    };

    // Start or resume job generation and workers with timeout
    const startPromise = startSystemProcesses();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Start process timed out after 30 seconds')), 30000)
    );

    await Promise.race([startPromise, timeoutPromise]);

    log('[System] Started soup runner system');
    return { success: true, message: 'System started successfully', status: systemState };
  } catch (error) {
    systemState.status = 'paused';
    systemState.pausedAt = new Date();
    logError('[System] Failed to start system:', error);
    return { success: false, message: `Failed to start: ${(error as Error).message}` };
  }
});

app.post('/api/system/pause', async (_request, _reply) => {
  if (systemState.status !== 'running') {
    return { success: false, message: 'System is not currently running' };
  }

  try {
    systemState.status = 'paused';
    systemState.pausedAt = new Date();

    // Stop all workers and intervals
    await stopSystemProcesses();

    log('[System] Paused soup runner system');
    return { success: true, message: 'System paused successfully', status: systemState };
  } catch (error) {
    logError('[System] Failed to pause system:', error);
    return { success: false, message: `Failed to pause: ${(error as Error).message}` };
  }
});

app.post('/api/system/reset', async (_request, _reply) => {
  try {
    // Stop the system first
    await stopSystemProcesses();

    // Reset database (clear agents, jobs, ledger, swarms)
    if (!BOOTSTRAP && prisma) {
      log('[System] Resetting database...');
      await prisma.ledger.deleteMany({});
      await prisma.agentState.deleteMany({});
      await prisma.swarm.deleteMany({});
      await prisma.job.deleteMany({});
      await prisma.blueprint.deleteMany({});
      log('[System] Database reset complete');

      // Preload models before reseeding (name generation needs LLM)
      await preloadOllamaModels();

      // Reseed the database with new agents/swarms
      log('[System] Reseeding agents and swarms...');
      await seedIfEmpty();
      log('[System] Reseeding complete');
    }

    // Reset system state
    systemState = {
      status: 'paused',
      startedAt: null,
      pausedAt: new Date(),
    };

    log('[System] Reset soup runner system');
    return {
      success: true,
      message: 'System reset and reseeded successfully',
      status: systemState,
    };
  } catch (error) {
    logError('[System] Failed to reset system:', error);
    return { success: false, message: `Failed to reset: ${(error as Error).message}` };
  }
});

app.get('/api/system/status', async (_request, _reply) => {
  return {
    success: true,
    status: systemState,
    uptime: systemState.startedAt ? Date.now() - systemState.startedAt.getTime() : 0,
    processes: {
      jobWorkers: jobWorkers.length,
      jobGeneratorActive: jobGeneratorInterval !== null,
      metricsActive: metricsInterval !== null,
    },
  };
});

async function startSystemProcesses() {
  log('[System] Starting job generation and worker processes...');

  try {
    // Start job generation interval
    if (!jobGeneratorInterval) {
      jobGeneratorInterval = setInterval(generateJobs, 60_000);
      generateJobs().catch(console.error); // Generate first batch immediately
    }

    // Start agent workers with error handling
    log('[System] Starting agent workers...');
    await startAgentWorkers();
    log('[System] Agent workers started successfully');

    // Start metrics collection interval
    if (!metricsInterval) {
      metricsInterval = setInterval(() => epochTick().catch(console.error), EPOCH_MINUTES * 60_000);
    }

    log('[System] All processes started successfully');
  } catch (error) {
    logError('[System] Error in startSystemProcesses:', error);
    throw error; // Re-throw to be caught by the API handler
  }
}

async function stopSystemProcesses() {
  // Stop job generator
  if (jobGeneratorInterval) {
    clearInterval(jobGeneratorInterval);
    jobGeneratorInterval = null;
  }

  // Stop metrics collection
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }

  // Close all workers
  for (const worker of jobWorkers) {
    try {
      await worker.close();
    } catch (error) {
      logError('[System] Error closing worker:', error);
    }
  }
  jobWorkers = [];

  log('[System] All system processes stopped');
}

async function preloadOllamaModels() {
  try {
    // Check if model preloading is enabled
    if (!cfg.PRELOAD_MODELS) {
      log('[System] Model preloading disabled via PRELOAD_MODELS=false');
      return;
    }

    // Get the Ollama URL from config
    const ollamaUrl = cfg.OLLAMA_URL;

    // Get unique models used by the system
    const modelsToPreload = await getSystemModels();

    if (modelsToPreload.length === 0) {
      log('[System] No models to preload');
      return;
    }

    log(
      `[System] Preloading ${modelsToPreload.length} Ollama model(s): ${modelsToPreload.join(', ')}`
    );

    const preloader = new ModelPreloader(ollamaUrl);

    // Get estimates to show expected time
    const estimates = await preloader.getPreloadEstimate(modelsToPreload);
    const totalEstimateMs = estimates.reduce((sum, e) => sum + e.estimatedMs, 0);

    if (totalEstimateMs > 10000) {
      log(`[System] Estimated preload time: ${Math.ceil(totalEstimateMs / 1000)}s`);
    }

    // Check which models are already loaded to avoid unnecessary work
    const loadedModels = await preloader.getLoadedModels();
    const modelsNeedingLoad = modelsToPreload.filter((model) => !loadedModels.includes(model));

    if (modelsNeedingLoad.length === 0) {
      log('[System] All required models are already loaded ✅');
      return;
    }

    if (modelsNeedingLoad.length < modelsToPreload.length) {
      log(
        `[System] ${loadedModels.length} model(s) already loaded, preloading ${modelsNeedingLoad.length} additional model(s)`
      );
    }

    // Preload the models that need loading using config values
    const result = await preloader.preloadModels(modelsNeedingLoad, {
      timeoutMs: cfg.PRELOAD_TIMEOUT_SECONDS * 1000,
      retryAttempts: cfg.PRELOAD_RETRY_ATTEMPTS,
      retryDelayMs: 2000,
    });

    if (result.success) {
      log(
        `[System] ✅ Model preloading completed successfully in ${Math.ceil(result.totalTime / 1000)}s`
      );
    } else {
      logError(`[System] ⚠️  Model preloading partially failed:`, {
        loaded: result.loadedModels,
        failed: result.failedModels,
        errors: result.errors,
      });

      // Don't fail startup if some models failed to preload, just log the warning
      log(
        '[System] Continuing with startup despite model preload failures - models will load on first use'
      );
    }
  } catch (error) {
    // Don't fail startup due to preload errors, just log and continue
    logError('[System] Model preloading failed, continuing anyway:', error);
    log('[System] Models will be loaded on first use (may cause initial delays)');
  }
}

async function getSystemModels(): Promise<string[]> {
  try {
    if (BOOTSTRAP) {
      return []; // No models needed in bootstrap mode
    }

    const models = new Set<string>();

    // Get models from agent blueprints (if any exist)
    if (prisma) {
      try {
        const blueprints = await prisma.blueprint.findMany({
          select: { llmModel: true },
        });

        for (const bp of blueprints) {
          if (bp.llmModel && bp.llmModel.trim()) {
            models.add(bp.llmModel.trim());
          }
        }
      } catch (error) {
        // Ignore database errors during early startup - table might not exist yet
        log('[System] Blueprint table not ready, using environment defaults for model preloading');
      }
    }

    // Add default models from environment
    // These are needed especially during first startup when no blueprints exist yet
    const defaultModel = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || cfg.DEFAULT_MODEL;
    if (defaultModel) {
      models.add(defaultModel);
    }

    // Add grader model if different from default
    const graderModel = process.env.GRADER_MODEL;
    if (graderModel && graderModel !== defaultModel) {
      models.add(graderModel);
    }

    // Add models from all component-specific LLM configs
    const llmConfigs = [
      'LLM_CONFIG_NAME_GENERATOR',
      'LLM_CONFIG_JOB_GENERATOR',
      'LLM_CONFIG_RESULT_GRADER',
      'LLM_CONFIG_AGENT',
      'LLM_CONFIG_CODE_GENERATOR',
      'LLM_CONFIG_SWARM_SYNTHESIZER',
      'LLM_CONFIG_TOOL_BUILDER',
    ];

    for (const configKey of llmConfigs) {
      const configValue = process.env[configKey];
      if (configValue && configValue.trim()) {
        const parts = configValue.split(':');
        // Format: "provider:model:temperature:maxTokens" or "provider:model:temperature"
        // But model name might contain colons too (e.g., "gpt-oss:120b")
        if (parts.length >= 2 && parts[0] === 'ollama') {
          // Reconstruct model name by joining all parts except provider, temperature, and maxTokens
          // Expected formats:
          // - ollama:model:temp:tokens
          // - ollama:model:temp:
          // - ollama:model:temp
          // - ollama:model:with:colons:temp:tokens

          let modelName;
          if (parts.length === 2) {
            modelName = parts[1]; // ollama:model
          } else if (parts.length === 3) {
            modelName = parts[1]; // ollama:model:temp
          } else if (parts.length === 4) {
            modelName = parts[1]; // ollama:model:temp:tokens
          } else {
            // Handle complex model names like "gpt-oss:120b" in "ollama:gpt-oss:120b:0.9:"
            // Take all parts except first (provider), last 2 (temp, tokens), if last is empty
            const lastPart = parts[parts.length - 1];
            const secondLastPart = parts[parts.length - 2];

            if (lastPart === '' && !isNaN(parseFloat(secondLastPart))) {
              // Format: "ollama:model:name:temp:" - join from index 1 to length-2
              modelName = parts.slice(1, -2).join(':');
            } else if (!isNaN(parseFloat(lastPart)) && !isNaN(parseFloat(secondLastPart))) {
              // Format: "ollama:model:name:temp:tokens" - join from index 1 to length-2
              modelName = parts.slice(1, -2).join(':');
            } else {
              // Format: "ollama:model:name:temp" - join from index 1 to length-1
              modelName = parts.slice(1, -1).join(':');
            }
          }

          models.add(modelName);
          log(`[System] Found Ollama model in ${configKey}: ${modelName}`);
        }
      }
    }

    // Filter out any non-Ollama models since we're only preloading Ollama
    const ollamaModels = Array.from(models).filter((model) => {
      // If using mixed providers, we should only preload Ollama models
      // Only filter out obvious cloud provider models, but keep local models like gpt-oss
      return (
        !model.includes('gemini') &&
        !model.includes('gpt-4') &&
        !model.includes('gpt-3.5') &&
        !model.includes('claude') &&
        !model.startsWith('text-') && // OpenAI completion models
        !model.startsWith('davinci') && // OpenAI legacy models
        !model.startsWith('curie') &&
        !model.startsWith('babbage') &&
        !model.startsWith('ada')
      );
    });

    log(`[System] Detected ${models.size} total models: ${Array.from(models).join(', ')}`);
    log(`[System] Filtered to ${ollamaModels.length} Ollama models: ${ollamaModels.join(', ')}`);

    return ollamaModels;
  } catch (error) {
    logError('[System] Failed to get system models:', error);

    // Fallback to common default models
    const fallbackModel = cfg.DEFAULT_MODEL || 'llama3.2';
    if (!fallbackModel.includes('gemini') && !fallbackModel.includes('gpt')) {
      return [fallbackModel];
    }

    return [];
  }
}

app.get('/leaderboard', async () => {
  // Show swarm leaderboard (swarms-only mode)
  const swarms = await prisma.swarm.findMany();
  const rows = swarms
    .map((x: any) => ({
      swarmId: x.id,
      name: x.name,
      balance: x.balance,
      wins: x.wins,
      attempts: x.attempts,
      reputation: x.reputation,
      meanTtcSec: x.meanTtcSec,
    }))
    .sort((a: any, b: any) => b.balance - a.balance)
    .slice(0, 20);
  return { rows, mode: 'swarms' };
});

// Dashboard routes
app.get('/dashboard', async (request, reply) => {
  reply.type('text/html');
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agentic Soup Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .header { background: #2d3748; color: white; padding: 1rem 2rem; }
        .container { padding: 2rem; max-width: 1400px; margin: 0 auto; }
        .responses-container { padding: 1rem; margin: 0 auto; width: 98%; max-width: none; }
        .grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }
        .jobs-grid { display: grid; gap: 1.5rem; grid-template-columns: 1fr; margin-top: 1.5rem; }
        .card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .chart-container { height: 300px; position: relative; }
        .metric { display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid #eee; }
        .metric:last-child { border-bottom: none; }
        .metric-value { font-weight: bold; color: #2d3748; }
        .agent-list { max-height: 300px; overflow-y: auto; }
        .agent-item { padding: 0.75rem; border: 1px solid #e2e8f0; margin-bottom: 0.5rem; border-radius: 4px; }
        .agent-status { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
        .agent-status.alive { background: #48bb78; }
        .agent-status.dead { background: #f56565; }
        .activity-log { max-height: 400px; overflow-y: auto; font-size: 0.875rem; }
        .activity-item { padding: 0.5rem; border-bottom: 1px solid #eee; }
        .timestamp { color: #718096; font-size: 0.75rem; }
        .jobs-list { max-height: 400px; overflow-y: auto; font-size: 0.875rem; }
        .job-item { padding: 0.75rem; border: 1px solid #e2e8f0; margin-bottom: 0.5rem; border-radius: 4px; }
        .job-status { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
        .job-status.pending { background: #fef5e7; color: #c53030; }
        .job-status.attempted { background: #ebf8ff; color: #3182ce; }
        .job-status.completed { background: #f0fff4; color: #38a169; }
        .quality-grade { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; margin-left: 0.5rem; }
        .quality-grade.excellent { background: #f0fff4; color: #38a169; } /* 90-100 */
        .quality-grade.good { background: #f7fafc; color: #4a5568; } /* 70-89 */
        .quality-grade.fair { background: #fef5e7; color: #d69e2e; } /* 50-69 */
        .quality-grade.poor { background: #fed7d7; color: #c53030; } /* <50 */
        .job-category { font-weight: bold; color: #2d3748; }
        .job-details { font-size: 0.8rem; color: #4a5568; margin-top: 0.25rem; }
        .job-description { 
            font-size: 0.875rem; 
            color: #2d3748; 
            margin-top: 0.5rem; 
            padding: 0.5rem;
            background: #f7fafc;
            border-radius: 4px;
            position: relative;
            cursor: help;
        }
        .job-description-truncated { 
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            max-width: 100%;
        }
        .job-description-tooltip {
            position: absolute;
            bottom: 100%;
            left: 0;
            right: 0;
            background: #2d3748;
            color: white;
            padding: 0.75rem;
            border-radius: 4px;
            font-size: 0.875rem;
            white-space: pre-wrap;
            word-wrap: break-word;
            z-index: 1000;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s, visibility 0.2s;
            max-height: 200px;
            overflow-y: auto;
        }
        .job-description:hover .job-description-tooltip {
            opacity: 1;
            visibility: visible;
        }
        .job-result {
            margin-top: 0.5rem;
            padding: 0.5rem;
            background: #f0f7ff;
            border-radius: 4px;
            border-left: 3px solid #4299e1;
        }
        .job-result-status {
            font-weight: bold;
            font-size: 0.8rem;
            color: #2d3748;
            margin-bottom: 0.25rem;
        }
        .job-result-content {
            position: relative;
            cursor: help;
        }
        .job-result-truncated {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.8rem;
            color: #4a5568;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .job-result-tooltip {
            position: absolute;
            bottom: 100%;
            left: 0;
            right: 0;
            background: #1a202c;
            color: white;
            padding: 0.75rem;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.8rem;
            white-space: pre-wrap;
            word-wrap: break-word;
            z-index: 1000;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.2s, visibility 0.2s;
            max-height: 200px;
            overflow-y: auto;
        }
        .job-result-content:hover .job-result-tooltip {
            opacity: 1;
            visibility: visible;
        }
        .job-agent {
            margin-top: 0.5rem;
            padding: 0.5rem;
            background: #f0f4f8;
            border-radius: 4px;
            border-left: 3px solid #805ad5;
        }
        .job-agent-header {
            font-weight: bold;
            font-size: 0.8rem;
            color: #553c9a;
            margin-bottom: 0.25rem;
        }
        .job-agent-details {
            font-size: 0.75rem;
            color: #4a5568;
            line-height: 1.4;
        }
        .refresh-btn { background: #4299e1; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
        .refresh-btn:hover { background: #3182ce; }

        .header-controls { display: flex; align-items: center; gap: 1rem; }
        .header-title { flex: 1; }
        .control-btn { border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-weight: bold; transition: all 0.2s; }
        .control-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-start { background: #48bb78; color: white; }
        .btn-start:hover:not(:disabled) { background: #38a169; }
        .btn-pause { background: #ed8936; color: white; }
        .btn-pause:hover:not(:disabled) { background: #dd6b20; }
        .btn-reset { background: #9f7aea; color: white; }
        .btn-reset:hover:not(:disabled) { background: #805ad5; }
        .system-status { display: inline-block; margin-left: 1rem; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.875rem; font-weight: bold; }
        .status-running { background: #c6f6d5; color: #22543d; }
        .status-paused { background: #fed7cc; color: #9c4221; }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-controls">
            <div class="header-title">
                <h1>🍲 Agentic Soup Dashboard</h1>
                <span id="system-status" class="system-status status-paused">Paused</span>
            </div>
            <div>
                <button id="btn-start" class="control-btn btn-start" onclick="controlSystem('start')">▶ Start</button>
                <button id="btn-pause" class="control-btn btn-pause" onclick="controlSystem('pause')" disabled>⏸ Pause</button>
                <button id="btn-reset" class="control-btn btn-reset" onclick="controlSystem('reset')">🔄 Reset</button>
                <button class="refresh-btn" onclick="refreshAll()">Refresh All</button>
                <a href="/responses" class="refresh-btn" style="text-decoration: none; display: inline-block; margin-left: 0.5rem;">📊 Job Responses</a>
            </div>
        </div>
    </div>
    
    <div class="container">
        <div class="grid">
            <div class="card">
                <h3>System Health</h3>
                <div id="system-health"></div>
            </div>
            
            <div class="card">
                <h3>Inequality Over Time (Gini Coefficient)</h3>
                <div class="chart-container">
                    <canvas id="inequality-chart"></canvas>
                </div>
            </div>
            
            <div class="card">
                <h3>Job Throughput</h3>
                <div class="chart-container">
                    <canvas id="throughput-chart"></canvas>
                </div>
            </div>
            
            <div class="card">
                <h3>Agent Network Centrality</h3>
                <div class="chart-container">
                    <canvas id="centrality-chart"></canvas>
                </div>
            </div>
            
            <div class="card">
                <h3 id="agents-title">Active Agents</h3>
                <div id="agents-list" class="agent-list"></div>
            </div>
            
            <div class="card">
                <h3>Recent Activity (Last 100)</h3>
                <div id="activity-log" class="activity-log"></div>
            </div>
            
        </div>
        
        <div class="jobs-grid">
            <div class="card">
                <h3>Recent Jobs (Last 50)</h3>
                <div id="jobs-list" class="jobs-list"></div>
            </div>
        </div>
    </div>

    <script>
        let charts = {};
        
        async function fetchData(endpoint, retries = 3, delay = 500) {
            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(endpoint);
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                    }
                    return await response.json();
                } catch (error) {
                    console.warn('Fetch attempt ' + (i + 1) + ' failed for ' + endpoint + ':', error.message);

                    // If this is the last retry, throw the error
                    if (i === retries - 1) {
                        throw error;
                    }

                    // Wait before retrying with exponential backoff
                    const waitTime = delay * Math.pow(2, i);
                    console.log('Retrying in ' + waitTime + 'ms...');
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }
        
        async function refreshSystemHealth() {
            const data = await fetchData('/api/system-health');
            const container = document.getElementById('system-health');
            container.innerHTML = Object.entries(data).map(([key, value]) => 
                '<div class="metric">' +
                    '<span>' + key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) + '</span>' +
                    '<span class="metric-value">' + (typeof value === 'number' ? value.toLocaleString() : value) + '</span>' +
                '</div>'
            ).join('');
        }
        
        async function refreshInequalityChart() {
            const data = await fetchData('/api/metrics/inequality');
            if (charts.inequality) charts.inequality.destroy();
            
            const ctx = document.getElementById('inequality-chart').getContext('2d');
            charts.inequality = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.map(d => new Date(d.timestamp).toLocaleTimeString()),
                    datasets: [{
                        label: 'Gini Coefficient',
                        data: data.map(d => d.gini),
                        borderColor: '#4299e1',
                        fill: false
                    }, {
                        label: 'Top 5 Share',
                        data: data.map(d => d.top5share),
                        borderColor: '#ed8936',
                        fill: false
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 1 } } }
            });
        }
        
        async function refreshThroughputChart() {
            const data = await fetchData('/api/metrics/throughput');
            if (charts.throughput) charts.throughput.destroy();
            
            const ctx = document.getElementById('throughput-chart').getContext('2d');
            charts.throughput = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.map(d => new Date(d.timestamp).toLocaleTimeString()),
                    datasets: [{
                        label: 'Jobs Completed/Hour',
                        data: data.map(d => d.completedJobs),
                        borderColor: '#48bb78',
                        fill: true,
                        backgroundColor: 'rgba(72, 187, 120, 0.1)'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
            });
        }
        
        async function refreshCentralityChart() {
            const data = await fetchData('/api/metrics/centrality');
            if (charts.centrality) charts.centrality.destroy();
            
            const ctx = document.getElementById('centrality-chart').getContext('2d');
            charts.centrality = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Agent Centrality',
                        data: data.map(d => ({ x: d.betweenness, y: d.closeness, r: Math.sqrt(d.degree) * 3 })),
                        backgroundColor: 'rgba(159, 122, 234, 0.6)'
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    scales: { 
                        x: { title: { display: true, text: 'Betweenness Centrality' } },
                        y: { title: { display: true, text: 'Closeness Centrality' } }
                    }
                }
            });
        }
        
        async function refreshAgentsList() {
            // Check if we're in swarm mode by checking the leaderboard
            const leaderboardData = await fetchData('/leaderboard');
            const isSwarmMode = leaderboardData.mode === 'swarms';

            // Update title based on mode
            const titleElement = document.getElementById('agents-title');
            titleElement.textContent = isSwarmMode ? 'Active Swarms' : 'Active Agents';

            const endpoint = isSwarmMode ? '/api/swarms' : '/api/agents';
            const data = await fetchData(endpoint);
            const container = document.getElementById('agents-list');

            if (isSwarmMode) {
                container.innerHTML = data.map(swarm =>
                    '<div class="agent-item">' +
                        '<span class="agent-status ' + (swarm.alive ? 'alive' : 'dead') + '"></span>' +
                        '<strong>' + (swarm.name || swarm.id.substring(0, 8) + '...') + '</strong><br>' +
                        'Balance: ' + swarm.balance + ' | Wins: ' + swarm.wins + '/' + swarm.attempts + ' | Rep: ' + swarm.reputation.toFixed(2) + '<br>' +
                        'Agents: ' + swarm.agentCount + ' | Types: ' + swarm.archetypes +
                    '</div>'
                ).join('');
            } else {
                container.innerHTML = data.map(agent =>
                    '<div class="agent-item">' +
                        '<span class="agent-status ' + (agent.alive ? 'alive' : 'dead') + '"></span>' +
                        '<strong>' + (agent.name || agent.id.substring(0, 8) + '...') + '</strong><br>' +
                        'Balance: ' + agent.balance + ' | Wins: ' + agent.wins + '/' + agent.attempts + ' | Temp: ' + agent.temperature + '<br>' +
                        'Tools: ' + agent.tools + ' | Model: ' + agent.llmModel +
                    '</div>'
                ).join('');
            }
        }
        
        async function refreshActivityLog() {
            const data = await fetchData('/api/activity');
            const container = document.getElementById('activity-log');
            container.innerHTML = data.map(item => 
                '<div class="activity-item">' +
                    '<div class="timestamp">' + new Date(item.timestamp).toLocaleString() + '</div>' +
                    '<div>' + item.action + '</div>' +
                '</div>'
            ).join('');
        }
        
        async function refreshJobsList() {
            const data = await fetchData('/api/jobs');
            const container = document.getElementById('jobs-list');
            container.innerHTML = data.map(job => {
                // Extract description from job payload
                let description = 'No description available';
                try {
                    if (job.payload && typeof job.payload === 'object') {
                        description = job.payload.description || job.payload.prompt || job.payload.question || JSON.stringify(job.payload);
                    } else if (typeof job.payload === 'string') {
                        const parsed = JSON.parse(job.payload);
                        description = parsed.description || parsed.prompt || parsed.question || job.payload;
                    }
                } catch (e) {
                    description = job.payload || 'No description available';
                }
                
                // Truncate description for display
                const truncatedDescription = description.length > 120 ? description.substring(0, 120) + '...' : description;
                
                // Format job result/output
                let resultHtml = '';
                if (job.result) {
                    const success = job.result.ok ? '✅' : '❌';
                    const rawArtifact = job.result.artifact || 'No output';
                    // Handle case where artifact might be an object
                    const artifact = typeof rawArtifact === 'string' ? rawArtifact :
                                   (typeof rawArtifact === 'object' ? JSON.stringify(rawArtifact, null, 2) : String(rawArtifact));
                    const truncatedArtifact = artifact.length > 100 ? artifact.substring(0, 100) + '...' : artifact;
                    
                    resultHtml = '<div class="job-result">' +
                        '<div class="job-result-status">' + success + ' Result:</div>' +
                        '<div class="job-result-content">' +
                            '<div class="job-result-truncated">' + truncatedArtifact + '</div>' +
                            '<div class="job-result-tooltip">' + artifact + '</div>' +
                        '</div>' +
                    '</div>';
                }
                
                // Format agent information
                let agentHtml = '';
                if (job.agent) {
                    agentHtml = '<div class="job-agent">' +
                        '<div class="job-agent-header">🤖 Agent: ' + job.agent.id + '</div>' +
                        '<div class="job-agent-details">' +
                            'Model: ' + job.agent.llmModel + ' | ' +
                            'Temp: ' + job.agent.temperature + ' | ' +
                            'Success: ' + job.agent.successRate + '%<br>' +
                            'Tools: ' + job.agent.tools.join(', ') + ' | ' +
                            'Balance: ' + job.agent.balance +
                        '</div>' +
                    '</div>';
                }
                
                // Format quality grade (only for successful jobs)
                let qualityGradeHtml = '';
                if (job.qualityGrade !== null && job.qualityGrade !== undefined && job.status === 'completed') {
                    const grade = job.qualityGrade;
                    let gradeClass = 'poor';
                    if (grade >= 80) gradeClass = 'excellent';
                    else if (grade >= 60) gradeClass = 'good';
                    else if (grade >= 40) gradeClass = 'fair';
                    // 1-39 stays as 'poor' - very low quality but still passing
                    
                    qualityGradeHtml = '<span class="quality-grade ' + gradeClass + '">Quality: ' + grade + '/100</span>';
                }

                return '<div class="job-item">' +
                    '<div class="job-category">' + job.category + '</div>' +
                    '<span class="job-status ' + job.status + '">' + job.status.toUpperCase() + '</span>' +
                    qualityGradeHtml +
                    '<div class="job-details">' +
                        'ID: ' + job.id + ' | Payout: ' + job.payout + ' | Age: ' + job.ageMinutes + 'min<br>' +
                        'Deadline: ' + job.deadlineS + 's | Created: ' + new Date(job.createdAt).toLocaleTimeString() +
                    '</div>' +
                    '<div class="job-description">' +
                        '<div class="job-description-truncated">' + truncatedDescription + '</div>' +
                        '<div class="job-description-tooltip">' + description + '</div>' +
                    '</div>' +
                    agentHtml +
                    resultHtml +
                '</div>';
            }).join('');
        }
        
        async function refreshAll() {
            const refreshFunctions = [
                { name: 'System Health', fn: refreshSystemHealth },
                { name: 'Inequality Chart', fn: refreshInequalityChart },
                { name: 'Throughput Chart', fn: refreshThroughputChart },
                { name: 'Centrality Chart', fn: refreshCentralityChart },
                { name: 'Agents List', fn: refreshAgentsList },
                { name: 'Activity Log', fn: refreshActivityLog },
                { name: 'Jobs List', fn: refreshJobsList }
            ];

            const results = await Promise.allSettled(
                refreshFunctions.map(({ name, fn }) =>
                    fn().catch(error => {
                        console.warn('Failed to refresh ' + name + ':', error.message);
                        throw error;
                    })
                )
            );

            const failures = results.filter(result => result.status === 'rejected');
            if (failures.length > 0) {
                console.warn(failures.length + ' dashboard sections failed to refresh');
            }
        }

        // System control functions
        async function controlSystem(action) {
            const btn = event.target;
            const originalText = btn.textContent;

            try {
                btn.disabled = true;
                btn.textContent = '⏳ ' + originalText.substring(2);

                const response = await fetch('/api/system/' + action, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });

                const result = await response.json();

                if (result.success) {
                    updateSystemStatus();
                    await refreshAll();
                    alert(result.message);
                } else {
                    alert('Error: ' + result.message);
                }
            } catch (error) {
                alert('Error: ' + error.message);
            } finally {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }

        async function updateSystemStatus() {
            try {
                const response = await fetch('/api/system/status');
                const data = await response.json();

                if (data.success) {
                    const status = data.status.status;
                    const statusElement = document.getElementById('system-status');
                    const btnStart = document.getElementById('btn-start');
                    const btnPause = document.getElementById('btn-pause');

                    // Update status display
                    statusElement.className = 'system-status status-' + status;
                    statusElement.textContent = status.charAt(0).toUpperCase() + status.slice(1);

                    // Update button states
                    switch (status) {
                        case 'running':
                            btnStart.disabled = true;
                            btnPause.disabled = false;
                            break;
                        case 'paused':
                            btnStart.disabled = false;
                            btnPause.disabled = true;
                            break;
                    }
                }
            } catch (error) {
                console.error('Failed to update system status:', error);
            }
        }

        // Initial load
        refreshAll();
        updateSystemStatus();

        // Auto-refresh every 30 seconds
        setInterval(() => {
            refreshAll();
            updateSystemStatus();
        }, 30000);
    </script>
</body>
</html>
`;
});

// Responses table page
app.get('/responses', async (request, reply) => {
  reply.type('text/html');
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Job Responses - Agentic Soup</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            text-align: center;
        }

        .nav-links {
            background: #fff;
            padding: 1rem;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .nav-links a {
            color: #4299e1;
            text-decoration: none;
            margin: 0 1rem;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            transition: background-color 0.2s;
        }

        .nav-links a:hover {
            background-color: #e6f3ff;
        }

        .container {
            max-width: 95%;
            margin: 2rem auto;
            padding: 0 1rem;
        }

        .controls {
            background: white;
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }

        .refresh-btn {
            background: #4299e1;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9rem;
        }

        .refresh-btn:hover {
            background: #3182ce;
        }

        .table-container {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .table-wrapper {
            overflow-x: auto;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
        }

        th {
            background: #667eea;
            color: white;
            padding: 0.75rem 0.5rem;
            text-align: left;
            font-weight: 600;
            white-space: nowrap;
        }

        td {
            padding: 0.75rem 0.5rem;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
        }

        tr:hover {
            background-color: #f7fafc;
        }

        .status-success {
            color: #22543d;
            font-weight: bold;
        }

        .status-failed {
            color: #742a2a;
            font-weight: bold;
        }

        .status-pending {
            color: #744210;
            font-weight: bold;
        }

        .error-yes {
            color: #742a2a;
            font-weight: bold;
        }

        .cell-prompt, .cell-answer {
            word-wrap: break-word;
            font-size: 0.85rem;
            line-height: 1.4;
            width: auto;
        }

        .cell-error-desc {
            word-wrap: break-word;
            font-size: 0.8rem;
            color: #742a2a;
            width: auto;
        }

        .loading {
            text-align: center;
            padding: 2rem;
            color: #666;
        }

        .error-message {
            background: #fed7d7;
            color: #742a2a;
            padding: 1rem;
            border-radius: 4px;
            margin: 1rem 0;
        }

        .info-text {
            color: #666;
            font-size: 0.9rem;
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Job Responses Table</h1>
        <p>Last 50 Job Executions (matching run-swarms-10m.sh format)</p>
    </div>

    <div class="nav-links">
        <a href="/dashboard">← Back to Dashboard</a>
        <a href="/leaderboard">View Leaderboard</a>
    </div>

    <div class="responses-container">
        <div class="controls">
            <button class="refresh-btn" onclick="loadResponsesData()">🔄 Refresh Data</button>
            <div class="info-text">
                Showing the most recent job executions with their responses, matching the format from run-swarms-10m.sh
            </div>
        </div>

        <div class="table-container">
            <div id="loading" class="loading">Loading job responses...</div>
            <div id="error-message" class="error-message" style="display: none;"></div>

            <div class="table-wrapper">
                <table id="responses-table" style="display: none;">
                    <thead>
                        <tr>
                            <th>Job ID</th>
                            <th>Status</th>
                            <th>Prompt</th>
                            <th>Answer</th>
                            <th>Tools Used</th>
                            <th>Swarm Name</th>
                            <th>Swarm Composition</th>
                            <th>Agent Count</th>
                            <th>Error</th>
                            <th>Error Description</th>
                        </tr>
                    </thead>
                    <tbody id="responses-tbody">
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        let responsesData = [];

        async function loadResponsesData() {
            document.getElementById('loading').style.display = 'block';
            document.getElementById('responses-table').style.display = 'none';
            document.getElementById('error-message').style.display = 'none';

            try {
                const response = await fetch('/api/responses-table');
                const data = await response.json();

                if (data.error) {
                    throw new Error(data.error);
                }

                responsesData = data.rows || [];
                renderResponsesTable();

                document.getElementById('loading').style.display = 'none';
                document.getElementById('responses-table').style.display = 'block';
            } catch (error) {
                console.error('Failed to load responses data:', error);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('error-message').textContent = 'Failed to load data: ' + error.message;
                document.getElementById('error-message').style.display = 'block';
            }
        }

        function renderResponsesTable() {
            const tbody = document.getElementById('responses-tbody');
            tbody.innerHTML = '';

            if (responsesData.length === 0) {
                const row = tbody.insertRow();
                const cell = row.insertCell(0);
                cell.colSpan = 10;
                cell.textContent = 'No job responses found';
                cell.style.textAlign = 'center';
                cell.style.padding = '2rem';
                cell.style.color = '#666';
                return;
            }

            responsesData.forEach(job => {
                const row = tbody.insertRow();

                // Job ID
                const jobIdCell = row.insertCell();
                jobIdCell.textContent = job.jobId;

                // Status
                const statusCell = row.insertCell();
                statusCell.textContent = job.status;
                statusCell.className = \`status-\${job.status.toLowerCase()}\`;

                // Prompt
                const promptCell = row.insertCell();
                promptCell.textContent = job.prompt;
                promptCell.className = 'cell-prompt';

                // Answer
                const answerCell = row.insertCell();
                answerCell.textContent = job.answer;
                answerCell.className = 'cell-answer';

                // Tools Used
                const toolsCell = row.insertCell();
                toolsCell.textContent = job.toolsUsed || '-';

                // Swarm Name
                const swarmNameCell = row.insertCell();
                swarmNameCell.textContent = job.swarmName || 'Unknown Swarm';
                // Swarm Composition
                const swarmCompositionCell = row.insertCell();
                swarmCompositionCell.textContent = job.swarmComposition || 'Unknown';
                // Agent Count
                const agentCountCell = row.insertCell();
                agentCountCell.textContent = job.agentCount || '0';

                // Error
                const errorCell = row.insertCell();
                errorCell.textContent = job.error || '-';
                if (job.error === 'Yes') {
                    errorCell.className = 'error-yes';
                }

                // Error Description
                const errorDescCell = row.insertCell();
                errorDescCell.textContent = job.errorDescription || '-';
                errorDescCell.className = 'cell-error-desc';
            });
        }

        // Load data on page load
        loadResponsesData();

        // Auto-refresh every 60 seconds
        setInterval(loadResponsesData, 60000);
    </script>
</body>
</html>
`;
});

// API endpoints for dashboard data
app.get('/api/system-health', async () => {
  if (BOOTSTRAP) return { mode: 'bootstrap' };

  const agents = await prisma.agentState.findMany();
  const activeAgents = agents.filter((a: any) => a.alive);
  const jobs = await prisma.job.count();
  const totalTransactions = await prisma.ledger.count();
  const recentTransactions = await prisma.ledger.count({
    where: { ts: { gte: new Date(Date.now() - 3600000) } }, // last hour
  });

  return {
    totalAgents: agents.length,
    activeAgents: activeAgents.length,
    totalJobs: jobs,
    totalTransactions,
    recentTransactions,
    avgBalance: Math.round(
      activeAgents.reduce((sum: number, a: any) => sum + a.balance, 0) / activeAgents.length || 0
    ),
    successRate:
      activeAgents.length > 0
        ? Math.round(
            (activeAgents.reduce((sum: number, a: any) => sum + a.wins, 0) /
              activeAgents.reduce((sum: number, a: any) => sum + a.attempts, 0) || 0) * 100
          ) + '%'
        : '0%',
  };
});

app.get('/api/metrics/inequality', async () => {
  if (BOOTSTRAP) return [];

  try {
    const filePath = path.join(METRICS_DIR, 'inequality.csv');
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').slice(1); // Skip header

    return lines.slice(-50).map((line) => {
      // Last 50 data points
      const [timestamp, gini, top5share] = line.split(',');
      return {
        timestamp,
        gini: parseFloat(gini),
        top5share: parseFloat(top5share),
      };
    });
  } catch (error) {
    return [];
  }
});

app.get('/api/metrics/throughput', async () => {
  if (BOOTSTRAP) return [];

  const hourlyStats = await prisma.$queryRaw`
    SELECT 
      datetime(ts, 'start of hour') as hour,
      COUNT(*) as count
    FROM Ledger 
    WHERE reason = 'payout' 
      AND ts >= datetime('now', '-24 hours')
    GROUP BY hour
    ORDER BY hour
  `;

  return (hourlyStats as any[]).map((stat) => ({
    timestamp: stat.hour,
    completedJobs: stat.count,
  }));
});

app.get('/api/metrics/centrality', async () => {
  if (BOOTSTRAP) return [];

  // Simple centrality calculation based on interactions
  const edges = await prisma.edge.findMany({
    where: { ts: { gte: new Date(Date.now() - 86400000) } }, // last 24 hours
  });

  const nodeDegrees: Record<string, number> = {};
  const nodeConnections: Record<string, Set<string>> = {};

  edges.forEach((edge: any) => {
    nodeDegrees[edge.fromId] = (nodeDegrees[edge.fromId] || 0) + 1;
    nodeDegrees[edge.toId] = (nodeDegrees[edge.toId] || 0) + 1;

    if (!nodeConnections[edge.fromId]) nodeConnections[edge.fromId] = new Set();
    if (!nodeConnections[edge.toId]) nodeConnections[edge.toId] = new Set();

    nodeConnections[edge.fromId].add(edge.toId);
    nodeConnections[edge.toId].add(edge.fromId);
  });

  return Object.entries(nodeDegrees)
    .slice(0, 20)
    .map(([nodeId, degree]) => ({
      nodeId,
      degree,
      betweenness: degree / Object.keys(nodeDegrees).length, // Simplified
      closeness: nodeConnections[nodeId]?.size || 0 / Object.keys(nodeDegrees).length,
    }));
});

app.get('/api/agents', async () => {
  if (BOOTSTRAP) return [];

  const agents = await prisma.agentState.findMany({
    orderBy: { balance: 'desc' },
  });

  const blueprints = await prisma.blueprint.findMany();
  const blueprintMap = new Map(blueprints.map((bp: any) => [bp.id, bp]));

  return agents.map((agent: any) => {
    const blueprint: any = blueprintMap.get(agent.blueprintId);

    // Validate archetype or default to llm-only
    const getToolsForArchetype = (archetype: string): string => {
      const validTools = ['wikipedia', 'llm-only', 'web-browser', 'google-trends', 'tool-builder'];
      return validTools.includes(archetype) ? archetype : 'llm-only';
    };

    return {
      id: agent.id,
      name: agent.name,
      alive: agent.alive,
      balance: agent.balance,
      wins: agent.wins,
      attempts: agent.attempts,
      reputation: agent.reputation,
      meanTtcSec: agent.meanTtcSec,
      temperature: blueprint?.temperature || 0,
      tools: getToolsForArchetype(blueprint?.archetype || 'llm-only'),
      llmModel: blueprint?.llmModel || 'unknown',
    };
  });
});

app.get('/api/swarms', async () => {
  if (BOOTSTRAP) return [];
  const swarms = await prisma.swarm.findMany({
    orderBy: { balance: 'desc' },
    include: {
      agents: true,
    },
  });

  return swarms.map((swarm: any) => {
    const agentArchetypes = swarm.agents.map((agent: any) => agent.archetype).filter(Boolean);
    return {
      id: swarm.id,
      name: swarm.name,
      alive: swarm.alive,
      balance: swarm.balance,
      wins: swarm.wins,
      attempts: swarm.attempts,
      reputation: swarm.reputation,
      meanTtcSec: swarm.meanTtcSec,
      agentCount: swarm.agents.length,
      archetypes: agentArchetypes.join(', '),
      description: swarm.description,
    };
  });
});

app.get('/api/jobs', async () => {
  if (BOOTSTRAP) return [];

  const jobs = await prisma.job.findMany({
    take: 50,
    orderBy: { createdAt: 'desc' },
  });

  // Get job completion status by checking if there are payout transactions for each job
  const jobsWithStatus = await Promise.all(
    jobs.map(async (job: any) => {
      // The current logic is flawed - it counts ALL payouts/fails after job creation time
      // instead of payouts/fails FOR this specific job. Since we don't store job IDs
      // in the ledger, we need to rely on Redis job matching for accurate status.
      // For now, we'll set status based on whether we can find results in Redis.

      let status = 'pending';
      let foundInRedis = false;

      // Calculate age
      const ageMs = Date.now() - new Date(job.createdAt).getTime();
      const ageMinutes = Math.floor(ageMs / 60000);

      // Try to get job result from Redis and determine correct status
      let result = null;
      let agentInfo = null;
      try {
        // Get completed jobs from Redis to find the Bull job ID
        const completedJobs = await redis.zrange('bull:jobs:completed', 0, -1);
        const failedJobs = await redis.zrange('bull:jobs:failed', 0, -1);
        const allProcessedJobs = [...completedJobs, ...failedJobs];

        // Find the job with matching data
        for (const bullJobId of allProcessedJobs) {
          try {
            const jobData = await redis.hget(`bull:jobs:${bullJobId}`, 'data');
            if (jobData) {
              const parsedData = JSON.parse(jobData);
              // Match by payload content since we don't store the DB job ID in Bull
              if (JSON.stringify(parsedData.payload) === job.payload) {
                const returnValue = await redis.hget(`bull:jobs:${bullJobId}`, 'returnvalue');
                if (returnValue) {
                  result = JSON.parse(returnValue);
                  foundInRedis = true;
                  // Determine status based on which queue it was found in
                  if (completedJobs.includes(bullJobId)) {
                    status = result.ok ? 'completed' : 'attempted';
                  } else if (failedJobs.includes(bullJobId)) {
                    status = 'attempted';
                  }

                  // Find which agent worked on this job using proper job ID tracking
                  const ledgerEntry = await prisma.ledger.findFirst({
                    where: {
                      jobId: job.id,
                      reason: { in: ['payout', 'fail'] },
                    },
                    orderBy: { ts: 'asc' }, // Get the first completion entry
                  });

                  if (ledgerEntry) {
                    const agent = await prisma.agentState.findUnique({
                      where: { id: ledgerEntry.agentId },
                    });
                    if (agent) {
                      const blueprint = await prisma.blueprint.findUnique({
                        where: { id: agent.blueprintId },
                      });
                      if (blueprint) {
                        // Validate archetype or default to llm-only
                        const getToolsForArchetype = (archetype: string): string[] => {
                          const validTools = [
                            'wikipedia',
                            'llm-only',
                            'web-browser',
                            'google-trends',
                            'tool-builder',
                          ];
                          return validTools.includes(archetype) ? [archetype] : ['llm-only'];
                        };

                        agentInfo = {
                          id: agent.name || agent.id.substring(0, 8) + '...',
                          temperature: blueprint.temperature,
                          tools: getToolsForArchetype(blueprint.archetype || 'llm-only'),
                          llmModel: blueprint.llmModel,
                          balance: agent.balance,
                          successRate:
                            agent.attempts > 0
                              ? Math.round((agent.wins / agent.attempts) * 100)
                              : 0,
                        };
                      }
                    }
                  }
                  break;
                }
              }
            }
          } catch (e) {
            // Skip this job if parsing fails
            continue;
          }
        }
      } catch (error) {
        // If Redis lookup fails, just continue without result
        console.warn('Failed to fetch job result from Redis:', error);
      }

      // If not found in Redis, check if it's old enough to be considered stale
      if (!foundInRedis && ageMinutes > 5) {
        // Job is older than 5 minutes and not in Redis - likely completed and cleaned up
        // or never processed. We'll leave it as pending for now.
      }

      // Get quality grade from ledger entry (only for successful jobs)
      let qualityGrade = null;
      if (status === 'completed') {
        const ledgerEntry = await prisma.ledger.findFirst({
          where: {
            jobId: job.id,
            reason: 'payout',
          },
          orderBy: { ts: 'asc' },
        });
        qualityGrade = ledgerEntry?.qualityGrade || null;
      }

      return {
        id: job.id, // Show full ID for debugging
        category: job.category,
        payout: job.payout,
        deadlineS: job.deadlineS,
        createdAt: job.createdAt,
        status,
        ageMinutes,
        payload: JSON.parse(job.payload),
        result: result,
        agent: agentInfo,
        qualityGrade: qualityGrade,
      };
    })
  );

  return jobsWithStatus;
});

// Debug endpoint for agent lookup
app.get('/api/debug-agent/:jobId', async (req: any, _reply: any) => {
  const jobId = req.params.jobId;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return { error: 'Job not found' };

  const ledgerEntries = await prisma.ledger.findMany({
    where: { jobId: jobId },
    orderBy: { ts: 'asc' },
  });

  const completionEntry = await prisma.ledger.findFirst({
    where: {
      jobId: jobId,
      reason: { in: ['payout', 'fail'] },
    },
  });

  return {
    jobId,
    jobCreatedAt: job.createdAt,
    allLedgerEntries: ledgerEntries,
    completionEntry,
    hasProperTracking: !!completionEntry,
  };
});

app.get('/api/activity', async () => {
  if (BOOTSTRAP) return [];

  // Get recent activities from multiple sources
  const recentLedger = await prisma.ledger.findMany({
    take: 50,
    orderBy: { ts: 'desc' },
  });

  const recentJobs = await prisma.job.findMany({
    take: 25,
    orderBy: { createdAt: 'desc' },
  });

  const recentEdges = await prisma.edge.findMany({
    take: 25,
    orderBy: { ts: 'desc' },
  });

  // Get agent names for the activity log
  const agentIds = [...new Set(recentLedger.map((l: any) => l.agentId).filter(Boolean))];
  const agents =
    agentIds.length > 0
      ? await prisma.agentState.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true },
        })
      : [];
  const agentNameMap = new Map(agents.map((a: any) => [a.id, a.name]));

  const activities = [
    ...recentLedger.map((l: any) => ({
      timestamp: l.ts,
      action:
        (agentNameMap.get(l.agentId) ||
          (l.agentId
            ? `Agent ${l.agentId.substring(0, 8)}...`
            : l.swarmId
              ? `Swarm ${l.swarmId.substring(0, 8)}...`
              : 'System')) +
        ' ' +
        (l.delta > 0 ? 'earned' : 'spent') +
        ' ' +
        Math.abs(l.delta) +
        ' (' +
        l.reason +
        ')',
    })),
    ...recentJobs.map((j: any) => ({
      timestamp: j.createdAt,
      action: 'New ' + j.category + ' job created (payout: ' + j.payout + ')',
    })),
    ...recentEdges.map((e: any) => ({
      timestamp: e.ts,
      action:
        'Interaction: ' +
        e.fromId.substring(0, 8) +
        '... → ' +
        e.toId.substring(0, 8) +
        '... (' +
        e.topic +
        ')',
    })),
  ];

  return activities
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 100);
});

// API endpoint for responses table (matching run-swarms-10m.sh format)
app.get('/api/responses-table', async () => {
  // Skip BOOTSTRAP check to show real data even in bootstrap mode

  try {
    // Fetch completed jobs directly from ledger (since Job records are deleted after completion)
    // Include swarm information to get agent details
    const completedJobEntries = await prisma.ledger.findMany({
      where: {
        reason: { in: ['payout', 'fail'] },
      },
      take: 50,
      orderBy: { ts: 'desc' },
      include: {
        swarm: {
          select: {
            name: true,
            agents: {
              select: {
                name: true,
                archetype: true, // For swarm agents, archetype is stored directly
                blueprintId: true,
              },
            },
          },
        },
      },
    });

    // Get job IDs for Redis lookup
    const jobIds = completedJobEntries.map((entry: any) => entry.jobId);
    const jobDataMap = new Map();

    // Fetch job data from Redis (similar to summarize-run.js logic)
    if (redis && jobIds.length > 0) {
      try {
        const jobIdSet = new Set(jobIds);
        const completed = await redis.zrange('bull:jobs:completed', 0, -1);
        const failed = await redis.zrange('bull:jobs:failed', 0, -1);
        const allProcessed = [...completed, ...failed];

        // Batch fetch job data
        const batchSize = 100;
        for (let i = 0; i < allProcessed.length; i += batchSize) {
          const batch = allProcessed.slice(i, i + batchSize);
          const batchPromises = batch.map(async (bullJobId) => {
            try {
              const [dataRaw, returnRaw] = await redis.hmget(
                `bull:jobs:${bullJobId}`,
                'data',
                'returnvalue'
              );
              if (!dataRaw) return null;

              const parsedData = JSON.parse(dataRaw);
              const dbJobId = parsedData?.dbJobId;
              if (!dbJobId || !jobIdSet.has(dbJobId)) return null;

              const parsedReturn = returnRaw ? JSON.parse(returnRaw) : null;

              // Extract the actual answer content from the return value
              let extractedAnswer = 'No response data';
              let toolsUsedDetails = 'N/A';
              let agentType = 'Unknown';
              let selectedTool = null;

              if (parsedReturn) {
                // Extract the artifact (main response content)
                if (parsedReturn.artifact) {
                  extractedAnswer = parsedReturn.artifact;
                } else if (typeof parsedReturn === 'string') {
                  extractedAnswer = parsedReturn;
                } else if (parsedReturn.result) {
                  extractedAnswer = parsedReturn.result;
                } else if (parsedReturn.response) {
                  extractedAnswer = parsedReturn.response;
                } else if (parsedReturn.answer) {
                  extractedAnswer = parsedReturn.answer;
                } else {
                  // Try to get a meaningful string representation
                  extractedAnswer = JSON.stringify(parsedReturn);
                }

                // Extract tools information - show specific tool names
                if (parsedReturn.selectedTool) {
                  toolsUsedDetails = parsedReturn.selectedTool;
                } else if (parsedReturn.toolsUsed === true || parsedReturn.toolsUsed === 'true') {
                  toolsUsedDetails = 'Tools used (name unknown)';
                } else if (
                  parsedReturn.toolsUsed === false ||
                  parsedReturn.toolsUsed === 'false' ||
                  !parsedReturn.toolsUsed
                ) {
                  toolsUsedDetails = 'No tools used';
                } else if (typeof parsedReturn.toolsUsed === 'string') {
                  toolsUsedDetails = parsedReturn.toolsUsed;
                } else {
                  toolsUsedDetails = 'Unknown';
                }

                // Agent type will be determined from database archetype (see below)

                selectedTool = parsedReturn.selectedTool;
              }

              return {
                dbJobId,
                prompt:
                  typeof parsedData?.payload === 'string'
                    ? parsedData.payload
                    : parsedData?.payload?.prompt || JSON.stringify(parsedData?.payload || {}),
                answer: extractedAnswer,
                toolsUsed: toolsUsedDetails,
                agentType: agentType,
                selectedTool: selectedTool,
                newToolsCreated: parsedReturn?.newToolsCreated || false,
                category: parsedData?.category || 'general',
              };
            } catch (err) {
              return null;
            }
          });

          const batchResults = await Promise.all(batchPromises);
          for (const result of batchResults) {
            if (result) {
              jobDataMap.set(result.dbJobId, result);
            }
          }

          // Early exit if we found all jobs we need
          if (jobDataMap.size === jobIdSet.size) {
            break;
          }
        }
      } catch (redisError) {
        console.error('[API] Redis lookup failed:', redisError);
      }
    }

    // Process each ledger entry into table format
    const rows = completedJobEntries.map((entry: any) => {
      const status = entry.reason === 'payout' ? 'Success' : 'Failed';
      const jobIdTruncated = entry.jobId.substring(0, 8) + '...';

      // Get job data from Redis
      const jobData = jobDataMap.get(entry.jobId);

      let answerTruncated = '';
      let error = '-';
      let errorDescription = '';
      let prompt = 'Job prompt not available';
      let toolsUsed = 'N/A';

      if (jobData) {
        prompt = jobData.prompt;
        toolsUsed = jobData.toolsUsed;

        if (entry.reason === 'payout') {
          // Extract the artifact field when the answer is a JSON object, otherwise show the full answer
          if (typeof jobData.answer === 'string') {
            answerTruncated = jobData.answer;
          } else if (typeof jobData.answer === 'object' && jobData.answer !== null) {
            // If it's an object, try to extract the artifact field first
            if (jobData.answer.artifact) {
              answerTruncated = jobData.answer.artifact;
            } else {
              // Fallback to JSON string if no artifact field
              answerTruncated = JSON.stringify(jobData.answer);
            }
          } else {
            answerTruncated = String(jobData.answer || '');
          }
          error = '-';
        } else if (entry.reason === 'fail') {
          answerTruncated = 'Job failed to complete';
          error = 'Yes';
          errorDescription = 'Job execution failed';
        }
      } else {
        // Fallback when Redis data not available
        if (entry.reason === 'payout') {
          answerTruncated = `Job completed successfully (Quality: ${entry.qualityGrade || 'N/A'})`;
          error = '-';
        } else if (entry.reason === 'fail') {
          answerTruncated = 'Job failed to complete';
          error = 'Yes';
          errorDescription = 'Job execution failed';
        }
      }

      // Extract swarm information for display (like Active Swarms section)
      let swarmName = 'Unknown Swarm';
      let swarmComposition = 'Unknown';
      let agentCount = 0;

      // For swarm-based jobs, show swarm details like in Active Swarms
      if (entry.swarm?.agents && entry.swarm.agents.length > 0) {
        swarmName = entry.swarm.name || entry.swarm.id.substring(0, 8) + '...';
        agentCount = entry.swarm.agents.length;

        // Get all agent archetypes like in Active Swarms display
        const agentArchetypes = entry.swarm.agents
          .map((agent: any) => agent.archetype)
          .filter(Boolean);

        // Remove duplicates and format like "tool-builder, research-specialist"
        const uniqueArchetypes = [...new Set(agentArchetypes)];
        swarmComposition =
          uniqueArchetypes.length > 0 ? uniqueArchetypes.join(', ') : 'mixed agents';
      } else if (entry.swarm) {
        swarmName = entry.swarm.name || 'Unnamed Swarm';
        swarmComposition = 'Swarm details unavailable';
      }

      return {
        jobId: jobIdTruncated,
        status: status,
        prompt: prompt,
        answer: answerTruncated,
        toolsUsed: toolsUsed,
        swarmName: swarmName,
        swarmComposition: swarmComposition,
        agentCount: agentCount,
        selectedTool: jobData?.selectedTool || null,
        newToolsCreated: jobData?.newToolsCreated || false,
        error: error,
        errorDescription: errorDescription,
        timestamp: entry.ts,
        qualityGrade: entry.qualityGrade,
      };
    });

    return {
      rows,
      totalRows: rows.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[API] Failed to fetch responses table data:', error);
    return {
      rows: [],
      totalRows: 0,
      error: 'Failed to fetch data: ' + (error as Error).message,
    };
  }
});

let jobQueue: any;

async function seedIfEmpty() {
  log('[seed] Checking if database needs seeding...');
  try {
    const agents = await prisma.agentState.findMany();
    log(`[seed] Found ${agents.length} existing agents`);
    if (agents.length > 0) return;
  } catch (error) {
    console.error('[seed] Database query failed:', error);
    return;
  }

  // Use swarms only (removed individual agent mode)
  await seedSwarms();
}

async function seedSwarms() {
  log('[seedSwarms] Creating swarms...');

  const SWARM_COUNT = cfg.SWARM_COUNT;
  const AGENTS_PER_SWARM = cfg.AGENTS_PER_SWARM;

  // Fixed swarm composition: 2 tool-builder agents + 1 of each other archetype
  const fixedSwarmArchetypes = [
    'tool-builder',
    'tool-builder',
    'llm-only',
    'web-browser',
    'wikipedia',
    'google-trends',
  ];

  // Pre-generate all swarm configurations
  const swarmConfigs = [];

  for (let i = 0; i < SWARM_COUNT; i++) {
    const swarmId = `swarm_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;

    swarmConfigs.push({
      swarmId,
      archetypes: fixedSwarmArchetypes,
    });
  }

  // Generate swarm names in 1 batch call instead of 20 individual calls
  log(`[seedSwarms] Generating ${SWARM_COUNT} swarm names in batch...`);
  const swarmNameConfigs = Array(SWARM_COUNT).fill({
    archetype: 'swarm',
    temperature: 0.7,
    tools: [],
  });
  const swarmNames = await nameGenerator.generateNames(swarmNameConfigs);

  // Now create swarms and agents with pre-generated names
  for (let i = 0; i < SWARM_COUNT; i++) {
    const swarmConfig = swarmConfigs[i];
    const swarmName = swarmNames[i];

    log(
      `[seedSwarms] Creating swarm "${swarmName.fullName}" with archetypes: ${swarmConfig.archetypes.join(', ')}`
    );

    // Create swarm in database
    await prisma.swarm.create({
      data: {
        id: swarmConfig.swarmId,
        name: swarmName.fullName,
        description: `A collaborative swarm with 2 tool-builders and 1 of each archetype (llm-only, web-browser, wikipedia, google-trends)`,
        balance: 1000, // Starting balance
        reputation: 0.5, // Starting reputation
      },
    });

    // Create individual agent records in database for tracking
    const toolBuilderCount = { count: 0 };
    for (let j = 0; j < AGENTS_PER_SWARM; j++) {
      const agentId = `${swarmConfig.swarmId}_agent_${j}`;
      const agentArchetype = swarmConfig.archetypes[j];

      let agentName = `${swarmName.fullName} - ${agentArchetype}`;
      if (agentArchetype === 'tool-builder') {
        toolBuilderCount.count++;
        agentName = `${swarmName.fullName} - tool-builder-${toolBuilderCount.count}`;
      }

      await prisma.agentState.create({
        data: {
          id: agentId,
          name: agentName,
          archetype: agentArchetype,
          balance: 0, // Swarm manages balance
          reputation: 0.5,
          attempts: 0,
          wins: 0,
          meanTtcSec: 0,
          swarmId: swarmConfig.swarmId, // Link to swarm
        },
      });
    }

    log(`[seedSwarms] Created swarm "${swarmName.fullName}" with ${AGENTS_PER_SWARM} agents`);
  }

  log(
    `[seedSwarms] Seeding complete: ${SWARM_COUNT} swarms created with ${SWARM_COUNT * AGENTS_PER_SWARM} total agents`
  );
}

async function generateJobs() {
  let successCount = 0;
  let failureCount = 0;
  const failureReasons: Record<string, number> = {};

  for (let i = 0; i < JOBS_PER_MIN; i++) {
    try {
      const job = await jobGenerator.generateJob();

      // Save job to database for tracking
      const dbJob = await prisma.job.create({
        data: {
          category: 'general', // Simplified: no categories
          payload: JSON.stringify({ prompt: job.prompt }),
          payout: job.payout,
          deadlineS: job.deadlineS,
        },
      });

      // Add to Redis queue for worker processing
      await jobQueue.add('job', {
        dbJobId: dbJob.id, // Include database job ID for proper tracking
        category: 'general',
        payload: { prompt: job.prompt },
        payout: job.payout,
        deadlineS: job.deadlineS,
      } as any);

      log(`[jobs] ✅ Generated general job: ${job.prompt.substring(0, 100)}...`);
      successCount++;
    } catch (error) {
      console.error('[jobs] ❌ Failed to generate job:', (error as Error).message);
      failureCount++;

      // Track failure reasons
      const reason = (error as Error).message || 'Unknown error';
      failureReasons[reason] = (failureReasons[reason] || 0) + 1;
    }
  }

  // Log summary
  log(
    `[jobs] Generation summary: ${successCount}/${JOBS_PER_MIN} successful, ${failureCount} failed`
  );
  if (failureCount > 0) {
    log('[jobs] Failure reasons:', failureReasons);
  }
}

async function gradeWithLLM(jobPrompt: string, artifact: string) {
  // Use the new LLM-based grader - no fallback, let failures fail
  const gradeResult = await llmGrader.gradeResponse(jobPrompt, artifact);
  return gradeResult;
}

const agentWorkers: any[] = [];
async function startAgentWorkers() {
  log('[workers] Starting swarm workers...');

  try {
    // Use swarm-based workers only
    const swarms = await prisma.swarm.findMany({ where: { alive: true } });
    log(`[workers] Found ${swarms.length} alive swarms`);

    for (let i = 0; i < swarms.length; i++) {
      const swarm = swarms[i];

      // Add delay between worker creation to prevent server overload
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
      }

      // Get agents for this swarm to determine archetypes and create agent instances
      const swarmAgents = await prisma.agentState.findMany({
        where: { swarmId: swarm.id, alive: true },
      });

      const swarmArchetypes = swarmAgents.map((a: any) => a.archetype);

      // Create actual agent instances for each database agent
      const agentInstances: any[] = [];
      for (const dbAgent of swarmAgents) {
        let agentInstance;
        if (dbAgent.archetype === 'tool-builder') {
          agentInstance = new ToolBuilderAgent(dbAgent.id);
        } else {
          agentInstance = createAgentForBlueprint(dbAgent.id, dbAgent.archetype);
        }

        // Add metadata to match the agent instance with the database record
        agentInstance.id = dbAgent.id;
        agentInstance.name = dbAgent.name || `Agent ${dbAgent.id}`;
        agentInstance.archetype = dbAgent.archetype;

        agentInstances.push(agentInstance);
      }

      // Create swarm config with the loaded agent instances
      const swarmConfig: SwarmConfig = {
        id: swarm.id,
        name: swarm.name,
        description: swarm.description || undefined,
        agentTypes: swarmArchetypes as any[],
        agentCount: swarmAgents.length,
        existingAgents: agentInstances,
      };

      const worker = new Worker(
        'jobs',
        async (job: any) => {
          const started = Date.now();

          // Check if system is paused
          if (systemState.status !== 'running') {
            log(`[Worker] Skipping job ${job.data.dbJobId} - system is paused`);
            throw new Error('System is paused');
          }

          // Create SwarmAgent to handle the job
          const swarmAgent = createSwarmAgent(swarmConfig);
          log(`[Worker] Swarm ${swarm.id} processing job ${job.data.dbJobId}`);

          try {
            const result = await swarmAgent.invoke({
              category: job.data.category || 'general',
              payload: job.data.payload,
              payout: job.data.payout,
              deadlineS: job.data.deadlineS,
            });

            // First check if the swarm execution succeeded
            const agentSucceeded = true; // SwarmAgent throws on failure

            // Only grade the artifact if the swarm actually succeeded
            let gradeResult: { passed: boolean; qualityScore?: number } = { passed: false };
            let gradingFailed = false;

            if (agentSucceeded) {
              try {
                // Extract job prompt for grading context
                const jobPrompt =
                  typeof job.data.payload === 'string'
                    ? job.data.payload
                    : job.data.payload.prompt || JSON.stringify(job.data.payload);

                gradeResult = await gradeWithLLM(jobPrompt, result);
              } catch (error) {
                logError(`[workers] Grading failed for job ${job.data.dbJobId}:`, error);
                gradingFailed = true;
              }
            }

            // The job is successful only if swarm execution succeeded, grading succeeded, and grade passed
            const jobSucceeded = agentSucceeded && !gradingFailed && gradeResult.passed;

            const delta = jobSucceeded ? job.data.payout : -FAIL_PENALTY;
            await prisma.ledger.create({
              data: {
                swarmId: swarm.id, // Use swarmId instead of agentId
                jobId: job.data.dbJobId,
                delta,
                reason: jobSucceeded ? 'payout' : 'fail',
                qualityGrade: gradeResult.qualityScore || null,
              },
            });

            const ttc = Math.floor((Date.now() - started) / 1000);
            await prisma.swarm.update({
              where: { id: swarm.id },
              data: {
                balance: { increment: delta },
                attempts: { increment: 1 },
                wins: { increment: jobSucceeded ? 1 : 0 },
                meanTtcSec: Math.floor(
                  (swarm.meanTtcSec * swarm.attempts + ttc) / (swarm.attempts + 1)
                ),
              },
            });

            // Clean up excessive whitespace to prevent storage issues
            let artifact = result;
            if (typeof result === 'string') {
              const originalLength = result.length;

              // First handle excessive spaces within lines
              artifact = result.replace(/ {100,}/g, ' '); // Replace 100+ spaces with single space

              // Then handle line-level whitespace
              artifact = artifact
                .split('\n')
                .map((line) => line.trim()) // Trim whitespace from each line
                .filter((line) => line.length > 0 || artifact.includes('\n\n')) // Keep empty lines only if there are paragraph breaks
                .join('\n')
                .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with just 2
                .trim(); // Remove leading/trailing whitespace

              if (originalLength > 100000 && artifact.length < originalLength / 2) {
                log(
                  `[Worker] Cleaned swarm result whitespace: ${originalLength} -> ${artifact.length} chars`
                );
              }

              // Only truncate if still too large after cleanup
              if (artifact.length > 100000) {
                artifact = artifact.substring(0, 100000) + '\n... [truncated due to size]';
                log(
                  `[Worker] Swarm result still too large after cleanup (${artifact.length} chars), truncating`
                );
              }
            }

            return {
              ok: jobSucceeded,
              artifact,
              toolsUsed: true, // Swarms use tools
              newToolsCreated: false, // Track if needed
              stepsUsed: 0, // Track if needed
              selectedTool: null,
              builderRationale: null,
              executionArgs: null,
              toolOutputSnippet: null,
              summarySource: null,
              totalToolsAvailable: null,
            };
          } catch (error) {
            logError(`[Worker] Swarm ${swarm.id} failed on job ${job.data.dbJobId}:`, error);

            // Record failure
            const delta = -FAIL_PENALTY;
            await prisma.ledger.create({
              data: {
                swarmId: swarm.id,
                jobId: job.data.dbJobId,
                delta,
                reason: 'fail',
                qualityGrade: null,
              },
            });

            const ttc = Math.floor((Date.now() - started) / 1000);
            await prisma.swarm.update({
              where: { id: swarm.id },
              data: {
                balance: { increment: delta },
                attempts: { increment: 1 },
                meanTtcSec: Math.floor(
                  (swarm.meanTtcSec * swarm.attempts + ttc) / (swarm.attempts + 1)
                ),
              },
            });

            return {
              ok: false,
              artifact: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              toolsUsed: false,
              newToolsCreated: false,
              stepsUsed: 0,
              selectedTool: null,
              builderRationale: null,
              executionArgs: null,
              toolOutputSnippet: null,
              summarySource: null,
              totalToolsAvailable: null,
            };
          }
        },
        {
          connection: redis,
          concurrency: 1, // One job per swarm at a time for now
        }
      );

      agentWorkers.push(worker);
    }

    log(`[workers] Started ${swarms.length} swarm workers`);
  } catch (error) {
    logError('[workers] Error in startAgentWorkers:', error);
    throw error; // Re-throw to be caught by startSystemProcesses
  }
}

async function epochTick() {
  const states = await prisma.agentState.findMany({ where: { alive: true } });
  const balances = states.map((s: any) => s.balance);
  const g = gini(balances);
  const share5 = topKShare(balances, 5);
  const ts = new Date().toISOString();

  fs.appendFileSync(
    path.join(METRICS_DIR, 'inequality.csv'),
    `${ts},${g.toFixed(4)},${share5.toFixed(4)}\n`
  );

  // reproduce
  const bps = await prisma.blueprint.findMany();
  // Get current agent names for logging
  const currentAgents = await prisma.agentState.findMany({
    where: { alive: true },
    select: { id: true, name: true },
  });
  const currentAgentNameMap = new Map(currentAgents.map((a: any) => [a.id, a.name]));

  for (const s of states) {
    const bp = bps.find((b: any) => b.id === s.blueprintId)!;
    if (s.balance >= bp.minBalance) {
      const newTemp = [0.1, 0.3, 0.5][Math.floor(Math.random() * 3)];
      const toolsSet = new Set(bp.tools.split(',').filter(Boolean));
      const opts = ['browser', 'retrieval', 'stringKit', 'calc'];
      const t = opts[Math.floor(Math.random() * opts.length)];
      if (toolsSet.has(t)) toolsSet.delete(t);
      else toolsSet.add(t);

      // Archetype mutation during reproduction (using tool names)
      const archetypes = ['wikipedia', 'llm-only', 'web-browser', 'google-trends'];
      const mutatedArchetype =
        Math.random() < 0.1 // 10% chance of archetype mutation
          ? archetypes[Math.floor(Math.random() * archetypes.length)]
          : bp.archetype; // Keep parent's archetype 90% of the time

      const child = await prisma.blueprint.create({
        data: {
          version: bp.version + 1,
          llmModel: bp.llmModel,
          temperature: newTemp,
          tools: Array.from(toolsSet).join(','),
          archetype: mutatedArchetype, // Phase 5: Include archetype with mutation
          coopThreshold: bp.coopThreshold,
          minBalance: bp.minBalance,
          mutationRate: bp.mutationRate,
          maxOffspring: bp.maxOffspring,
        },
      });

      // Generate a name for the offspring
      let offspringName: string;
      try {
        const names = await nameGenerator.generateNames([
          {
            archetype: mutatedArchetype,
            temperature: newTemp,
            tools: Array.from(toolsSet) as string[],
          },
        ]);
        offspringName = names[0].fullName;
      } catch (error) {
        logError('[reproduction] Failed to generate name for offspring:', error);
        offspringName = `Offspring of ${currentAgentNameMap.get(s.id) || s.id.substring(0, 8)}`;
      }

      await prisma.agentState.create({
        data: {
          blueprintId: child.id,
          name: offspringName,
          balance: 5,
          reputation: 0.5,
          attempts: 0,
          wins: 0,
          meanTtcSec: 0,
          alive: true,
        },
      });

      await prisma.agentState.update({
        where: { id: s.id },
        data: { balance: { decrement: 5 } },
      });
    }
  }

  // cull
  const refreshed = await prisma.agentState.findMany({ where: { alive: true } });
  const sorted = [...refreshed].sort((a: any, b: any) => a.balance - b.balance);
  const cut = Math.max(1, Math.floor(sorted.length * 0.2));
  const toCull = new Set(sorted.slice(0, cut).map((s: any) => s.id));
  for (const s of refreshed) if (s.balance < 0) toCull.add(s.id);
  for (const id of Array.from(toCull))
    await prisma.agentState.update({ where: { id }, data: { alive: false } });
}

async function main() {
  app.get('/healthz', async () => {
    const health: any = {
      ok: true,
      mode: BOOTSTRAP ? 'bootstrap' : 'full',
      time: new Date().toISOString(),
      services: {},
    };

    if (!BOOTSTRAP) {
      // Check Redis connection
      try {
        await redis.ping();
        health.services.redis = { status: 'healthy', url: cfg.REDIS_URL };
      } catch (error) {
        health.ok = false;
        health.services.redis = { status: 'unhealthy', error: (error as Error).message };
      }

      // Check Prisma/SQLite connection
      try {
        await prisma.$queryRaw`SELECT 1 as test`;
        health.services.database = { status: 'healthy', type: 'sqlite' };
      } catch (error) {
        health.ok = false;
        health.services.database = { status: 'unhealthy', error: (error as Error).message };
      }
    }

    return health;
  });

  if (BOOTSTRAP) {
    // Minimal server only; skip external services for M-1 dev
    await app.listen({ port: cfg.SOUP_RUNNER_PORT, host: '0.0.0.0' });
    log(`[soup-runner] ${cfg.SOUP_RUNNER_PORT} (bootstrap)`);
    return;
  }
  // Initialize Redis and Prisma only in full mode
  redis = new IORedis(cfg.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();
  await prisma.$connect();
  fs.ensureDirSync(METRICS_DIR);
  fs.writeFileSync(path.join(METRICS_DIR, 'inequality.csv'), 'ts,gini,top5share\n');
  jobQueue = new Queue('jobs', { connection: redis });

  // Preload models before seeding (name generation needs LLM)
  await preloadOllamaModels();

  await seedIfEmpty();

  // Initialize system in running state
  log('[soup-runner] System starting in running state...');
  log('[soup-runner] Generating initial job batch...');

  // Generate initial jobs
  await generateJobs();
  log('[soup-runner] Initial job batch generated successfully');

  // Start workers and job generation
  log('[soup-runner] Starting agent workers and job generation...');
  await startSystemProcesses();
  log('[soup-runner] Workers started successfully');

  // Start HTTP server after initialization is complete
  await app.listen({ port: cfg.SOUP_RUNNER_PORT, host: '0.0.0.0' });
  log(`[soup-runner] ${cfg.SOUP_RUNNER_PORT}`);
  log('[soup-runner] System ready and processing jobs.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
