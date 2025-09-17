/*
 Summarize last N minutes of tool-builder activity.
 - Counts jobs created
 - Counts payouts/fails for tool-builder agents
 - Totals browser step costs
 - Lists generated tools created during the window
*/

import fs from 'fs-extra';
import path from 'path';

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
    const tbBlueprintIds = new Set(toolBuilderBlueprints.map((b) => b.id));
    const tbAgents = await prisma.agentState.findMany({
      where: { blueprintId: { in: Array.from(tbBlueprintIds) } },
      select: { id: true },
    });
    const tbAgentIds = tbAgents.map((a) => a.id);

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
    }
    const avgQuality =
      avgQualityCount > 0 ? Math.round((avgQualitySum / avgQualityCount) * 10) / 10 : null;

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
