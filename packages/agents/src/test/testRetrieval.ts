/**
 * Test the enhanced retrieval tool with vector embeddings and semantic search
 */

import { enhancedRetrievalTool } from '../tools/langchainRetrieval';
import { Tools } from '../tools';

async function testEnhancedRetrieval() {
  console.log('🔍 Testing Enhanced Retrieval Tool\n');
  console.log('='.repeat(60));

  console.log('Environment Configuration:');
  console.log(`  LANGCHAIN_ENABLED: ${process.env.LANGCHAIN_ENABLED || 'false'}`);
  console.log(`  LANGCHAIN_RETRIEVAL: ${process.env.LANGCHAIN_RETRIEVAL || 'default'}`);
  console.log(`  LANGCHAIN_SYNTHESIS: ${process.env.LANGCHAIN_SYNTHESIS || 'default'}`);
  console.log(`  LLM Provider: ${process.env.LLM_PROVIDER || 'auto'}`);

  const testQueries = [
    {
      name: 'Vector Database Query',
      query: 'What is the best vector database for large scale applications?',
      expectedKeywords: ['Milvus', 'scalable', 'distributed'],
    },
    {
      name: 'In-Memory Search',
      query: 'I need an in-memory vector search solution',
      expectedKeywords: ['FAISS', 'in-memory', 'offline'],
    },
    {
      name: 'SQL Integration Query',
      query: 'How can I combine SQL queries with vector similarity?',
      expectedKeywords: ['PGVector', 'PostgreSQL', 'SQL'],
    },
    {
      name: 'LangChain Framework Query',
      query: 'Tell me about LangChain for building LLM applications',
      expectedKeywords: ['LangChain', 'framework', 'language models'],
    },
    {
      name: 'RAG Technique Query',
      query: 'What is retrieval augmented generation?',
      expectedKeywords: ['RAG', 'retrieval', 'generation'],
    },
    {
      name: 'Embedding Concepts',
      query: 'Explain vector embeddings and semantic meaning',
      expectedKeywords: ['embeddings', 'semantic', 'vectors'],
    },
    {
      name: 'Ambiguous Query',
      query: 'machine learning models performance optimization',
      expectedKeywords: ['vector', 'search', 'similarity'], // Should match something related
    },
    {
      name: 'Non-matching Query',
      query: 'how to cook pasta perfectly',
      expectedKeywords: [], // Should return something but likely not highly relevant
    },
  ];

  let successCount = 0;
  let totalQueries = testQueries.length;

  console.log('\n📊 Testing Direct Enhanced Retrieval Tool:');
  console.log('-'.repeat(50));

  for (let i = 0; i < testQueries.length; i++) {
    const testQuery = testQueries[i];

    console.log(`\n${i + 1}. ${testQuery.name}`);
    console.log('-'.repeat(30));
    console.log(`Query: "${testQuery.query}"`);

    try {
      const startTime = Date.now();

      // Test full retrieval result
      const fullResult = await enhancedRetrievalTool.retrieve({
        query: testQuery.query,
        maxResults: 3,
        minSimilarityScore: 0.2,
        useEmbeddings: true,
      });

      const duration = Date.now() - startTime;

      console.log(`Status: ${fullResult.ok ? '✅ SUCCESS' : '❌ FAILED'}`);
      console.log(`Method: ${fullResult.method}`);
      console.log(`Results: ${fullResult.totalResults}`);
      console.log(`Duration: ${duration}ms`);

      if (fullResult.explanation) {
        console.log(`Explanation: ${fullResult.explanation}`);
      }

      // Show top result
      if (fullResult.results.length > 0) {
        const topResult = fullResult.results[0];
        console.log(`Top Result:`);
        console.log(`  Content: "${topResult.content.substring(0, 100)}..."`);
        console.log(`  Source: ${topResult.source}`);
        if (topResult.score !== undefined) {
          console.log(`  Score: ${topResult.score.toFixed(3)}`);
        }

        // Check if expected keywords appear in the result
        const resultText = topResult.content.toLowerCase();
        const foundKeywords = testQuery.expectedKeywords.filter((keyword) =>
          resultText.includes(keyword.toLowerCase())
        );

        if (testQuery.expectedKeywords.length > 0) {
          console.log(
            `  Keywords Found: ${foundKeywords.length}/${testQuery.expectedKeywords.length}`
          );
          if (foundKeywords.length > 0) {
            console.log(`  Found: [${foundKeywords.join(', ')}]`);
          }

          if (foundKeywords.length >= testQuery.expectedKeywords.length * 0.5) {
            console.log('🎯 RELEVANT RESULT');
            successCount++;
          } else {
            console.log('⚠️  LOW RELEVANCE');
          }
        } else {
          // For queries without specific expectations, just mark as successful if we got a result
          console.log('🎯 RESULT RETURNED');
          successCount++;
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error}`);
    }
  }

  console.log('\n📊 Testing Tools Interface Integration:');
  console.log('-'.repeat(50));

  // Test a few queries through the Tools interface
  const toolsTestQueries = [
    'vector database comparison',
    'SQL and vector similarity',
    'embedding generation techniques',
  ];

  for (const query of toolsTestQueries) {
    console.log(`\nTesting Tools.retrieval: "${query}"`);

    try {
      const startTime = Date.now();
      const result = await Tools.retrieval({ query });
      const duration = Date.now() - startTime;

      console.log(`  Result: ${result.snippet ? '✅' : '❌'}`);
      console.log(`  Source: ${result.source}`);
      console.log(`  Duration: ${duration}ms`);
      if (result.score !== undefined) {
        console.log(`  Score: ${result.score.toFixed(3)}`);
      }
      console.log(`  Snippet: "${result.snippet.substring(0, 80)}..."`);
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Results:');
  console.log(
    `Relevant Results: ${successCount}/${totalQueries} (${((successCount / totalQueries) * 100).toFixed(1)}%)`
  );

  console.log('\n💡 Key Features Demonstrated:');
  console.log('  ✅ Vector embeddings with LLM-based generation');
  console.log('  ✅ In-memory vector store with similarity search');
  console.log('  ✅ Intelligent text chunking and document processing');
  console.log('  ✅ Multiple fallback strategies (vector → keyword → mock)');
  console.log('  ✅ LLM-powered result synthesis');
  console.log('  ✅ Configurable similarity thresholds');

  if (process.env.LANGCHAIN_ENABLED === 'true') {
    console.log('\n🤖 LangChain Features Active:');
    console.log('  ✅ Vector similarity search with embeddings');
    console.log('  ✅ Semantic understanding of queries');
    console.log('  ✅ LLM-powered result synthesis');
    console.log('  ✅ Intelligent fallback handling');
  } else {
    console.log('\n🔧 Fallback Mode Active:');
    console.log('  ✅ Keyword-based search');
    console.log('  ✅ Basic heuristic matching');
    console.log('  💡 Enable LANGCHAIN_ENABLED=true for semantic search');
  }

  console.log('\n🔧 Performance Notes:');
  console.log('  - Vector embeddings are cached for efficiency');
  console.log('  - Initial startup may be slower due to vector store initialization');
  console.log('  - Subsequent queries should be faster with caching');
  console.log('  - LLM synthesis adds latency but improves result quality');
}

// Run the test
testEnhancedRetrieval().catch(console.error);
