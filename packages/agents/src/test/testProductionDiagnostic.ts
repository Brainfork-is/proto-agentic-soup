/**
 * Production diagnostic test to identify why summarization jobs are failing
 * This helps debug the "Task failed - no successful steps" issue
 */

import { SimpleAgent } from '../index';
import { Tools } from '../tools';
import { JobData } from '@soup/common';

async function diagnoseProductionIssue() {
  console.log('🔍 Production Environment Diagnostic\n');
  console.log('='.repeat(60));

  // Check environment configuration
  console.log('📋 Environment Configuration:');
  console.log(`  LANGCHAIN_ENABLED: ${process.env.LANGCHAIN_ENABLED || 'not set'}`);
  console.log(`  LANGCHAIN_SUMMARIZATION: ${process.env.LANGCHAIN_SUMMARIZATION || 'not set'}`);
  console.log(`  LANGCHAIN_CLASSIFICATION: ${process.env.LANGCHAIN_CLASSIFICATION || 'not set'}`);
  console.log(`  LLM_PROVIDER: ${process.env.LLM_PROVIDER || 'not set'}`);
  console.log(`  LOCAL_LLM_ENABLED: ${process.env.LOCAL_LLM_ENABLED || 'not set'}`);
  console.log(`  LOCAL_MODEL_PATH: ${process.env.LOCAL_MODEL_PATH || 'not set'}`);

  // Test the exact job that was failing
  const failingJob: JobData = {
    category: 'summarize',
    payload: {
      text: 'The latest advancement in natural language processing (NLP) enables computers to understand human emotions through text analysis, revolutionizing customer service and mental health applications.',
      maxWords: 12,
    },
    deadlineS: 60,
    payout: 10,
  };

  console.log('\n🧪 Direct Tool Testing:');
  console.log('-'.repeat(30));
  console.log('Testing Tools.stringKit directly...');
  console.log(`Input: "${failingJob.payload.text.substring(0, 50)}..."`);
  console.log(`Max Words: ${failingJob.payload.maxWords}`);

  try {
    const directResult = await Tools.stringKit(
      {
        text: failingJob.payload.text,
        mode: 'summarize',
        maxWords: failingJob.payload.maxWords,
      },
      'diagnostic-agent'
    );

    console.log('✅ Direct tool call succeeded:');
    if ('text' in directResult && typeof directResult.text === 'string') {
      console.log(`  Result: "${directResult.text}"`);
      console.log(`  Length: ${directResult.text.split(/\s+/).length} words`);
      console.log(`  Empty: ${!directResult.text || directResult.text.trim() === ''}`);
    } else {
      console.log(`  Result: ${JSON.stringify(directResult)}`);
    }
  } catch (error) {
    console.log('❌ Direct tool call failed:');
    console.log(`  Error: ${error}`);
    console.log(`  Stack: ${(error as Error).stack}`);
  }

  console.log('\n🤖 Agent Testing:');
  console.log('-'.repeat(20));
  console.log('Testing with SimpleAgent (same as production)...');

  // Create agent with same configuration as the failing one
  const agent = new SimpleAgent('diagnostic-agent', 1.0, ['browser', 'calc']);

  try {
    const agentResult = await agent.handle(failingJob);

    console.log('Agent result:');
    console.log(`  Success: ${agentResult.ok}`);
    console.log(`  Artifact: "${agentResult.artifact}"`);
    console.log(`  Steps Used: ${agentResult.stepsUsed || 0}`);

    if ('planUsed' in agentResult) {
      console.log(`  Plan: ${agentResult.planUsed}`);
    }

    if (!agentResult.ok) {
      console.log('❌ Agent failed - this matches production behavior');
    } else if (!agentResult.artifact || agentResult.artifact.trim() === '') {
      console.log('⚠️  Agent succeeded but returned empty result');
    } else {
      console.log('✅ Agent succeeded with meaningful result');
    }
  } catch (error) {
    console.log('❌ Agent execution failed:');
    console.log(`  Error: ${error}`);
    console.log(`  Stack: ${(error as Error).stack}`);
  }

  // Test with stringKit tool enabled
  console.log('\n🔧 Testing with StringKit Tool:');
  console.log('-'.repeat(35));

  const agentWithStringKit = new SimpleAgent('diagnostic-stringkit', 1.0, ['stringKit']);

  try {
    const stringKitResult = await agentWithStringKit.handle(failingJob);

    console.log('StringKit agent result:');
    console.log(`  Success: ${stringKitResult.ok}`);
    console.log(`  Artifact: "${stringKitResult.artifact}"`);
    console.log(`  Steps Used: ${stringKitResult.stepsUsed || 0}`);

    if (!stringKitResult.ok) {
      console.log('❌ StringKit agent also failed');
    } else if (!stringKitResult.artifact || stringKitResult.artifact.trim() === '') {
      console.log('⚠️  StringKit agent succeeded but returned empty result');
    } else {
      console.log('✅ StringKit agent succeeded');
    }
  } catch (error) {
    console.log('❌ StringKit agent failed:');
    console.log(`  Error: ${error}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎯 Diagnosis Summary:');
  console.log('');

  if (process.env.LANGCHAIN_ENABLED === 'true') {
    console.log('🤖 LangChain is ENABLED in environment');
    if (!process.env.LOCAL_LLM_ENABLED && !process.env.GOOGLE_CLOUD_PROJECT) {
      console.log('⚠️  No LLM provider configured - jobs will fail gracefully');
      console.log('   Recommendation: Set LOCAL_LLM_ENABLED=1 or configure Vertex AI');
    }
  } else {
    console.log('🔧 LangChain is DISABLED - using mock behavior');
    console.log('   This should work reliably for all jobs');
  }

  console.log('\n💡 Possible Issues:');
  console.log('  1. Agent missing stringKit tool in production');
  console.log('  2. LangChain enabled but no working LLM provider');
  console.log('  3. Tool execution throwing unhandled exceptions');
  console.log('  4. Environment variables not set correctly');

  console.log('\n🔧 Recommended Actions:');
  console.log('  1. Check agent blueprints include "stringKit" tool');
  console.log('  2. Set LANGCHAIN_ENABLED=false for reliable mock behavior');
  console.log('  3. Or configure LOCAL_LLM_ENABLED=1 with working Ollama');
  console.log('  4. Review agent tool assignment in database');
}

// Run diagnostic
diagnoseProductionIssue().catch(console.error);
