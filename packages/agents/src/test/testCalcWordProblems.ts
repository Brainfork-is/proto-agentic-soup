/**
 * Quick test for word problem solving with improved prompt
 */

import { calculate } from '../tools/langchainCalc';

async function testWordProblems() {
  console.log('🧮 Testing Word Problem Solving\n');

  const problems = [
    { problem: 'What is 5 plus 3?', expected: 8 },
    { problem: 'If I have 10 apples and give away 3, how many do I have left?', expected: 7 },
    { problem: 'Calculate the total of 12 and 8', expected: 20 },
  ];

  for (const test of problems) {
    console.log(`Problem: "${test.problem}"`);
    console.log(`Expected: ${test.expected}`);

    const result = await calculate({ expr: test.problem, mode: 'word_problem' });
    console.log(`Result: ${result.ok ? '✅' : '❌'} ${result.value || 'Failed'}`);
    console.log(`Method: ${result.method}`);
    console.log(`Explanation: ${result.explanation}`);
    console.log('---');
  }
}

testWordProblems().catch(console.error);
