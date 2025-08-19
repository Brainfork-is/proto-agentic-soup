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

  let redis: IORedis | null = null;
  try {
    redis = await getRedis();
  } catch (error) {
    logError('Warning: Could not connect to Redis, status will be approximate:', error);
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
      agentId = ledgerEntry.agentId;
      status = ledgerEntry.reason === 'payout' ? 'completed' : 'failed';
      qualityGrade = ledgerEntry.qualityGrade || undefined;
      completedAt = ledgerEntry.ts.toISOString();

      // Get agent archetype from blueprint
      const agent = await prisma.agentState.findUnique({
        where: { id: ledgerEntry.agentId },
      });

      if (agent) {
        const blueprint = await prisma.blueprint.findUnique({
          where: { id: agent.blueprintId },
        });
        agentArchetype = blueprint?.archetype;
      }
    }

    // Try to get job result from Redis for additional details
    if (redis && status !== 'pending') {
      try {
        const completedJobs = await redis.zrange('bull:jobs:completed', 0, -1);
        const failedJobs = await redis.zrange('bull:jobs:failed', 0, -1);

        for (const redisJobId of [...completedJobs, ...failedJobs]) {
          const redisJob = await redis.hgetall(`bull:jobs:${redisJobId}`);
          if (redisJob && redisJob.data) {
            const jobData = JSON.parse(redisJob.data);
            if (jobData.dbJobId === job.id && redisJob.returnvalue) {
              const returnValue = JSON.parse(redisJob.returnvalue);
              result = returnValue.artifact || 'No result';
              stepsUsed = returnValue.stepsUsed || 0;
              break;
            }
          }
        }
      } catch (error) {
        logError(`Error fetching Redis data for job ${job.id}:`, error);
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
