/*
 Summarize last N minutes of tool-builder activity.
 - Counts jobs created
 - Counts payouts/fails for tool-builder agents
 - Totals browser step costs
 - Lists generated tools created during the window
*/

import fs from 'fs-extra';
import path from 'path';
import IORedis from 'ioredis';

async function getRedis(): Promise<IORedis | null> {
  try {
    return new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: 2,
    });
  } catch (error) {
    console.warn('[summarize-run] Failed to create Redis client:', error);
    return null;
  }
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--minutes='));
  const minutes = arg ? Number(arg.split('=')[1]) : 10;
  const windowStart = new Date(Date.now() - minutes * 60_000);

  // Prisma client
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // Tool-builder agents
    const toolBuilderBlueprints = await prisma.blueprint.findMany({
      where: { archetype: 'tool-builder' },
      select: { id: true },
    });
    const tbBlueprintIds = new Set<string>(
      toolBuilderBlueprints.map(({ id }: { id: string }) => id)
    );
    const tbAgents = await prisma.agentState.findMany({
      where: { blueprintId: { in: Array.from(tbBlueprintIds) } },
      select: { id: true },
    });
    const tbAgentIds = tbAgents.map(({ id }: { id: string }) => id);

    // Jobs during window
    const jobsInWindow = await prisma.job.count({ where: { createdAt: { gte: windowStart } } });

    // Ledger activity for tool-builders during window
    const ledger = await prisma.ledger.findMany({
      where: {
        ts: { gte: windowStart },
        agentId: { in: tbAgentIds },
      },
      select: { delta: true, reason: true, qualityGrade: true, jobId: true },
    });

    let payouts = 0;
    let fails = 0;
    let stepCost = 0;
    let avgQualitySum = 0;
    let avgQualityCount = 0;
    const succeededJobs = new Set<string>();
    const jobOutcomes = new Map<string, 'payout' | 'fail'>();

    for (const l of ledger) {
      if (l.reason === 'payout') {
        payouts++;
        if (l.jobId) succeededJobs.add(l.jobId);
        if (typeof l.qualityGrade === 'number') {
          avgQualitySum += l.qualityGrade;
          avgQualityCount++;
        }
      } else if (l.reason === 'fail') {
        fails++;
      } else if (l.reason === 'browser_steps') {
        stepCost += Math.abs(l.delta);
      }

      if (l.jobId && (l.reason === 'payout' || l.reason === 'fail')) {
        jobOutcomes.set(l.jobId, l.reason as 'payout' | 'fail');
      }
    }
    const avgQuality =
      avgQualityCount > 0 ? Math.round((avgQualitySum / avgQualityCount) * 10) / 10 : null;

    const toolJobIds = Array.from(jobOutcomes.keys());
    const usageMap = new Map<
      string,
      { toolsUsed: boolean; newToolsCreated: boolean; selectedTool: string | null }
    >();

    const redis = await getRedis();
    if (redis && toolJobIds.length > 0) {
      try {
        const jobIdSet = new Set(toolJobIds);
        const completed = await redis.zrange('bull:jobs:completed', 0, -1);
        const failed = await redis.zrange('bull:jobs:failed', 0, -1);
        const allProcessed = [...completed, ...failed];

        for (const bullJobId of allProcessed) {
          try {
            const dataRaw = await redis.hget(`bull:jobs:${bullJobId}`, 'data');
            if (!dataRaw) continue;
            const parsedData = JSON.parse(dataRaw);
            const dbJobId: string | undefined = parsedData?.dbJobId;
            if (!dbJobId || !jobIdSet.has(dbJobId)) continue;

            const returnRaw = await redis.hget(`bull:jobs:${bullJobId}`, 'returnvalue');
            if (!returnRaw) continue;
            const parsedReturn = JSON.parse(returnRaw);
            usageMap.set(dbJobId, {
              toolsUsed: Boolean(parsedReturn?.toolsUsed),
              newToolsCreated: Boolean(parsedReturn?.newToolsCreated),
              selectedTool:
                typeof parsedReturn?.selectedTool === 'string' ? parsedReturn.selectedTool : null,
            });

            if (usageMap.size === jobIdSet.size) {
              break;
            }
          } catch (err) {
            console.warn('[summarize-run] Failed to parse Bull job payload:', err);
          }
        }
      } finally {
        await redis.quit();
      }
    }

    const toolUsageBuckets = {
      used: { total: 0, success: 0, newTools: 0 },
      skipped: { total: 0, success: 0, newTools: 0 },
      unknown: { total: 0, success: 0 },
    };

    for (const jobId of toolJobIds) {
      const outcome = jobOutcomes.get(jobId);
      if (!outcome) continue;
      const success = outcome === 'payout';
      const usage = usageMap.get(jobId);

      if (!usage) {
        toolUsageBuckets.unknown.total++;
        if (success) toolUsageBuckets.unknown.success++;
        continue;
      }

      if (usage.toolsUsed) {
        toolUsageBuckets.used.total++;
        if (success) toolUsageBuckets.used.success++;
        if (usage.newToolsCreated) toolUsageBuckets.used.newTools++;
      } else {
        toolUsageBuckets.skipped.total++;
        if (success) toolUsageBuckets.skipped.success++;
        if (usage.newToolsCreated) toolUsageBuckets.skipped.newTools++;
      }
    }

    // Generated tools created during window (manifests)
    const manifestsDir = path.resolve(
      __dirname,
      '../../../packages/agents/dist/src/generated-tools/manifests'
    );
    const manifestNames = (await fs.pathExists(manifestsDir)) ? await fs.readdir(manifestsDir) : [];
    const recentTools: { toolName: string; createdAt: string }[] = [];
    for (const file of manifestNames) {
      if (!file.endsWith('.json')) continue;
      try {
        const manifest = await fs.readJson(path.join(manifestsDir, file));
        const createdAt = new Date(manifest.createdAt);
        if (!Number.isNaN(createdAt.getTime()) && createdAt >= windowStart) {
          recentTools.push({ toolName: manifest.toolName, createdAt: manifest.createdAt });
        }
      } catch (err) {
        // Skip manifests that fail to load (stale or partial writes)
        continue;
      }
    }

    const toRate = (successes: number, total: number) =>
      total > 0 ? Math.round((successes / total) * 1000) / 10 : null;

    const summary = {
      windowMinutes: minutes,
      timeStart: windowStart.toISOString(),
      toolBuilderAgents: tbAgentIds.length,
      jobsCreated: jobsInWindow,
      payouts,
      fails,
      succeededJobs: succeededJobs.size,
      avgQuality,
      browserStepCost: stepCost,
      toolsCreated: recentTools.length,
      recentTools,
      toolUsage: {
        totalTrackedJobs: toolJobIds.length,
        withTelemetry: usageMap.size,
        toolRuns: {
          total: toolUsageBuckets.used.total,
          successRatePct: toRate(toolUsageBuckets.used.success, toolUsageBuckets.used.total),
          newToolsUsed: toolUsageBuckets.used.newTools,
        },
        plannerOnly: {
          total: toolUsageBuckets.skipped.total,
          successRatePct: toRate(toolUsageBuckets.skipped.success, toolUsageBuckets.skipped.total),
          reportedNewTools: toolUsageBuckets.skipped.newTools,
        },
        unknown: {
          total: toolUsageBuckets.unknown.total,
          successRatePct: toRate(toolUsageBuckets.unknown.success, toolUsageBuckets.unknown.total),
        },
      },
    };

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('summarize-run failed:', e);
  process.exit(1);
});
