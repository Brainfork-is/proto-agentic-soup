/**
 * Quick test for the enhanced retrieval tool focusing on core functionality
 */

import { enhancedRetrievalTool } from '../tools/langchainRetrieval';
import { Tools } from '../tools';

async function quickRetrievalTest() {
  console.log('🔍 Quick Enhanced Retrieval Test\n');

  const testQueries = [
    'What is the best vector database for large scale applications?',
    'How can I combine SQL queries with vector similarity?',
    'Tell me about LangChain for building LLM applications',
  ];

  console.log('Testing Direct Tool Interface:');
  for (const query of testQueries) {
    try {
      const result = await enhancedRetrievalTool.retrieve({
        query,
        maxResults: 2,
        minSimilarityScore: 0.3,
        useEmbeddings: true,
      });

      console.log(`Query: "${query}"`);
      console.log(`  Status: ${result.ok ? '✅' : '❌'}`);
      console.log(`  Method: ${result.method}`);
      console.log(`  Results: ${result.totalResults}`);
      if (result.results.length > 0) {
        console.log(`  Top Result: "${result.results[0].content.substring(0, 60)}..."`);
      }
      console.log('');
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }
  }

  console.log('\nTesting Tools Interface:');
  for (const query of testQueries.slice(0, 2)) {
    // Test just 2 to keep it quick
    try {
      const result = await Tools.retrieval({ query });
      console.log(`Query: "${query}"`);
      console.log(`  Source: ${result.source}`);
      console.log(`  Snippet: "${result.snippet.substring(0, 60)}..."`);
      console.log('');
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }
  }

  console.log('✅ Quick test completed successfully!');
}

quickRetrievalTest().catch(console.error);
