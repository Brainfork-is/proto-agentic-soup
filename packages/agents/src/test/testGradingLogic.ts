/**
 * Test the grading logic to understand the production bug
 */

import path from 'path';

// We need to import the grading function from soup-runner
// Let's create a simple test to verify our fix
async function testGradingBehavior() {
  console.log('🧪 Testing Grading Logic Behavior\n');
  console.log('='.repeat(60));

  // Simulate the scenarios we discovered
  const testCases = [
    {
      name: 'Agent Failure Message',
      category: 'summarize' as const,
      payload: { text: 'Sample text', maxWords: 12 },
      agentResult: { ok: false, artifact: 'Task failed - no successful steps' },
      expected: 'Should be marked as FAILED',
    },
    {
      name: 'Empty LLM Result',
      category: 'summarize' as const,
      payload: { text: 'Sample text', maxWords: 12 },
      agentResult: { ok: true, artifact: '' },
      expected: 'Should be marked as FAILED (empty result)',
    },
    {
      name: 'Valid Summary',
      category: 'summarize' as const,
      payload: {
        text: 'This is a longer text that needs summarization for testing purposes',
        maxWords: 5,
      },
      agentResult: { ok: true, artifact: 'Valid short summary' },
      expected: 'Should be marked as SUCCESS',
    },
  ];

  console.log('Test Cases:');
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`\n${i + 1}. ${testCase.name}:`);
    console.log(`   Agent Success: ${testCase.agentResult.ok}`);
    console.log(`   Artifact: "${testCase.agentResult.artifact}"`);
    console.log(`   Expected: ${testCase.expected}`);

    // Simulate the old buggy logic (grade only)
    const artifactLength = testCase.agentResult.artifact.length;
    const wordCount = testCase.agentResult.artifact.split(/\s+/).length;
    const oldLogicWouldPass = artifactLength >= 10 && wordCount <= 18;

    // Simulate the new fixed logic (agent success AND grade)
    const newLogicWouldPass = testCase.agentResult.ok && oldLogicWouldPass;

    console.log(`   Old Logic (grade only): ${oldLogicWouldPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   New Logic (agent + grade): ${newLogicWouldPass ? '✅ PASS' : '❌ FAIL'}`);

    if (testCase.name === 'Agent Failure Message') {
      console.log(
        `   🐛 Bug: Old logic incorrectly passes "${testCase.agentResult.artifact}" (${artifactLength} chars)`
      );
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎯 Key Finding:');
  console.log('   The old grading logic only checked artifact quality,');
  console.log('   not whether the agent actually succeeded.');
  console.log('   This caused "Task failed - no successful steps" to be');
  console.log('   marked as SUCCESS because it met length criteria.');
  console.log('');
  console.log('🔧 Fix:');
  console.log('   New logic: job_success = agent_success AND grade_success');
  console.log('   This ensures failed agents never mark jobs as completed.');
}

testGradingBehavior().catch(console.error);
