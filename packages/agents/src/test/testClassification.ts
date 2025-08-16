/**
 * Test the LangChain classification tool
 * Run with: npx tsx src/test/testClassification.ts
 */

import { classify, ClassificationTool } from '../tools/langchainClassification';

const testCases = [
  {
    name: 'Technology Classification',
    text: 'Kubernetes is a container orchestration platform that automates deployment and scaling',
    labels: ['Technology', 'Business', 'Science', 'Health'],
  },
  {
    name: 'Business Classification',
    text: 'The quarterly earnings report showed a 15% increase in revenue year-over-year',
    labels: ['Technology', 'Business', 'Science', 'Health'],
  },
  {
    name: 'Database Classification',
    text: 'Milvus is a scalable vector database supporting sharding and replication',
    labels: ['DB', 'Not-DB', 'Unknown'],
  },
  {
    name: 'Multi-option Classification',
    text: 'Machine learning models require careful training and validation',
    labels: ['AI/ML', 'Data Science', 'Software Engineering', 'DevOps', 'Other'],
  },
];

async function testClassification() {
  console.log('Testing LangChain Classification Tool\n');
  console.log('='.repeat(50));

  // Test 1: Mock classification (LLM disabled)
  console.log('\nTest 1: Mock Classification (fallback behavior)');
  console.log('-'.repeat(50));

  for (const test of testCases) {
    console.log(`\n📝 ${test.name}`);
    console.log(`Text: "${test.text}"`);
    console.log(`Labels: [${test.labels.join(', ')}]`);

    const result = await classify({
      text: test.text,
      labels: test.labels,
      useLLM: false, // Force mock
    });

    console.log(`Result: "${result.label}" (${result.method})`);
  }

  // Test 2: LLM classification (if available)
  console.log('\n\nTest 2: LLM Classification (real classification)');
  console.log('-'.repeat(50));
  console.log('Note: This will use your configured LLM (local or vertex)\n');

  const useLLM = process.env.LOCAL_LLM_ENABLED === '1' || !!process.env.GOOGLE_CLOUD_PROJECT;

  if (!useLLM) {
    console.log(
      '⚠️  No LLM configured. Set LOCAL_LLM_ENABLED=1 or configure Vertex AI to test LLM classification.'
    );
  } else {
    for (const test of testCases) {
      console.log(`\n📝 ${test.name}`);
      console.log(`Text: "${test.text}"`);
      console.log(`Labels: [${test.labels.join(', ')}]`);

      try {
        // Test simple classification
        const result = await classify({
          text: test.text,
          labels: test.labels,
          useLLM: true,
        });

        console.log(`Simple Result: "${result.label}" (${result.method})`);

        // Test with confidence and reasoning
        const detailedResult = await classify({
          text: test.text,
          labels: test.labels,
          withConfidence: true,
          useLLM: true,
        });

        console.log(`Detailed Result:`);
        console.log(`  Label: ${detailedResult.label}`);
        if (detailedResult.confidence !== undefined) {
          console.log(`  Confidence: ${(detailedResult.confidence * 100).toFixed(1)}%`);
        }
        if (detailedResult.reasoning) {
          console.log(`  Reasoning: ${detailedResult.reasoning}`);
        }
      } catch (error) {
        console.error('❌ Error:', error);
      }
    }
  }

  // Test 3: Tool wrapper interface
  console.log('\n\nTest 3: ClassificationTool Class (for agent integration)');
  console.log('-'.repeat(50));

  const tool = new ClassificationTool('test-agent', false); // Use mock for quick test
  const testCase = testCases[0];

  console.log(`\nTesting tool.run() method:`);
  const label1 = await tool.run(testCase.text, testCase.labels);
  console.log(`Result: "${label1}"`);

  console.log(`\nTesting tool.call() method (stringKit compatibility):`);
  const result2 = await tool.call({ text: testCase.text, labels: testCase.labels });
  console.log(`Result: { label: "${result2.label}" }`);

  console.log(`\nTesting tool.classifyWithOptions() method:`);
  const result3 = await tool.classifyWithOptions({
    text: testCase.text,
    labels: testCase.labels,
    withConfidence: false,
    useLLM: false,
  });
  console.log(`Result:`, result3);

  console.log('\n' + '='.repeat(50));
  console.log('✅ All tests completed!');
}

// Run tests
testClassification().catch(console.error);
