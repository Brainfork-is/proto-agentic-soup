/**
 * Integration test for LangChain-enhanced agents
 * Tests the summarization capability with mock LLM behavior
 */

import { SimpleAgent } from '../index';
import { JobData } from '@soup/common';

async function testAgentWithSummarization() {
  console.log('Testing Agent with LangChain Summarization\n');
  console.log('='.repeat(50));

  // Create a test agent
  const agent = new SimpleAgent('test-agent-001', 0.5, ['stringKit']);

  // Test job 1: Summarization job
  const summarizeJob: JobData = {
    category: 'summarize',
    payload: {
      text: 'Cloud migration involves moving data, applications, and IT processes from on-premises infrastructure to cloud-based services. Organizations pursue cloud migration to achieve better scalability, reduce operational costs, improve disaster recovery capabilities, and enable remote work.',
      maxWords: 10,
    },
    deadlineS: 60,
    payout: 5,
  };

  console.log('\nTest 1: Summarization Job');
  console.log('-'.repeat(50));
  console.log('Job:', JSON.stringify(summarizeJob, null, 2));

  const result1 = await agent.handle(summarizeJob);
  console.log('\nResult:', JSON.stringify(result1, null, 2));
  console.log('✓ Summarization completed:', result1.ok ? 'SUCCESS' : 'FAILED');

  // Test job 2: Another summarization with different content
  const summarizeJob2: JobData = {
    category: 'summarize',
    payload: {
      text: 'RAG fetches documents to ground responses in facts. It combines retrieval with generation for more accurate and contextual AI responses.',
      maxWords: 8,
    },
    deadlineS: 60,
    payout: 5,
  };

  console.log('\n\nTest 2: Short Summarization Job');
  console.log('-'.repeat(50));
  console.log('Job:', JSON.stringify(summarizeJob2, null, 2));

  const result2 = await agent.handle(summarizeJob2);
  console.log('\nResult:', JSON.stringify(result2, null, 2));
  console.log('✓ Summarization completed:', result2.ok ? 'SUCCESS' : 'FAILED');

  // Test job 3: Classification (still using mock)
  const classifyJob: JobData = {
    category: 'classify',
    payload: {
      text: 'Kubernetes is a container orchestration platform',
      labels: ['Technology', 'Business', 'Science'],
      answer: 'Technology',
    },
    deadlineS: 60,
    payout: 5,
  };

  console.log('\n\nTest 3: Classification Job (mock)');
  console.log('-'.repeat(50));
  console.log('Job:', JSON.stringify(classifyJob, null, 2));

  const result3 = await agent.handle(classifyJob);
  console.log('\nResult:', JSON.stringify(result3, null, 2));
  console.log('✓ Classification completed:', result3.ok ? 'SUCCESS' : 'FAILED');

  console.log('\n' + '='.repeat(50));
  console.log('✅ Integration test completed!');
  console.log('\nNote: To test with real LLM summarization, set:');
  console.log('  LANGCHAIN_ENABLED=true');
  console.log('  LOCAL_LLM_ENABLED=1 (for Ollama)');
  console.log('  or configure Vertex AI credentials');
}

// Run the test
testAgentWithSummarization().catch(console.error);
