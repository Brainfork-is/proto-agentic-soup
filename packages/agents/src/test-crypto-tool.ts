/**
 * Test the generated crypto price research tool directly
 */

import { executeToolInSandbox } from './tools/toolExecutionEnv';

async function testCryptoTool() {
  try {
    console.log('🪙 Testing the crypto price research tool...\n');

    // Read the generated tool code
    const fs = await import('fs-extra');
    const path = await import('path');

    const toolFile = path.default.join(
      __dirname,
      'generated-tools/code/test-agent-enhanced_crypto_price_research_1758536688082_56277eaa.js'
    );

    if (!(await fs.default.pathExists(toolFile))) {
      console.log('❌ Tool file not found. Run the main test first to generate tools.');
      return;
    }

    const toolCode = await fs.default.readFile(toolFile, 'utf-8');
    console.log('📄 Tool code loaded successfully');

    // Test with Bitcoin
    console.log('📡 Testing with Bitcoin...');
    const result = await executeToolInSandbox(toolCode, 'crypto_price_research', {
      cryptoId: 'bitcoin',
    });

    console.log('✅ Bitcoin result:', result);

    // Test with Ethereum
    console.log('\n📡 Testing with Ethereum...');
    const ethResult = await executeToolInSandbox(toolCode, 'crypto_price_research', {
      cryptoId: 'ethereum',
    });

    console.log('✅ Ethereum result:', ethResult);
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCryptoTool().catch(console.error);
}

export { testCryptoTool };
