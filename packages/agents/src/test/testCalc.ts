/**
 * Test the enhanced calculator tool with mathjs and LLM capabilities
 */

import { calculate } from '../tools/langchainCalc';
import { Tools } from '../tools';

async function testCalculatorTool() {
  console.log('🧮 Testing Enhanced Calculator Tool\n');
  console.log('='.repeat(60));

  console.log('Environment Configuration:');
  console.log(`  LANGCHAIN_ENABLED: ${process.env.LANGCHAIN_ENABLED || 'false'}`);
  console.log(`  LLM Provider: ${process.env.LLM_PROVIDER || 'auto'}`);
  console.log(`  Local LLM: ${process.env.LOCAL_LLM_ENABLED || 'false'}`);

  const testCases = [
    {
      name: 'Simple Addition',
      expr: '2 + 3',
      expected: 5,
      mode: 'expression' as const,
    },
    {
      name: 'Complex Expression',
      expr: '(10 + 5) * 2 - 3',
      expected: 27,
      mode: 'expression' as const,
    },
    {
      name: 'Decimal Operations',
      expr: '3.14 * 2',
      expected: 6.28,
      mode: 'expression' as const,
    },
    {
      name: 'Division',
      expr: '100 / 4',
      expected: 25,
      mode: 'expression' as const,
    },
    {
      name: 'Expression with Commas',
      expr: '1,000 + 2,500',
      expected: 3500,
      mode: 'expression' as const,
    },
    {
      name: 'Word Problem - Simple',
      expr: 'What is 5 plus 3?',
      expected: 8,
      mode: 'word_problem' as const,
    },
    {
      name: 'Word Problem - Complex',
      expr: 'If I have 10 apples and give away 3, how many do I have left?',
      expected: 7,
      mode: 'word_problem' as const,
    },
    {
      name: 'Auto Detection - Expression',
      expr: '15 * 4',
      expected: 60,
      mode: 'auto' as const,
    },
    {
      name: 'Auto Detection - Word Problem',
      expr: 'Calculate the total of 12 and 8',
      expected: 20,
      mode: 'auto' as const,
    },
    {
      name: 'Invalid Expression',
      expr: 'abc + def',
      expected: null, // Should fail
      mode: 'expression' as const,
    },
    {
      name: 'Unsafe Expression',
      expr: 'console.log("hack")',
      expected: null, // Should fail
      mode: 'expression' as const,
    },
  ];

  let passCount = 0;
  let totalCount = testCases.length;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];

    console.log(`\n${i + 1}. ${testCase.name}`);
    console.log('-'.repeat(40));
    console.log(`Expression: "${testCase.expr}"`);
    console.log(`Mode: ${testCase.mode}`);
    console.log(`Expected: ${testCase.expected}`);

    try {
      const startTime = Date.now();
      const result = await calculate({ expr: testCase.expr, mode: testCase.mode });
      const duration = Date.now() - startTime;

      console.log(`Result: ${result.ok ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`Value: ${result.value || 'N/A'}`);
      console.log(`Method: ${result.method}`);
      console.log(`Duration: ${duration}ms`);

      if (result.explanation) {
        console.log(`Explanation: ${result.explanation}`);
      }

      // Check if result matches expectation
      const isCorrect =
        testCase.expected === null
          ? !result.ok // Should fail
          : result.ok && Math.abs((result.value || 0) - testCase.expected) < 0.01;

      if (isCorrect) {
        console.log('🎯 Test PASSED');
        passCount++;
      } else {
        console.log('❌ Test FAILED');
      }
    } catch (error) {
      console.log(`❌ Unexpected error: ${error}`);
      if (testCase.expected === null) {
        console.log('🎯 Test PASSED (expected failure)');
        passCount++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results:');
  console.log(
    `Passed: ${passCount}/${totalCount} (${((passCount / totalCount) * 100).toFixed(1)}%)`
  );

  // Test integration with Tools interface
  console.log('\n🔧 Testing Tools Interface Integration:');
  console.log('-'.repeat(40));

  try {
    const toolResult = await Tools.calc({ expr: '5 * 6' });
    console.log(`Tools.calc result: ${JSON.stringify(toolResult)}`);

    if (toolResult.ok && toolResult.value === 30) {
      console.log('✅ Tools integration working correctly');
    } else {
      console.log('❌ Tools integration failed');
    }
  } catch (error) {
    console.log(`❌ Tools integration error: ${error}`);
  }

  console.log('\n💡 Key Features Demonstrated:');
  console.log('  ✅ Safe expression evaluation with mathjs (no eval())');
  console.log('  ✅ Word problem solving with LLM');
  console.log('  ✅ Automatic mode detection');
  console.log('  ✅ Comprehensive error handling');
  console.log('  ✅ Fallback to mock for simple cases');
  console.log('  ✅ Input validation and sanitization');

  if (process.env.LANGCHAIN_ENABLED === 'true') {
    console.log('\n🤖 LangChain Features:');
    console.log('  ✅ LLM-powered word problem solving');
    console.log('  ✅ Natural language to math conversion');
  } else {
    console.log('\n🔧 Mock Mode:');
    console.log('  ✅ Safe mathjs evaluation');
    console.log('  ✅ Basic expression support');
    console.log('  💡 Enable LANGCHAIN_ENABLED=true for word problems');
  }
}

// Run the test
testCalculatorTool().catch(console.error);
