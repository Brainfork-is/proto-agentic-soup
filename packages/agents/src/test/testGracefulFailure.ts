/**
 * Test graceful failure behavior when LLM is enabled but fails
 * This simulates real-world LLM failures and verifies the system handles them properly
 */

import { SimpleAgent } from '../index';
import { JobData } from '@soup/common';

async function testGracefulFailures() {
  console.log('Testing Graceful Failure Behavior\n');
  console.log('='.repeat(60));

  console.log('This test simulates LLM failures to verify graceful error handling.');
  console.log(
    'When LangChain is enabled but LLM fails, tools should return empty/default results.'
  );
  console.log('When LangChain is disabled, tools should use mock behavior.\n');

  // Create test agent
  const agent = new SimpleAgent('failure-test-agent', 0.5, ['stringKit']);

  console.log('Configuration:');
  console.log(`  LangChain Enabled: ${process.env.LANGCHAIN_ENABLED || 'false'}`);
  console.log(`  LLM Provider: ${process.env.LLM_PROVIDER || 'auto'}`);
  console.log(`  Local LLM Enabled: ${process.env.LOCAL_LLM_ENABLED || 'false'}`);

  const testJobs: { name: string; job: JobData; expectation: string }[] = [
    {
      name: 'Summarization with LLM Failure',
      job: {
        category: 'summarize',
        payload: {
          text: 'This is a test document that needs to be summarized. It contains multiple sentences with various information that should be condensed into a shorter format for easier consumption.',
          maxWords: 8,
        },
        deadlineS: 60,
        payout: 5,
      },
      expectation: 'Should either work with LLM or use mock truncation',
    },
    {
      name: 'Classification with LLM Failure',
      job: {
        category: 'classify',
        payload: {
          text: 'Docker is a containerization platform that enables developers to package applications',
          labels: ['Technology', 'Business', 'Science', 'Sports'],
          answer: 'Technology',
        },
        deadlineS: 60,
        payout: 5,
      },
      expectation: 'Should either classify correctly or return first label gracefully',
    },
  ];

  let successCount = 0;

  for (let i = 0; i < testJobs.length; i++) {
    const { name, job, expectation } = testJobs[i];

    console.log(`\n\nTest ${i + 1}: ${name}`);
    console.log('-'.repeat(60));
    console.log(`Expectation: ${expectation}`);
    console.log(`Job:`, JSON.stringify(job, null, 2));

    try {
      const startTime = Date.now();
      const result = await agent.handle(job);
      const duration = Date.now() - startTime;

      console.log(`\nResult (${duration}ms):`);
      console.log(`  Success: ${result.ok ? '✅ YES' : '❌ NO'}`);
      console.log(`  Artifact: "${result.artifact}"`);
      console.log(`  Steps Used: ${result.stepsUsed || 0}`);

      // Analyze the result
      if (result.ok) {
        successCount++;

        if (job.category === 'summarize') {
          const isEmpty = !result.artifact || result.artifact.trim() === '';
          if (isEmpty) {
            console.log(`  Analysis: ⚠️  LLM failed gracefully (empty result)`);
          } else {
            const originalWords = job.payload.text.split(/\s+/).length;
            const summaryWords = result.artifact.split(/\s+/).length;
            console.log(
              `  Analysis: ✅ Summarization worked (${originalWords} → ${summaryWords} words)`
            );
          }
        } else if (job.category === 'classify') {
          const isValidLabel = job.payload.labels.includes(result.artifact);
          const isFirstLabel = result.artifact === job.payload.labels[0];

          if (isValidLabel) {
            console.log(`  Analysis: ✅ Classification worked - "${result.artifact}" is valid`);
            if (isFirstLabel) {
              console.log(`  Note: Returned first label (possible graceful failure)`);
            }
          } else {
            console.log(`  Analysis: ⚠️  Invalid label returned: "${result.artifact}"`);
          }
        }
      } else {
        console.log(`  Analysis: ❌ Job failed completely`);
      }
    } catch (error) {
      console.error(`❌ Unexpected error: ${error}`);
      console.log(`  This indicates a non-graceful failure`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`  Jobs Completed: ${successCount}/${testJobs.length}`);
  console.log(`  Success Rate: ${((successCount / testJobs.length) * 100).toFixed(1)}%`);

  if (process.env.LANGCHAIN_ENABLED === 'true') {
    console.log('  Mode: 🤖 LangChain Enabled');
    if (process.env.LOCAL_LLM_ENABLED === '1') {
      console.log('  Expected: LLM processing or graceful failures');
    } else {
      console.log('  Expected: Graceful failures (no LLM configured)');
    }
  } else {
    console.log('  Mode: 🔧 Mock Processing');
    console.log('  Expected: 100% success with mock implementations');
  }

  console.log('\n💡 Key Points:');
  console.log('  - Empty summaries indicate LLM failure + graceful handling');
  console.log('  - First label classification may indicate graceful failure');
  console.log('  - No exceptions thrown = graceful failure behavior working');

  console.log('\n🔧 To test with different configurations:');
  console.log('  Mock mode: LANGCHAIN_ENABLED=false npm run test');
  console.log('  LangChain mode: LANGCHAIN_ENABLED=true LOCAL_LLM_ENABLED=1 npm run test');
}

// Run the test
testGracefulFailures().catch(console.error);
