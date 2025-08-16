/**
 * Basic test to verify LangChain compiles and initializes correctly
 * Run with: npx tsx src/test/testLangchainBasic.ts
 */

import { createLangChainLLM } from '../langchainProvider';
import { PromptTemplate } from '@langchain/core/prompts';

async function testBasicSetup() {
  console.log('Testing LangChain basic setup...\n');

  try {
    // Test 1: Create LLM instance
    console.log('Test 1: Creating LangChain LLM instance');
    const llm = createLangChainLLM('test-agent', 0.5);
    console.log('✓ LLM instance created');
    console.log('  Model type:', llm._modelType());
    console.log('  LLM type:', llm._llmType());
    console.log('  Config:', llm._identifying_params());
    console.log();

    // Test 2: Create prompt template
    console.log('Test 2: Creating prompt template');
    const template = 'Summarize: {text}';
    const prompt = PromptTemplate.fromTemplate(template);
    const formatted = await prompt.format({ text: 'Test text' });
    console.log('✓ Prompt template created');
    console.log('  Formatted:', formatted);
    console.log();

    // Test 3: Import math.js
    console.log('Test 3: Testing mathjs import');
    const math = await import('mathjs');
    const result = math.evaluate('2 + 2 * 3');
    console.log('✓ mathjs working');
    console.log('  2 + 2 * 3 =', result);
    console.log();

    console.log('All basic tests passed! LangChain is properly integrated.');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testBasicSetup().catch(console.error);
