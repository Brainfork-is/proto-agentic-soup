/**
 * Test the actual functionality of a generated tool
 */

import { log } from '@soup/common';

async function testGeneratedTool() {
  log(`[TEST] Testing generated calculator tool...`);

  try {
    // Import the generated tool
    const toolModule = await import(
      './generated-tools/code/test-agent-001_basic_calculator_1755606278681_d190ac04.js'
    );
    const tool = toolModule.basic_calculator;

    log(`[TEST] Tool loaded: ${tool.name} - ${tool.description}`);

    // Test cases
    const testCases = [
      { operation: 'add', num1: 10, num2: 5, expected: 15 },
      { operation: 'subtract', num1: 10, num2: 3, expected: 7 },
      { operation: 'multiply', num1: 4, num2: 6, expected: 24 },
      { operation: 'divide', num1: 20, num2: 4, expected: 5 },
      { operation: 'divide', num1: 10, num2: 0, shouldFail: true }, // Division by zero
    ];

    for (const testCase of testCases) {
      log(`[TEST] Testing: ${testCase.num1} ${testCase.operation} ${testCase.num2}`);

      try {
        const result = await tool.invoke({
          operation: testCase.operation,
          num1: testCase.num1,
          num2: testCase.num2,
        });

        const parsed = JSON.parse(result);
        log(`[TEST] Result: ${JSON.stringify(parsed, null, 2)}`);

        if (testCase.shouldFail) {
          if (parsed.success === false) {
            log(`[TEST] ✅ Expected failure case passed`);
          } else {
            log(`[TEST] ❌ Expected failure but got success`);
          }
        } else {
          if (parsed.success && parsed.result === testCase.expected) {
            log(`[TEST] ✅ Test passed: ${testCase.expected}`);
          } else {
            log(`[TEST] ❌ Test failed: expected ${testCase.expected}, got ${parsed.result}`);
          }
        }
      } catch (error) {
        log(`[TEST] ❌ Tool execution error: ${error.message}`);
      }

      log('---');
    }
  } catch (error) {
    log(`[TEST] ❌ Failed to load or test generated tool: ${error.message}`);
  }
}

testGeneratedTool();
