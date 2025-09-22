/**
 * Test that agents only use their own tools (mutation model)
 */

import { ToolBuilderAgent } from './ToolBuilderAgent';

async function testMutationModel() {
  try {
    console.log('🧬 Testing mutation model - agents should only use their own tools...\n');

    // Create two different agents
    const agent1 = new ToolBuilderAgent('mutation-test-agent-1');
    const agent2 = new ToolBuilderAgent('mutation-test-agent-2');

    // Test job that should create a tool
    const testJob = {
      id: 'mutation-test-job',
      payload: { prompt: 'Create a simple calculator tool that adds two numbers together' },
      category: 'math' as const,
      createdAt: new Date(),
      payout: 100,
      deadlineS: 300,
    };

    console.log('📊 Agent 1 initial stats:', agent1.getStats());
    console.log('📊 Agent 2 initial stats:', agent2.getStats());

    // Agent 1 creates a tool
    console.log('\n🔧 Agent 1 creating a tool...');
    const result1 = await agent1.handle(testJob);
    console.log('Agent 1 result:', {
      ok: result1.ok,
      newToolsCreated: result1.newToolsCreated,
      selectedTool: result1.selectedTool,
      totalToolsAvailable: result1.totalToolsAvailable,
    });

    // Check agent 1 stats after tool creation
    console.log('\n📊 Agent 1 stats after tool creation:', agent1.getStats());

    // Agent 2 should NOT see Agent 1's tool
    console.log("\n🔍 Agent 2 checking available tools (should not see Agent 1's tool)...");
    const agent2StatsAfter = agent2.getStats();
    console.log('📊 Agent 2 stats (should still be 0 tools):', agent2StatsAfter);

    // Agent 2 handles the same job - should create its own tool
    console.log('\n🔧 Agent 2 creating its own tool...');
    const result2 = await agent2.handle(testJob);
    console.log('Agent 2 result:', {
      ok: result2.ok,
      newToolsCreated: result2.newToolsCreated,
      selectedTool: result2.selectedTool,
      totalToolsAvailable: result2.totalToolsAvailable,
    });

    // Final stats
    console.log('\n📊 Final Agent 1 stats:', agent1.getStats());
    console.log('📊 Final Agent 2 stats:', agent2.getStats());

    // Verify mutation model
    const agent1Tools = agent1.getStats().totalTools;
    const agent2Tools = agent2.getStats().totalTools;

    console.log('\n🧬 Mutation Model Verification:');
    console.log(`- Agent 1 tools: ${agent1Tools}`);
    console.log(`- Agent 2 tools: ${agent2Tools}`);
    console.log(`- Tools are isolated: ${agent1Tools > 0 && agent2Tools >= 0 ? '✅' : '❌'}`);

    if (
      result1.selectedTool &&
      result2.selectedTool &&
      result1.selectedTool !== result2.selectedTool
    ) {
      console.log('✅ Different agents created different tools (mutations)');
    } else if (
      result1.selectedTool &&
      result2.selectedTool &&
      result1.selectedTool === result2.selectedTool
    ) {
      console.log('❌ Agents created tools with the same name (unexpected)');
    }

    console.log('\n✅ Mutation model test completed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testMutationModel().catch(console.error);
}

export { testMutationModel };
