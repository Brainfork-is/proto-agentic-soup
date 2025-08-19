#!/usr/bin/env node

/**
 * Tool Reuse Analysis Script
 * Analyzes tool creation patterns and usage to verify reuse
 */

const fs = require('fs');
const path = require('path');

const MANIFESTS_DIR = 'packages/agents/src/generated-tools/manifests';

async function analyzeToolReuse() {
  console.log('🔍 Tool Reuse Analysis');
  console.log('======================');

  if (!fs.existsSync(MANIFESTS_DIR)) {
    console.log('❌ Generated tools directory not found');
    return;
  }

  const manifestFiles = fs.readdirSync(MANIFESTS_DIR).filter((f) => f.endsWith('.json'));
  console.log(`📊 Found ${manifestFiles.length} tools\n`);

  const toolsByAgent = {};
  const toolsByType = {};
  let totalUsage = 0;
  let usedTools = 0;

  // Analyze each tool
  for (const file of manifestFiles) {
    const manifestPath = path.join(MANIFESTS_DIR, file);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    // Group by creator
    if (!toolsByAgent[manifest.createdBy]) {
      toolsByAgent[manifest.createdBy] = [];
    }
    toolsByAgent[manifest.createdBy].push(manifest);

    // Group by tool type (name pattern)
    const toolType = manifest.toolName.replace(/_\d+$/, ''); // Remove suffix numbers
    if (!toolsByType[toolType]) {
      toolsByType[toolType] = [];
    }
    toolsByType[toolType].push(manifest);

    // Usage stats
    totalUsage += manifest.usageCount;
    if (manifest.usageCount > 0) {
      usedTools++;
    }
  }

  // Report by Agent
  console.log('👥 Tools by Agent:');
  Object.entries(toolsByAgent).forEach(([agentId, tools]) => {
    const totalUsageForAgent = tools.reduce((sum, t) => sum + t.usageCount, 0);
    const usedByAgent = tools.filter((t) => t.usageCount > 0).length;

    console.log(
      `   ${agentId}: ${tools.length} tools (${usedByAgent} used, ${totalUsageForAgent} total uses)`
    );

    // Show individual tools for this agent
    tools.forEach((tool) => {
      const usageInfo =
        tool.usageCount > 0
          ? `✅ ${tool.usageCount} uses (${tool.successCount}S/${tool.failureCount}F)`
          : `⭕ unused`;
      console.log(`     - ${tool.toolName}: ${usageInfo}`);
    });
    console.log('');
  });

  // Report by Tool Type
  console.log('🛠️  Tool Types:');
  Object.entries(toolsByType).forEach(([toolType, tools]) => {
    if (tools.length > 1) {
      console.log(`   ${toolType}: ${tools.length} versions by different agents`);
      tools.forEach((tool) => {
        const shortId = tool.createdBy.substring(0, 8);
        console.log(`     - by ${shortId}: ${tool.usageCount} uses`);
      });
    } else {
      const tool = tools[0];
      const shortId = tool.createdBy.substring(0, 8);
      console.log(`   ${toolType}: 1 version by ${shortId} (${tool.usageCount} uses)`);
    }
  });

  console.log('\n📈 Usage Summary:');
  console.log(`   Total tools: ${manifestFiles.length}`);
  console.log(
    `   Used tools: ${usedTools} (${((usedTools / manifestFiles.length) * 100).toFixed(1)}%)`
  );
  console.log(`   Total usage events: ${totalUsage}`);
  console.log(`   Average uses per tool: ${(totalUsage / manifestFiles.length).toFixed(1)}`);

  // Identify reuse patterns
  console.log('\n🔄 Reuse Patterns:');
  const duplicateTypes = Object.entries(toolsByType).filter(([_, tools]) => tools.length > 1);
  if (duplicateTypes.length > 0) {
    console.log('   Multiple agents created similar tools:');
    duplicateTypes.forEach(([toolType, tools]) => {
      console.log(`     - ${toolType}: ${tools.length} versions`);
    });
  } else {
    console.log('   No duplicate tool types found - good specialization!');
  }

  // Tools with high usage (evidence of reuse)
  const highUsageTools = manifestFiles
    .map((f) => JSON.parse(fs.readFileSync(path.join(MANIFESTS_DIR, f), 'utf-8')))
    .filter((t) => t.usageCount >= 3)
    .sort((a, b) => b.usageCount - a.usageCount);

  if (highUsageTools.length > 0) {
    console.log('\n🌟 Most Reused Tools:');
    highUsageTools.forEach((tool) => {
      const successRate =
        tool.usageCount > 0 ? ((tool.successCount / tool.usageCount) * 100).toFixed(1) : '0.0';
      console.log(`   ${tool.toolName}: ${tool.usageCount} uses (${successRate}% success)`);
    });
  }

  // Expected reuse scenarios
  console.log('\n🎯 Expected Reuse Scenarios:');
  console.log('   1. Agent reuses own calculator tool for similar math jobs');
  console.log('   2. Agent loads successful shared tools from other agents');
  console.log('   3. Usage counts increase as tools get reused');
  console.log('   4. Tools with >70% success rate become available to all agents');
}

analyzeToolReuse().catch(console.error);
