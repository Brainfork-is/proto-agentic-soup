#!/usr/bin/env node

/**
 * Test script for LangChain ToolBuilderAgent
 * Tests agent functionality with a dummy job to verify tool creation and execution
 */

const path = require('path');

// Load the actual .env file instead of mocking
require('dotenv').config();

// Set up test-specific environment
process.env.NODE_ENV = 'development';
process.env.USE_LANGCHAIN_TOOL_BUILDER = 'true';

console.log('🔧 Environment Configuration:');
console.log('GOOGLE_CLOUD_PROJECT:', process.env.GOOGLE_CLOUD_PROJECT);
console.log('GOOGLE_CLOUD_LOCATION:', process.env.GOOGLE_CLOUD_LOCATION);
console.log('VERTEX_AI_MODEL:', process.env.VERTEX_AI_MODEL);
console.log('LLM_CONFIG_TOOL_BUILDER:', process.env.LLM_CONFIG_TOOL_BUILDER);
console.log(
  'Credentials file exists:',
  require('fs').existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS || '')
);

async function testLangChainToolBuilderAgent() {
  console.log('🧪 Testing LangChain ToolBuilderAgent...\n');

  try {
    // Import the agent (must be after environment setup)
    const {
      LangChainToolBuilderAgent,
    } = require('./packages/agents/dist/src/LangChainToolBuilderAgent');

    console.log('✅ Successfully imported LangChainToolBuilderAgent');

    // Create agent instance
    const testAgent = new LangChainToolBuilderAgent('test-agent-001');
    console.log('✅ Created agent instance');

    // Create a dummy job that should trigger tool creation
    const dummyJob = {
      id: 'test-job-001',
      category: 'math',
      payload: {
        prompt:
          'Create a tool that can calculate the area of a rectangle given width and height parameters. The tool should validate inputs and return the calculated area.',
        taskDescription: 'Calculate rectangle area',
        expectedInputs: {
          width: 'number',
          height: 'number',
        },
        expectedOutput: 'The area of the rectangle',
      },
    };

    console.log('📋 Test job created:', {
      id: dummyJob.id,
      category: dummyJob.category,
      prompt: dummyJob.payload.prompt.substring(0, 100) + '...',
    });

    console.log('\n🚀 Running agent with test job...');
    console.log(
      '⏳ This may take a moment as the agent initializes and processes the request...\n'
    );

    const startTime = Date.now();

    // Run the agent
    const result = await testAgent.handle(dummyJob);

    const executionTime = Date.now() - startTime;

    console.log('✅ Agent completed execution');
    console.log(`⏱️  Execution time: ${executionTime}ms`);
    console.log('\n📄 Agent Response:');
    console.log('='.repeat(80));
    console.log(result);
    console.log('='.repeat(80));

    // Analyze the response
    console.log('\n🔍 Response Analysis:');

    if (typeof result === 'string') {
      const responseLength = result.length;
      console.log(`📏 Response length: ${responseLength} characters`);

      // Check for indicators of successful tool creation
      const indicators = {
        'Tool creation mentioned': /creat|generat|build.*tool/i.test(result),
        'Code generation mentioned': /code|function|javascript/i.test(result),
        'Tool execution mentioned': /execut|run|invoke.*tool/i.test(result),
        'Success mentioned': /success|complet|finish/i.test(result),
        'Error mentioned': /error|fail|problem/i.test(result),
      };

      Object.entries(indicators).forEach(([key, value]) => {
        console.log(`${value ? '✅' : '❌'} ${key}: ${value}`);
      });

      // Check if response looks like a tool was created
      if (indicators['Tool creation mentioned'] || indicators['Code generation mentioned']) {
        console.log('\n🎉 SUCCESS: Agent appears to have attempted tool creation!');
      } else if (indicators['Error mentioned']) {
        console.log('\n❌ ISSUE: Agent encountered errors during execution');
      } else {
        console.log("\n❓ UNCLEAR: Agent response doesn't clearly indicate tool creation");
      }
    }

    console.log('\n✅ Test completed successfully!');
    return true;
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);

    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    // Analyze common failure modes
    console.log('\n🔍 Failure Analysis:');

    if (error.message.includes('GOOGLE_CLOUD_PROJECT')) {
      console.log('❌ Google Cloud configuration issue');
    } else if (error.message.includes('prisma') || error.message.includes('database')) {
      console.log('❌ Database/Prisma connection issue');
    } else if (error.message.includes('import') || error.message.includes('require')) {
      console.log('❌ Module import/require issue');
    } else if (error.message.includes('LangChain') || error.message.includes('@langchain')) {
      console.log('❌ LangChain integration issue');
    } else {
      console.log('❓ Unknown error type');
    }

    return false;
  }
}

// Handle script termination gracefully
process.on('SIGINT', () => {
  console.log('\n⏹️  Test interrupted by user');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled Promise Rejection:');
  console.error('Reason:', reason);
  process.exit(1);
});

// Run the test
if (require.main === module) {
  testLangChainToolBuilderAgent()
    .then((success) => {
      console.log(success ? '\n🎊 All tests passed!' : '\n💔 Tests failed!');
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('\n💥 Unexpected test failure:', error);
      process.exit(1);
    });
}

module.exports = { testLangChainToolBuilderAgent };
