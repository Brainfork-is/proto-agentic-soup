#!/usr/bin/env node
/**
 * Log Analysis Script for Agentic Soup
 *
 * Usage:
 *   node analyze-logs.js                    # Analyze today's logs
 *   node analyze-logs.js 2025-09-26        # Analyze specific date
 *   node analyze-logs.js --paths           # Show log file paths
 */

const { LogAnalyzer } = require('./packages/agents/dist/src/llm/index');

async function main() {
  const args = process.argv.slice(2);
  const date = args[0] && !args[0].startsWith('--') ? args[0] : undefined;

  if (args.includes('--paths')) {
    const paths = LogAnalyzer.getLogPaths();
    console.log('📁 Log File Locations:');
    console.log(`   Timeouts: ${paths.timeouts}`);
    console.log(`   Performance: ${paths.performance}`);
    console.log(`   Directory: ${paths.logDir}`);
    return;
  }

  console.log('🔍 Analyzing timeout logs...');

  try {
    const summary = await LogAnalyzer.analyzeTimeouts(date);

    console.log('\n📊 Timeout Analysis Summary:');
    console.log(`   Total timeouts: ${summary.totalTimeouts}`);
    console.log(`   Average response time: ${Math.round(summary.averageResponseTime)}ms`);
    console.log(`   Most problematic URL: ${summary.mostProblematicUrl}`);

    if (Object.keys(summary.timeoutsByType).length > 0) {
      console.log('\n🏷️  Timeout Types:');
      Object.entries(summary.timeoutsByType).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}`);
      });
    }

    if (Object.keys(summary.timeoutsByModel).length > 0) {
      console.log('\n🤖 Affected Models:');
      Object.entries(summary.timeoutsByModel).forEach(([model, count]) => {
        console.log(`   ${model}: ${count}`);
      });
    }

    // Show recent timeout entries
    const recentTimeouts = await LogAnalyzer.readTimeoutLogs(date);
    if (recentTimeouts.length > 0) {
      console.log('\n🕒 Recent Timeout Entries (last 5):');
      recentTimeouts.slice(-5).forEach((entry) => {
        console.log(
          `   ${entry.timestamp} | ${entry.requestId} | ${entry.model} | ${entry.responseTime}ms | ${entry.timeoutType}`
        );
      });
    }
  } catch (error) {
    console.error('❌ Failed to analyze logs:', error.message);
    console.log('\n💡 Make sure the system has run and generated some logs first.');
    console.log('   Log files are created at: logs/timeouts.jsonl and logs/performance.jsonl');
  }
}

main().catch(console.error);
