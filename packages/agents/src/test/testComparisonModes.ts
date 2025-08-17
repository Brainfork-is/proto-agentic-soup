/**
 * Comparison test showing the difference between modes
 */

import { summarize } from '../tools/langchainSummarization';
import { classify } from '../tools/langchainClassification';

async function compareLanguageModes() {
  console.log('🔍 Comparison: Mock vs LangChain vs Graceful Failure\n');
  console.log('='.repeat(60));

  const testText =
    'Machine learning models require extensive training data and careful validation to achieve good performance.';
  const testLabels = ['AI/ML', 'Software', 'Hardware', 'Business'];

  console.log('Test Data:');
  console.log(`  Text: "${testText}"`);
  console.log(`  Labels: [${testLabels.join(', ')}]`);
  console.log(`  Summary Target: 6 words\n`);

  // Test 1: Mock Mode (LLM disabled)
  console.log('1️⃣  Mock Mode (useLLM: false)');
  console.log('-'.repeat(30));

  try {
    const mockSummary = await summarize({ text: testText, maxWords: 6, useLLM: false });
    console.log(`✅ Summarization: "${mockSummary.summary}" (${mockSummary.method})`);
  } catch (error) {
    console.log(`❌ Summarization failed: ${error}`);
  }

  try {
    const mockClassification = await classify({
      text: testText,
      labels: testLabels,
      useLLM: false,
    });
    console.log(`✅ Classification: "${mockClassification.label}" (${mockClassification.method})`);
  } catch (error) {
    console.log(`❌ Classification failed: ${error}`);
  }

  // Test 2: LangChain Mode with No LLM (graceful failure)
  console.log('\n2️⃣  LangChain Mode with No LLM (graceful failure)');
  console.log('-'.repeat(50));

  try {
    const failureSummary = await summarize({ text: testText, maxWords: 6, useLLM: true });
    if (failureSummary.summary === '') {
      console.log(`⚠️  Summarization: Failed gracefully (empty result)`);
    } else {
      console.log(`✅ Summarization: "${failureSummary.summary}" (${failureSummary.method})`);
    }
  } catch (error) {
    console.log(`❌ Summarization threw error: ${(error as Error).message}`);
  }

  try {
    const failureClassification = await classify({
      text: testText,
      labels: testLabels,
      useLLM: true,
    });
    console.log(
      `⚠️  Classification: "${failureClassification.label}" (graceful failure - returned first label)`
    );
  } catch (error) {
    console.log(`❌ Classification threw error: ${(error as Error).message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 Summary of Behavior:');
  console.log('');
  console.log('🔧 Mock Mode:');
  console.log('   ✅ Always works');
  console.log('   ✅ Predictable results');
  console.log('   ✅ Fast execution');
  console.log('   ❌ Limited intelligence');
  console.log('');
  console.log('🤖 LangChain Mode (with working LLM):');
  console.log('   ✅ Intelligent processing');
  console.log('   ✅ High-quality results');
  console.log('   ❌ Slower execution');
  console.log('   ❌ Requires LLM infrastructure');
  console.log('');
  console.log('⚠️  LangChain Mode (LLM failure):');
  console.log('   ✅ No exceptions thrown');
  console.log('   ✅ System continues running');
  console.log('   ⚠️  Empty/default results');
  console.log('   ✅ Clear failure indication');
  console.log('');
  console.log('🎯 Key Improvement:');
  console.log('   • Removed fallback to mock when LLM fails');
  console.log('   • LLM failures now clearly identifiable');
  console.log('   • System remains stable during outages');
  console.log('   • Real vs mock behavior is explicit');
}

compareLanguageModes().catch(console.error);
