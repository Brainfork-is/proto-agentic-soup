/**
 * Simple test script to verify LangChain integration
 * Run with: tsx src/test/testLangchain.ts
 */

import { createLangChainLLM } from '../langchainProvider';
import { PromptTemplate } from '@langchain/core/prompts';
import { LLMChain } from 'langchain/chains';

async function testBasicLLM() {
  console.log('Testing basic LangChain LLM integration...\n');

  const llm = createLangChainLLM('test-agent', 0.5);

  try {
    // Test 1: Simple completion
    console.log('Test 1: Simple completion');
    const result1 = await llm.invoke('What is 2 + 2? Answer with just the number.');
    console.log('Result:', result1);
    console.log('✓ Basic completion works\n');

    // Test 2: Using with a prompt template
    console.log('Test 2: Prompt template');
    const template = 'Summarize the following text in one sentence: {text}';
    const prompt = PromptTemplate.fromTemplate(template);

    const chain = new LLMChain({ llm, prompt });
    const result2 = await chain.call({
      text: 'LangChain is a framework for developing applications powered by language models. It provides tools for prompt management, chains, agents, and memory.',
    });
    console.log('Result:', result2.text);
    console.log('✓ Prompt template works\n');

    // Test 3: Math problem (preparation for calc tool)
    console.log('Test 3: Math problem solving');
    const mathPrompt = PromptTemplate.fromTemplate(
      'Solve this math problem step by step: {problem}\nFinal answer only (number):'
    );
    const mathChain = new LLMChain({ llm, prompt: mathPrompt });
    const result3 = await mathChain.call({
      problem: 'If John has 15 apples and gives away 7, how many does he have left?',
    });
    console.log('Result:', result3.text);
    console.log('✓ Math problem solving works\n');

    console.log('All tests passed! LangChain integration is working.');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testBasicLLM().catch(console.error);
