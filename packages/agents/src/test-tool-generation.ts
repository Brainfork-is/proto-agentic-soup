/**
 * Isolated Test for Tool Generation
 * Tests the complete tool creation pipeline end-to-end
 */

import { CodeGeneratorTool, codeGeneratorTool } from './tools/codeGenerator';
import { log, logError } from '@soup/common';

interface TestCase {
  name: string;
  taskDescription: string;
  toolName: string;
  expectedInputs: Record<string, string>;
  expectedOutput: string;
  agentId?: string;
}

const testCases: TestCase[] = [
  {
    name: 'Simple Calculator Tool',
    taskDescription:
      'Create a calculator tool that can add, subtract, multiply, and divide two numbers',
    toolName: 'basic_calculator',
    expectedInputs: {
      operation: 'string (add, subtract, multiply, divide)',
      num1: 'number',
      num2: 'number',
    },
    expectedOutput: 'JSON object with result and operation performed',
    agentId: 'test-agent-001',
  },
  {
    name: 'Text Formatter Tool',
    taskDescription:
      'Create a text formatting tool that can uppercase, lowercase, and capitalize text',
    toolName: 'text_formatter',
    expectedInputs: {
      text: 'string',
      operation: 'string (upper, lower, capitalize)',
    },
    expectedOutput: 'JSON object with formatted text',
    agentId: 'test-agent-002',
  },
];

async function testDirectCodeGeneratorTool(testCase: TestCase): Promise<void> {
  log(`\n=== Testing Direct CodeGeneratorTool: ${testCase.name} ===`);

  try {
    const generator = new CodeGeneratorTool();
    const result = await generator.invoke(testCase);

    log(`[TEST] Direct tool generation result: ${result.substring(0, 500)}...`);

    const parsed = JSON.parse(result);
    if (parsed.success) {
      log(`[TEST] ✅ Direct test PASSED for ${testCase.name}`);
      log(`[TEST] Tool created: ${parsed.toolName} at ${parsed.filePath}`);
    } else {
      log(`[TEST] ❌ Direct test FAILED for ${testCase.name}: ${parsed.error}`);
    }
  } catch (error) {
    logError(`[TEST] Direct test ERROR for ${testCase.name}:`, error);
  }
}

async function testLangChainDynamicTool(testCase: TestCase): Promise<void> {
  log(`\n=== Testing LangChain DynamicTool: ${testCase.name} ===`);

  try {
    const input = JSON.stringify(testCase);
    log(`[TEST] Calling DynamicTool with input: ${input}`);

    const result = await codeGeneratorTool.func(input);
    log(`[TEST] DynamicTool result: ${result.substring(0, 500)}...`);

    const parsed = JSON.parse(result);
    if (parsed.success) {
      log(`[TEST] ✅ DynamicTool test PASSED for ${testCase.name}`);
      log(`[TEST] Tool created: ${parsed.toolName} at ${parsed.filePath}`);
    } else {
      log(`[TEST] ❌ DynamicTool test FAILED for ${testCase.name}: ${parsed.error}`);
    }
  } catch (error) {
    logError(`[TEST] DynamicTool test ERROR for ${testCase.name}:`, error);
  }
}

async function verifyFileCreation(): Promise<void> {
  log(`\n=== Verifying File Creation ===`);

  try {
    const fs = await import('fs-extra');
    const path = await import('path');

    const codeDir = path.default.join(__dirname, 'generated-tools/code');
    const manifestsDir = path.default.join(__dirname, 'generated-tools/manifests');

    // List files in code directory
    if (await fs.default.pathExists(codeDir)) {
      const codeFiles = await fs.default.readdir(codeDir);
      log(`[TEST] Code files created: ${codeFiles.length}`);
      codeFiles.forEach((file) => log(`[TEST]   - ${file}`));
    } else {
      log(`[TEST] Code directory does not exist: ${codeDir}`);
    }

    // List files in manifests directory
    if (await fs.default.pathExists(manifestsDir)) {
      const manifestFiles = await fs.default.readdir(manifestsDir);
      log(`[TEST] Manifest files created: ${manifestFiles.length}`);
      manifestFiles.forEach((file) => log(`[TEST]   - ${file}`));
    } else {
      log(`[TEST] Manifests directory does not exist: ${manifestsDir}`);
    }
  } catch (error) {
    logError(`[TEST] File verification error:`, error);
  }
}

async function runTests(): Promise<void> {
  log(`[TEST] Starting isolated tool generation tests...`);
  log(`[TEST] Test cases: ${testCases.length}`);

  // Clear any existing test files
  try {
    const fs = await import('fs-extra');
    const path = await import('path');
    const testDir = path.default.join(__dirname, 'generated-tools');
    if (await fs.default.pathExists(testDir)) {
      await fs.default.remove(testDir);
      log(`[TEST] Cleared existing test directory: ${testDir}`);
    }
  } catch (error) {
    logError(`[TEST] Error clearing test directory:`, error);
  }

  // Test first case with both methods
  const testCase = testCases[0];

  await testDirectCodeGeneratorTool(testCase);
  await testLangChainDynamicTool(testCase);
  await verifyFileCreation();

  log(`\n[TEST] Test run completed.`);
}

// Run the tests
runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logError(`[TEST] Test suite failed:`, error);
    process.exit(1);
  });
