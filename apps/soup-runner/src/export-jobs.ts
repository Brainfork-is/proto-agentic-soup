#!/usr/bin/env node
/**
 * CLI utility to export job data to CSV
 * Usage: npx tsx src/export-jobs.ts [--all] [--output filename.csv]
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { log, logError } from '@soup/common';
import IORedis from 'ioredis';

const prisma = new PrismaClient();

interface JobExportData {
  id: string;
  category: string;
  payload: string;
  payout: number;
  createdAt: string;
  status: string;
  agentId?: string;
  agentArchetype?: string;
  result?: string;
  stepsUsed?: number;
  completedAt?: string;
  qualityGrade?: number;
}

async function getRedis() {
  const redis = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: 3,
  });
  return redis;
}

async function fetchJobsWithStatus(limit?: number): Promise<JobExportData[]> {
  log(`Fetching jobs from database${limit ? ` (limit: ${limit})` : ' (all)'}...`);

  const jobs = await prisma.job.findMany({
    ...(limit && { take: limit }),
    orderBy: { createdAt: 'desc' },
  });

  log(`Found ${jobs.length} jobs in database`);

  // Build a map of Redis job results for efficient batch lookup
  const redisResultsMap = new Map<string, any>();

  let redis: IORedis | null = null;
  try {
    redis = await getRedis();

    if (redis) {
      log('Fetching job results from Redis...');
      const completedJobs = await redis.zrange('bull:jobs:completed', 0, -1);
      const failedJobs = await redis.zrange('bull:jobs:failed', 0, -1);

      // Batch fetch all job data
      const allJobIds = [...completedJobs, ...failedJobs];
      for (const redisJobId of allJobIds) {
        try {
          const [dataRaw, returnRaw] = await redis.hmget(
            `bull:jobs:${redisJobId}`,
            'data',
            'returnvalue'
          );

          if (dataRaw) {
            const jobData = JSON.parse(dataRaw);
            if (jobData.dbJobId && returnRaw) {
              const returnValue = JSON.parse(returnRaw);
              redisResultsMap.set(jobData.dbJobId, returnValue);
            }
          }
        } catch (err) {
          // Skip invalid entries
        }
      }
      log(`Found ${redisResultsMap.size} job results in Redis`);
    }
  } catch (error) {
    logError('Warning: Could not connect to Redis, results will be empty:', error);
  }

  const exportData: JobExportData[] = [];

  for (const job of jobs) {
    let status = 'pending';
    let agentId: string | undefined;
    let agentArchetype: string | undefined;
    let result: string | undefined;
    let stepsUsed: number | undefined;
    let completedAt: string | undefined;
    let qualityGrade: number | undefined;

    // Get agent info and job result from ledger entries
    const ledgerEntry = await prisma.ledger.findFirst({
      where: {
        jobId: job.id,
        reason: { in: ['payout', 'fail'] },
      },
      orderBy: { ts: 'asc' },
    });

    if (ledgerEntry) {
      status = ledgerEntry.reason === 'payout' ? 'completed' : 'failed';
      qualityGrade = ledgerEntry.qualityGrade || undefined;
      completedAt = ledgerEntry.ts.toISOString();

      // Handle both individual agents and swarms
      if (ledgerEntry.agentId) {
        // Individual agent
        agentId = ledgerEntry.agentId;
        const agent = await prisma.agentState.findUnique({
          where: { id: ledgerEntry.agentId },
        });

        if (agent) {
          if (agent.blueprintId) {
            // Traditional agent with blueprint
            const blueprint = await prisma.blueprint.findUnique({
              where: { id: agent.blueprintId },
            });
            agentArchetype = blueprint?.archetype;
          } else {
            // Swarm member agent with archetype stored directly
            agentArchetype = agent.archetype || undefined;
          }
        }
      } else if (ledgerEntry.swarmId) {
        // Swarm-level transaction
        agentId = ledgerEntry.swarmId;
        const swarm = await prisma.swarm.findUnique({
          where: { id: ledgerEntry.swarmId },
        });
        agentArchetype = swarm ? 'swarm' : 'unknown';
      }
    }

    // Get job result from pre-fetched Redis map
    if (redisResultsMap.has(job.id)) {
      const returnValue = redisResultsMap.get(job.id);
      if (returnValue) {
        // Handle nested artifact structures (common in tool-builder and swarm results)
        let artifactToProcess = returnValue.artifact;

        // If artifact itself is an object with an artifact property, use the nested one
        if (
          artifactToProcess &&
          typeof artifactToProcess === 'object' &&
          artifactToProcess.artifact
        ) {
          artifactToProcess = artifactToProcess.artifact;
        }

        // Handle different result formats
        if (typeof artifactToProcess === 'string') {
          try {
            // Try to parse if it's a JSON string
            const parsed = JSON.parse(artifactToProcess);
            if (parsed.answer) {
              result = parsed.answer;
            } else {
              result = artifactToProcess;
            }
          } catch {
            result = artifactToProcess;
          }
        } else if (artifactToProcess && typeof artifactToProcess === 'object') {
          if (artifactToProcess.answer) {
            result = artifactToProcess.answer;
          } else {
            result = JSON.stringify(artifactToProcess);
          }
        } else if (returnValue.answer) {
          // Direct answer format
          result =
            typeof returnValue.answer === 'string'
              ? returnValue.answer
              : JSON.stringify(returnValue.answer);
        } else {
          result = 'No result';
        }

        // Clean up excessive whitespace to prevent massive CSV files
        if (result) {
          const originalLength = result.length;

          // First handle excessive spaces within lines
          result = result.replace(/ {100,}/g, ' '); // Replace 100+ spaces with single space

          // Then handle line-level whitespace
          const hasParaBreaks = result.includes('\n\n');
          result = result
            .split('\n')
            .map((line) => line.trim()) // Trim whitespace from each line
            .filter((line) => line.length > 0 || hasParaBreaks) // Keep empty lines only if there are paragraph breaks
            .join('\n')
            .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with just 2
            .trim(); // Remove leading/trailing whitespace

          // Log if we removed significant whitespace
          if (originalLength > 100000 && result.length < originalLength / 2) {
            logError(
              `[Export] Cleaned result whitespace: ${originalLength} -> ${result.length} chars for job ${job.id}`
            );
          }

          // Only truncate if still too large after cleanup
          if (result.length > 100000) {
            result = result.substring(0, 100000) + '\n... [truncated due to size]';
          }
        }

        // Get stepsUsed from nested or top level
        stepsUsed =
          (returnValue.artifact && returnValue.artifact.stepsUsed) || returnValue.stepsUsed || 0;

        // Include tool usage info if available
        const toolsUsed =
          (returnValue.artifact && returnValue.artifact.toolsUsed) || returnValue.toolsUsed;
        const selectedTool =
          (returnValue.artifact && returnValue.artifact.selectedTool) || returnValue.selectedTool;
        const newToolsCreated =
          (returnValue.artifact && returnValue.artifact.newToolsCreated) ||
          returnValue.newToolsCreated;

        if (toolsUsed || selectedTool) {
          const toolInfo = [];
          if (selectedTool) toolInfo.push(`Tool: ${selectedTool}`);
          if (newToolsCreated) toolInfo.push('New tool created');
          if (toolInfo.length > 0) {
            result = `${result} [${toolInfo.join(', ')}]`;
          }
        }
      }
    }

    exportData.push({
      id: job.id,
      category: job.category,
      payload: typeof job.payload === 'string' ? job.payload : JSON.stringify(job.payload),
      payout: job.payout,
      createdAt: job.createdAt.toISOString(),
      status,
      agentId,
      agentArchetype,
      result,
      stepsUsed,
      completedAt,
      qualityGrade,
    });
  }

  if (redis) {
    await redis.disconnect();
  }

  return exportData;
}

function formatCSV(data: JobExportData[]): string {
  const headers = [
    'ID',
    'Category',
    'Payload',
    'Payout',
    'Created At',
    'Status',
    'Agent ID',
    'Agent Archetype',
    'Result',
    'Steps Used',
    'Completed At',
    'Quality Grade',
  ];

  const csvRows = [
    headers.join(','),
    ...data.map((job) =>
      [
        `"${job.id}"`,
        `"${job.category}"`,
        `"${job.payload.replace(/"/g, '""')}"`, // Escape quotes
        job.payout.toString(),
        `"${job.createdAt}"`,
        `"${job.status}"`,
        job.agentId ? `"${job.agentId}"` : '',
        job.agentArchetype ? `"${job.agentArchetype}"` : '',
        job.result ? `"${job.result.replace(/"/g, '""')}"` : '', // Escape quotes
        job.stepsUsed?.toString() || '',
        job.completedAt ? `"${job.completedAt}"` : '',
        job.qualityGrade?.toString() || '',
      ].join(',')
    ),
  ];

  return csvRows.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let exportAll = false;
  let outputFile = 'jobs-export.csv';

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') {
      exportAll = true;
    } else if (args[i] === '--output' && i + 1 < args.length) {
      outputFile = args[i + 1];
      i++; // Skip next argument since it's the filename
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Job Export Utility

Usage: npx tsx src/export-jobs.ts [options]

Options:
  --all              Export all jobs (default: last 50 jobs)
  --output <file>    Output filename (default: jobs-export.csv)
  --help, -h         Show this help message

Examples:
  npx tsx src/export-jobs.ts
  npx tsx src/export-jobs.ts --all --output all-jobs.csv
  npx tsx src/export-jobs.ts --output recent-jobs.csv
      `);
      process.exit(0);
    }
  }

  try {
    log('Starting job export...');

    const limit = exportAll ? undefined : 50;
    const jobs = await fetchJobsWithStatus(limit);

    log(`Processing ${jobs.length} jobs for export...`);

    const csvContent = formatCSV(jobs);

    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (outputDir !== '.' && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, csvContent, 'utf-8');

    log(`✅ Export complete: ${jobs.length} jobs written to ${outputFile}`);

    // Summary statistics
    const statusCounts = jobs.reduce(
      (acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    log('Status breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      log(`  ${status}: ${count}`);
    });
  } catch (error) {
    logError('Export failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script if executed directly
main().catch((error) => {
  console.error('Export script failed:', error);
  process.exit(1);
});
