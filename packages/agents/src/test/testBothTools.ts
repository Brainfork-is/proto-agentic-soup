/**
 * Comprehensive test for both LangChain summarization and classification tools
 * Shows the enhanced capabilities when LangChain is enabled
 */

import { SimpleAgent } from '../index';
import { JobData } from '@soup/common';

async function testEnhancedAgent() {
  console.log('Testing Enhanced Agent with LangChain Tools\n');
  console.log('='.repeat(60));

  // Create a test agent with both tools
  const agent = new SimpleAgent('enhanced-agent-001', 0.7, ['stringKit']);

  console.log('Agent Configuration:');
  console.log(`  ID: ${agent.id}`);
  console.log(`  Temperature: ${agent.temperature}`);
  console.log(`  Tools: ${agent.tools.join(', ')}`);
  console.log(`  LangChain Enabled: ${process.env.LANGCHAIN_ENABLED || 'false'}`);
  console.log(`  LLM Provider: ${process.env.LLM_PROVIDER || 'auto'}`);

  const testJobs: { name: string; job: JobData }[] = [
    {
      name: 'Technical Summarization',
      job: {
        category: 'summarize',
        payload: {
          text: 'LangChain is a framework for developing applications powered by language models. It provides a comprehensive set of tools for building AI agents, including prompt templates, memory management, tool integration, and chain composition. The framework supports multiple language model providers and enables complex reasoning workflows.',
          maxWords: 15,
        },
        deadlineS: 60,
        payout: 8,
      },
    },
    {
      name: 'Business Document Classification',
      job: {
        category: 'classify',
        payload: {
          text: "The board of directors approved a $2.5M investment in cloud infrastructure modernization to support the company's digital transformation initiative.",
          labels: ['Technology', 'Finance', 'Operations', 'Marketing', 'Legal'],
          answer: 'Technology', // Expected answer for grading
        },
        deadlineS: 60,
        payout: 6,
      },
    },
    {
      name: 'Research Paper Categorization',
      job: {
        category: 'classify',
        payload: {
          text: 'We present a novel approach to few-shot learning using transformer architectures with attention mechanisms for improved generalization across domains.',
          labels: ['AI/ML', 'Computer Science', 'Mathematics', 'Physics', 'Biology'],
          answer: 'AI/ML',
        },
        deadlineS: 60,
        payout: 7,
      },
    },
    {
      name: 'Product Description Summary',
      job: {
        category: 'summarize',
        payload: {
          text: 'Our enterprise-grade vector database solution combines high-performance search capabilities with scalable cloud infrastructure. Built for AI applications, it supports real-time semantic search, recommendation systems, and RAG implementations with 99.9% uptime SLA.',
          maxWords: 12,
        },
        deadlineS: 60,
        payout: 5,
      },
    },
  ];

  let successCount = 0;
  let totalJobs = testJobs.length;

  for (let i = 0; i < testJobs.length; i++) {
    const { name, job } = testJobs[i];

    console.log(`\n\nTest ${i + 1}: ${name}`);
    console.log('-'.repeat(60));
    console.log(`Category: ${job.category}`);
    console.log(`Payload:`, JSON.stringify(job.payload, null, 2));

    try {
      const startTime = Date.now();
      const result = await agent.handle(job);
      const duration = Date.now() - startTime;

      console.log(`\nResult (${duration}ms):`);
      console.log(`  Success: ${result.ok ? '✅ YES' : '❌ NO'}`);
      console.log(`  Artifact: "${result.artifact}"`);
      console.log(`  Steps Used: ${result.stepsUsed || 0}`);
      if ('planUsed' in result) {
        console.log(`  Plan: ${result.planUsed || 'N/A'}`);
      }

      if ('adjustments' in result && result.adjustments && result.adjustments.length > 0) {
        console.log(`  Adjustments: ${result.adjustments.join(', ')}`);
      }

      if (result.ok) {
        successCount++;

        // Additional analysis for different job types
        if (job.category === 'summarize') {
          const originalWords = job.payload.text.split(/\s+/).length;
          const summaryWords = result.artifact.split(/\s+/).length;
          const compressionRatio = ((summaryWords / originalWords) * 100).toFixed(1);
          console.log(
            `  Compression: ${originalWords} → ${summaryWords} words (${compressionRatio}%)`
          );
        } else if (job.category === 'classify') {
          const expectedAnswer = job.payload.answer;
          const isCorrect = result.artifact === expectedAnswer;
          console.log(
            `  Expected: "${expectedAnswer}", Got: "${result.artifact}" ${isCorrect ? '✅' : '❌'}`
          );
        }
      }
    } catch (error) {
      console.error(`❌ Error processing job: ${error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Final Results:');
  console.log(
    `  Jobs Completed: ${successCount}/${totalJobs} (${((successCount / totalJobs) * 100).toFixed(1)}%)`
  );
  console.log(
    `  Tool Performance: ${successCount === totalJobs ? '🎉 Perfect!' : '⚠️  Some failures'}`
  );

  if (process.env.LANGCHAIN_ENABLED === 'true') {
    console.log('  Mode: 🤖 LangChain Enhanced (Real LLM Processing)');
  } else {
    console.log('  Mode: 🔧 Mock Processing (Set LANGCHAIN_ENABLED=true for LLM)');
  }

  console.log('\n💡 To enable real LLM processing:');
  console.log('   LANGCHAIN_ENABLED=true LOCAL_LLM_ENABLED=1 npx tsx src/test/testBothTools.ts');
}

// Run the test
testEnhancedAgent().catch(console.error);
