/**
 * Test enhanced tool-building capabilities with npm packages and web research
 */

import { ToolBuilderAgent } from './ToolBuilderAgent';
import { logError } from '@soup/common';

async function testEnhancedToolBuilder() {
  try {
    console.log('\n🧪 Testing Enhanced Tool Builder Capabilities...\n');

    const agent = new ToolBuilderAgent('test-agent-enhanced');

    // Test 1: Web Research Tool
    console.log('📡 Test 1: Creating a web research tool...');
    const webResearchJob = {
      id: 'test-web-research',
      payload: {
        prompt:
          'Create a tool that researches the latest news about artificial intelligence from the web and returns a summary',
      },
      category: 'web_research' as const,
      createdAt: new Date(),
      payout: 100,
      deadlineS: 300,
    };

    const webResult = await agent.handle(webResearchJob);
    console.log('Web Research Result:', JSON.stringify(webResult, null, 2));

    // Test 2: Data Processing with npm packages
    console.log('\n📦 Test 2: Creating a tool that uses npm packages...');
    const dataProcessingJob = {
      id: 'test-npm-packages',
      payload: {
        prompt:
          'Create a tool that fetches weather data from a public API using axios and formats dates using date-fns',
      },
      category: 'web_research' as const,
      createdAt: new Date(),
      payout: 100,
      deadlineS: 300,
    };

    const npmResult = await agent.handle(dataProcessingJob);
    console.log('NPM Packages Result:', JSON.stringify(npmResult, null, 2));

    // Test 3: HTML parsing tool
    console.log('\n🌐 Test 3: Creating an HTML parsing tool...');
    const htmlParsingJob = {
      id: 'test-html-parsing',
      payload: {
        prompt: 'Create a tool that fetches a webpage and extracts all links using cheerio',
      },
      category: 'web_research' as const,
      createdAt: new Date(),
      payout: 100,
      deadlineS: 300,
    };

    const htmlResult = await agent.handle(htmlParsingJob);
    console.log('HTML Parsing Result:', JSON.stringify(htmlResult, null, 2));

    // Test 4: Comprehensive data analysis tool
    console.log('\n📊 Test 4: Creating a comprehensive data analysis tool...');
    const analysisJob = {
      id: 'test-data-analysis',
      payload: {
        prompt:
          'Create a tool that researches cryptocurrency prices from CoinGecko API, processes the data with lodash, and formats timestamps with moment.js',
      },
      category: 'web_research' as const,
      createdAt: new Date(),
      payout: 100,
      deadlineS: 300,
    };

    const analysisResult = await agent.handle(analysisJob);
    console.log('Data Analysis Result:', JSON.stringify(analysisResult, null, 2));

    console.log('\n✅ Enhanced tool builder testing completed!');
    console.log('\nAgent Stats:', agent.getStats());
  } catch (error) {
    logError('Test failed:', error);
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testEnhancedToolBuilder().catch(console.error);
}

export { testEnhancedToolBuilder };
