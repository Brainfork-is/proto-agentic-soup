/**
 * Test script to demonstrate LLM performance optimizations
 */

import { llmProvider } from '../llmProvider';

async function testLLMPerformance() {
  console.log('=== LLM Performance Test ===');

  // Test concurrent requests with rate limiting
  console.log('\n1. Testing concurrent request handling...');

  const requests = [];
  for (let i = 0; i < 10; i++) {
    requests.push(
      llmProvider.generateContent(
        {
          prompt: `Test request ${i + 1}: What is 2 + 2?`,
          temperature: 0.1,
          maxTokens: 50,
        },
        `test-agent-${i}`
      )
    );
  }

  console.log(`Started ${requests.length} concurrent requests...`);

  const startTime = Date.now();
  const results = await Promise.all(requests);
  const endTime = Date.now();

  const successful = results.filter((r) => r !== null).length;
  const failed = results.length - successful;

  console.log(`\nResults after ${endTime - startTime}ms:`);
  console.log(`- Successful: ${successful}`);
  console.log(`- Failed/Queued: ${failed}`);

  // Show current stats
  console.log('\n2. Current LLM Provider Stats:');
  const stats = llmProvider.getStats();
  console.log(JSON.stringify(stats, null, 2));

  // Test queue behavior
  console.log('\n3. Testing queue overflow protection...');
  const overflowRequests = [];
  for (let i = 0; i < 60; i++) {
    // More than max queue size
    overflowRequests.push(
      llmProvider.generateContent(
        {
          prompt: `Overflow test ${i + 1}`,
          temperature: 0.1,
          maxTokens: 10,
        },
        `overflow-agent-${i}`
      )
    );
  }

  const overflowResults = await Promise.all(overflowRequests);
  const overflowSuccessful = overflowResults.filter((r) => r !== null).length;
  const overflowRejected = overflowResults.length - overflowSuccessful;

  console.log(`Overflow test: ${overflowSuccessful} successful, ${overflowRejected} rejected`);

  // Final stats
  console.log('\n4. Final Stats:');
  const finalStats = llmProvider.getStats();
  console.log(`Queue size: ${finalStats.queue?.queueSize || 0}`);
  console.log(`Active requests: ${finalStats.queue?.activeRequests || 0}`);
  console.log(`Circuit breaker open: ${finalStats.circuitBreaker?.isOpen || false}`);
  console.log(`Total failures: ${finalStats.circuitBreaker?.totalFailures || 0}`);

  console.log('\n=== Test Complete ===');
}

export { testLLMPerformance };
