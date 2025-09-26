#!/usr/bin/env node
/**
 * Tool Registry Diagnostic Script
 *
 * Usage:
 *   node debug-tools.js                    # List all tools for all agents
 *   node debug-tools.js agent-id          # List tools for specific agent
 *   node debug-tools.js --manifests       # Show manifest files
 */

const { dynamicToolLoader } = require('./packages/agents/dist/src/tools/dynamicToolLoader');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

async function main() {
  const args = process.argv.slice(2);
  const agentId = args[0] && !args[0].startsWith('--') ? args[0] : undefined;

  if (args.includes('--manifests')) {
    console.log('📁 Manifest Files:');
    const manifestsDir = path.join(__dirname, 'packages/agents/src/generated-tools/manifests');

    try {
      const files = await fs.readdir(manifestsDir);
      const manifests = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const manifestPath = path.join(manifestsDir, file);
          const manifestData = await fs.readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(manifestData);
          manifests.push({
            file,
            toolName: manifest.toolName,
            createdBy: manifest.createdBy,
            createdAt: manifest.createdAt,
            usageCount: manifest.usageCount,
            successCount: manifest.successCount,
            failureCount: manifest.failureCount,
          });
        }
      }

      console.log(`Found ${manifests.length} manifest files:`);
      manifests
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 20)
        .forEach((m) => {
          console.log(`   ${m.toolName} (${m.file})`);
          console.log(`     Created by: ${m.createdBy}`);
          console.log(
            `     Usage: ${m.usageCount} total, ${m.successCount} success, ${m.failureCount} failures`
          );
          console.log(
            `     Success rate: ${m.usageCount > 0 ? Math.round((m.successCount / m.usageCount) * 100) : 0}%`
          );
          console.log('');
        });
    } catch (error) {
      console.error('❌ Failed to read manifests:', error.message);
    }

    return;
  }

  if (agentId) {
    console.log(`🔧 Tools for agent: ${agentId}`);
    try {
      const tools = await dynamicToolLoader.loadToolsForAgent(agentId);
      console.log(`Found ${tools.length} tools:`);
      tools.forEach((tool) => {
        console.log(`   ${tool.name}: ${tool.description || 'No description'}`);
        console.log(`     Manifest: ${tool.manifest ? tool.manifest.toolName : 'No manifest'}`);
        console.log(`     Created by: ${tool.manifest ? tool.manifest.createdBy : 'Unknown'}`);
        console.log('');
      });
    } catch (error) {
      console.error('❌ Failed to load tools for agent:', error.message);
    }
  } else {
    console.log('🔧 Tool Registry Diagnostics:');

    try {
      // Get registry stats
      const stats = dynamicToolLoader.getRegistryStats();
      console.log(`Registry stats:`);
      console.log(`   Total tools: ${stats.totalTools}`);
      console.log(`   Average success rate: ${Math.round(stats.averageSuccessRate * 100)}%`);
      console.log(
        `   Tool names: ${stats.toolNames.slice(0, 10).join(', ')}${stats.toolNames.length > 10 ? '...' : ''}`
      );
      console.log('');

      // Load some recent tools
      console.log('Loading tools for a sample agent...');
      const sampleTools = await dynamicToolLoader.loadToolsForAgent('sample_agent_for_debug');
      console.log(`Sample agent would see ${sampleTools.length} tools`);
    } catch (error) {
      console.error('❌ Failed to get registry diagnostics:', error.message);
    }
  }
}

main().catch(console.error);
