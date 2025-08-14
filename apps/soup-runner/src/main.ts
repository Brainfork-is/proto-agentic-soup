import Fastify from 'fastify';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
// Prisma is imported dynamically to avoid requiring a generated client in bootstrap mode
// import { PrismaClient } from '@prisma/client';
import { nowIso, gini, topKShare, loadRunnerConfig } from '@soup/common';
import fs from 'fs-extra';
import path from 'path';
import { SimpleAgent } from '@soup/agents';

const cfg = loadRunnerConfig();
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

let jobQueue: any;

async function seedIfEmpty() {
  const agents = await prisma.agentState.findMany();
  if (agents.length > 0) return;

  const seeds = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../../seeds', 'archetypes.json'), 'utf8')
  );

  for (const a of seeds.agents) {
    await prisma.blueprint.create({
      data: {
        version: 1,
        llmModel: a.llmModel,
        temperature: a.temperature,
        tools: (a.tools || []).join(','),
        coopThreshold: a.coopThreshold,
        minBalance: 30,
        mutationRate: 0.15,
        maxOffspring: 2,
      },
    });

    const bp = await prisma.blueprint.findFirst({ orderBy: { createdAt: 'desc' } });
    await prisma.agentState.create({
      data: {
        blueprintId: bp!.id,
        balance: 10,
        reputation: 0.5,
        attempts: 0,
        wins: 0,
        meanTtcSec: 0,
        alive: true,
      },
    });
  }
}

async function generateJobs() {
  for (let i = 0; i < JOBS_PER_MIN; i++) {
    const cats = ['web_research', 'summarize', 'classify', 'math'] as const;
    const category = cats[Math.floor(Math.random() * cats.length)];

    const payload =
      category === 'web_research'
        ? {
            url: 'http://localhost:3200/docs/vector-db.html',
            question: 'Name one advantage of PGVector.',
          }
        : category === 'summarize'
          ? { text: 'RAG fetches documents to ground responses in facts.', maxWords: 12 }
          : category === 'classify'
            ? {
                text: 'Milvus supports sharding and replication.',
                labels: ['DB', 'Not-DB', 'Unknown'],
                answer: 'DB',
              }
            : { expr: '2 + 2 * 3' };

    await jobQueue.add('job', {
      category,
      payload,
      payout: 5 + Math.floor(Math.random() * 6),
      deadlineS: 60,
    } as any);
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
  setInterval(generateJobs, 60_000);
  await generateJobs();
  await startAgentWorkers();
  setInterval(() => epochTick().catch(console.error), EPOCH_MINUTES * 60_000);
  app
    .listen({ port: cfg.SOUP_RUNNER_PORT, host: '0.0.0.0' })
    .then(() => console.log(`[soup-runner] ${cfg.SOUP_RUNNER_PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
