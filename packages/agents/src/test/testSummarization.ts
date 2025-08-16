/**
 * Test the LangChain summarization tool
 * Run with: npx tsx src/test/testSummarization.ts
 */

import { summarize, SummarizationTool } from '../tools/langchainSummarization';

const testTexts = [
  {
    name: 'RAG Description',
    text: 'RAG (Retrieval-Augmented Generation) is a technique that combines information retrieval with text generation. It fetches relevant documents from a knowledge base to ground the language model responses in factual information, reducing hallucinations and improving accuracy.',
    maxWords: 12,
  },
  {
    name: 'Cloud Migration',
    text: 'Cloud migration involves moving data, applications, and IT processes from on-premises infrastructure to cloud-based services. Organizations pursue cloud migration to achieve better scalability, reduce operational costs, improve disaster recovery capabilities, and enable remote work. The process requires careful planning, security considerations, and often a phased approach.',
    maxWords: 15,
  },
  {
    name: 'Short Text (should use mock)',
    text: 'This is a very short text.',
    maxWords: 10,
  },
];

async function testSummarization() {
  console.log('Testing LangChain Summarization Tool\n');
  console.log('='.repeat(50));

  // Test 1: Mock summarization (LLM disabled)
  console.log('\nTest 1: Mock Summarization (fallback behavior)');
  console.log('-'.repeat(50));

  for (const test of testTexts) {
    console.log(`\n📝 ${test.name}`);
    console.log(`Original (${test.text.split(/\s+/).length} words): "${test.text}"`);

    const result = await summarize({
      text: test.text,
      maxWords: test.maxWords,
      useLLM: false, // Force mock
    });

    console.log(`Summary (${result.summaryLength}/${test.maxWords} words): "${result.summary}"`);
    console.log(
      `Method: ${result.method}, Compression: ${(result.compressionRatio * 100).toFixed(1)}%`
    );
  }

  // Test 2: LLM summarization (if available)
  console.log('\n\nTest 2: LLM Summarization (real summarization)');
  console.log('-'.repeat(50));
  console.log('Note: This will use your configured LLM (local or vertex)\n');

  const useLLM = process.env.LOCAL_LLM_ENABLED === '1' || !!process.env.GOOGLE_CLOUD_PROJECT;

  if (!useLLM) {
    console.log(
      '⚠️  No LLM configured. Set LOCAL_LLM_ENABLED=1 or configure Vertex AI to test LLM summarization.'
    );
  } else {
    for (const test of testTexts) {
      console.log(`\n📝 ${test.name}`);
      console.log(`Original (${test.text.split(/\s+/).length} words): "${test.text}"`);

      try {
        const result = await summarize({
          text: test.text,
          maxWords: test.maxWords,
          useLLM: true,
          style: 'concise',
        });

        console.log(
          `Summary (${result.summaryLength}/${test.maxWords} words): "${result.summary}"`
        );
        console.log(
          `Method: ${result.method}, Compression: ${(result.compressionRatio * 100).toFixed(1)}%`
        );
      } catch (error) {
        console.error('❌ Error:', error);
      }
    }
  }

  // Test 3: Tool wrapper interface
  console.log('\n\nTest 3: SummarizationTool Class (for agent integration)');
  console.log('-'.repeat(50));

  const tool = new SummarizationTool('test-agent', false); // Use mock for quick test
  const testText = testTexts[0];

  console.log(`\nTesting tool.run() method:`);
  const summary1 = await tool.run(testText.text, testText.maxWords);
  console.log(`Result: "${summary1}"`);

  console.log(`\nTesting tool.call() method (stringKit compatibility):`);
  const result2 = await tool.call({ text: testText.text, maxWords: testText.maxWords });
  console.log(`Result: { text: "${result2.text}" }`);

  console.log('\n' + '='.repeat(50));
  console.log('✅ All tests completed!');
}

// Run tests
testSummarization().catch(console.error);
