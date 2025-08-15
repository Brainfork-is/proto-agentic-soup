import Fastify from 'fastify';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
// Prisma is imported dynamically to avoid requiring a generated client in bootstrap mode
// import { PrismaClient } from '@prisma/client';
import { nowIso, gini, topKShare, loadRunnerConfig } from '@soup/common';
import fs from 'fs-extra';
import path from 'path';

// Load config first to ensure environment variables are available for agents
const cfg = loadRunnerConfig();

// Import agents after config is loaded to ensure env vars are available
import { SimpleAgent, jobGenerator } from '@soup/agents';
const BOOTSTRAP = cfg.SOUP_BOOTSTRAP;

const app = Fastify();
let redis: any;
let prisma: any;

const JOBS_PER_MIN = cfg.JOBS_PER_MIN;
const EPOCH_MINUTES = cfg.EPOCH_MINUTES;
const FAIL_PENALTY = cfg.FAIL_PENALTY;
const STEP_COST = cfg.BROWSER_STEP_COST;

const RUN_DIR = path.join(process.cwd(), 'runs', String(Date.now()));
const METRICS_DIR = path.join(RUN_DIR, 'metrics');
fs.ensureDirSync(METRICS_DIR);

app.get('/leaderboard', async () => {
  const s = await prisma.agentState.findMany();
  const rows = s
    .map((x: any) => ({
      agentId: x.id,
      balance: x.balance,
      wins: x.wins,
      attempts: x.attempts,
    }))
    .sort((a: any, b: any) => b.balance - a.balance)
    .slice(0, 20);
  return { rows };
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
        .grid { display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }
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
        .refresh-btn { background: #4299e1; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
        .refresh-btn:hover { background: #3182ce; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🍲 Agentic Soup Dashboard</h1>
        <button class="refresh-btn" onclick="refreshAll()">Refresh All</button>
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
                <h3>Active Agents</h3>
                <div id="agents-list" class="agent-list"></div>
            </div>
            
            <div class="card">
                <h3>Recent Activity (Last 100)</h3>
                <div id="activity-log" class="activity-log"></div>
            </div>
        </div>
    </div>

    <script>
        let charts = {};
        
        async function fetchData(endpoint) {
            const response = await fetch(endpoint);
            return response.json();
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
            const data = await fetchData('/api/agents');
            const container = document.getElementById('agents-list');
            container.innerHTML = data.map(agent => 
                '<div class="agent-item">' +
                    '<span class="agent-status ' + (agent.alive ? 'alive' : 'dead') + '"></span>' +
                    '<strong>' + agent.id.substring(0, 8) + '...</strong><br>' +
                    'Balance: ' + agent.balance + ' | Wins: ' + agent.wins + '/' + agent.attempts + ' | Temp: ' + agent.temperature + '<br>' +
                    'Tools: ' + agent.tools + ' | Model: ' + agent.llmModel +
                '</div>'
            ).join('');
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
        
        async function refreshAll() {
            await Promise.all([
                refreshSystemHealth(),
                refreshInequalityChart(),
                refreshThroughputChart(), 
                refreshCentralityChart(),
                refreshAgentsList(),
                refreshActivityLog()
            ]);
        }
        
        // Initial load
        refreshAll();
        
        // Auto-refresh every 30 seconds
        setInterval(refreshAll, 30000);
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
    return {
      id: agent.id,
      alive: agent.alive,
      balance: agent.balance,
      wins: agent.wins,
      attempts: agent.attempts,
      reputation: agent.reputation,
      meanTtcSec: agent.meanTtcSec,
      temperature: blueprint?.temperature || 0,
      tools: blueprint?.tools || '',
      llmModel: blueprint?.llmModel || 'unknown',
    };
  });
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

  const activities = [
    ...recentLedger.map((l: any) => ({
      timestamp: l.ts,
      action:
        'Agent ' +
        l.agentId.substring(0, 8) +
        '... ' +
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

let jobQueue: any;

async function seedIfEmpty() {
  const agents = await prisma.agentState.findMany();
  if (agents.length > 0) return;

  const seeds = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../seeds', 'archetypes.json'), 'utf8')
  );

  console.log(`[seed] Creating 60 agents from ${seeds.agents.length} archetypes...`);

  // Create 10 variants for each of the 6 archetypes (60 total agents)
  for (const archetype of seeds.agents) {
    for (let variant = 0; variant < 10; variant++) {
      // Create mutations for each variant
      const mutatedTemperature = mutateTemperature(archetype.temperature, variant);
      const mutatedTools = mutateTools(archetype.tools, variant);
      const mutatedCoopThreshold = mutateCoopThreshold(archetype.coopThreshold, variant);

      // Create blueprint for this variant
      const blueprint = await prisma.blueprint.create({
        data: {
          version: 1,
          llmModel: archetype.llmModel,
          temperature: mutatedTemperature,
          tools: mutatedTools.join(','),
          coopThreshold: mutatedCoopThreshold,
          minBalance: 30,
          mutationRate: 0.15,
          maxOffspring: 2,
        },
      });

      // Create agent state for this variant
      await prisma.agentState.create({
        data: {
          blueprintId: blueprint.id,
          balance: 10 + Math.floor(Math.random() * 5), // 10-14 starting balance variance
          reputation: 0.4 + Math.random() * 0.2, // 0.4-0.6 starting reputation
          attempts: 0,
          wins: 0,
          meanTtcSec: 0,
          alive: true,
        },
      });

      console.log(
        `[seed] Created ${archetype.id}_v${variant}: temp=${mutatedTemperature.toFixed(2)}, tools=[${mutatedTools.join(',')}], coop=${mutatedCoopThreshold.toFixed(2)}`
      );
    }
  }

  console.log('[seed] Seeding complete: 60 agents created');
}

// Mutation functions for creating variants
function mutateTemperature(baseTemp: number, variant: number): number {
  // Create temperature variants: 0.1, 0.2, 0.3, 0.4, 0.5, then some repeats
  const temps = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  return temps[variant] || baseTemp;
}

function mutateTools(baseTools: string[], variant: number): string[] {
  const allTools = ['browser', 'retrieval', 'stringKit', 'calc'];
  const tools = [...baseTools];

  // Apply different tool mutations based on variant
  switch (variant % 4) {
    case 0: // Original tools
      break;
    case 1: {
      // Add a random tool if not present
      const addTool = allTools[Math.floor(Math.random() * allTools.length)];
      if (!tools.includes(addTool)) tools.push(addTool);
      break;
    }
    case 2: {
      // Remove a random tool if more than 1 tool
      if (tools.length > 1) {
        const removeIndex = Math.floor(Math.random() * tools.length);
        tools.splice(removeIndex, 1);
      }
      break;
    }
    case 3: {
      // Swap a tool
      if (tools.length > 0) {
        const swapIndex = Math.floor(Math.random() * tools.length);
        const newTool = allTools[Math.floor(Math.random() * allTools.length)];
        tools[swapIndex] = newTool;
      }
      break;
    }
  }

  return [...new Set(tools)]; // Remove duplicates
}

function mutateCoopThreshold(baseThreshold: number, variant: number): number {
  // Create cooperation threshold variants
  const thresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  return thresholds[variant] || baseThreshold;
}

async function generateJobs() {
  for (let i = 0; i < JOBS_PER_MIN; i++) {
    try {
      const job = await jobGenerator.generateJob();

      await jobQueue.add('job', {
        category: job.category,
        payload: job.payload,
        payout: job.payout,
        deadlineS: job.deadlineS,
      } as any);

      console.log(
        `[jobs] Generated ${job.category} job: ${JSON.stringify(job.payload).substring(0, 100)}...`
      );
    } catch (error) {
      console.error('[jobs] Failed to generate job:', error);

      // Fallback to a simple static job
      await jobQueue.add('job', {
        category: 'math',
        payload: { expr: '1 + 1' },
        payout: 5,
        deadlineS: 60,
      } as any);
    }
  }
}

function grade(cat: string, p: any, artifact: string) {
  if (cat === 'web_research') return /PGVector/i.test(artifact) || /joins/i.test(artifact);
  if (cat === 'summarize') {
    const n = (artifact || '').split(/\s+/).length;
    return n > 0 && n <= ((p && p.maxWords) || 12);
  }
  if (cat === 'classify') return artifact === p.answer;
  if (cat === 'math') return Number(artifact) === 8;
  return false;
}

const agentWorkers: any[] = [];
async function startAgentWorkers() {
  const agents = await prisma.agentState.findMany({ where: { alive: true } });
  const bps = await prisma.blueprint.findMany();

  for (const s of agents) {
    const bp = bps.find((b: any) => b.id === s.blueprintId)!;
    const agent = new SimpleAgent(s.id, bp.temperature, bp.tools.split(',').filter(Boolean));

    const worker = new Worker(
      'jobs',
      async (job: any) => {
        const started = Date.now();
        const res: any = await agent.handle(job.data);

        const steps = res.stepsUsed || 0;
        if (steps > 0) {
          await prisma.ledger.create({
            data: { agentId: s.id, delta: -steps, reason: 'browser_steps' },
          });
          await prisma.agentState.update({
            where: { id: s.id },
            data: { balance: { decrement: steps } },
          });
        }

        const ok = grade(job.data.category, job.data.payload, res.artifact);
        const delta = ok ? job.data.payout : -FAIL_PENALTY;
        await prisma.ledger.create({
          data: { agentId: s.id, delta, reason: ok ? 'payout' : 'fail' },
        });

        const ttc = Math.floor((Date.now() - started) / 1000);
        await prisma.agentState.update({
          where: { id: s.id },
          data: {
            balance: { increment: delta },
            attempts: { increment: 1 },
            wins: { increment: ok ? 1 : 0 },
            meanTtcSec: Math.floor((s.meanTtcSec * s.attempts + ttc) / (s.attempts + 1)),
          },
        });

        return { ok, artifact: res.artifact };
      },
      { connection: redis, concurrency: 1 }
    );

    agentWorkers.push(worker);
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
  for (const s of states) {
    const bp = bps.find((b: any) => b.id === s.blueprintId)!;
    if (s.balance >= bp.minBalance) {
      const newTemp = [0.1, 0.3, 0.5][Math.floor(Math.random() * 3)];
      const toolsSet = new Set(bp.tools.split(',').filter(Boolean));
      const opts = ['browser', 'retrieval', 'stringKit', 'calc'];
      const t = opts[Math.floor(Math.random() * opts.length)];
      if (toolsSet.has(t)) toolsSet.delete(t);
      else toolsSet.add(t);

      const child = await prisma.blueprint.create({
        data: {
          version: bp.version + 1,
          llmModel: bp.llmModel,
          temperature: newTemp,
          tools: Array.from(toolsSet).join(','),
          coopThreshold: bp.coopThreshold,
          minBalance: bp.minBalance,
          mutationRate: bp.mutationRate,
          maxOffspring: bp.maxOffspring,
        },
      });

      await prisma.agentState.create({
        data: {
          blueprintId: child.id,
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
    console.log(`[soup-runner] ${cfg.SOUP_RUNNER_PORT} (bootstrap)`);
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
  await seedIfEmpty();

  // Start HTTP server first so dashboard is immediately available
  await app.listen({ port: cfg.SOUP_RUNNER_PORT, host: '0.0.0.0' });
  console.log(`[soup-runner] ${cfg.SOUP_RUNNER_PORT}`);

  // Then start background processes (job generation, agents, etc.)
  console.log('[soup-runner] Starting background processes...');
  setInterval(generateJobs, 60_000);
  generateJobs().catch(console.error); // Don't await, run in background
  await startAgentWorkers();
  setInterval(() => epochTick().catch(console.error), EPOCH_MINUTES * 60_000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
