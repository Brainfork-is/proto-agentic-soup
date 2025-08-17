/**
 * Enhanced retrieval tool using LangChain vector stores and semantic search
 * Supports embedding generation, semantic similarity, and intelligent text chunking
 */

import { Embeddings } from '@langchain/core/embeddings';
import { Document } from '@langchain/core/documents';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createLangChainLLM } from '../langchainProvider';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

export interface RetrievalInput {
  query: string;
  maxResults?: number;
  minSimilarityScore?: number;
  useEmbeddings?: boolean;
}

export interface RetrievalResult {
  ok: boolean;
  results: Array<{
    content: string;
    metadata?: Record<string, any>;
    score?: number;
    source: string;
  }>;
  method: 'vector_search' | 'llm_synthesis' | 'keyword_search' | 'mock';
  totalResults: number;
  explanation?: string;
}

/**
 * Simple embedding implementation using LLM to generate text representations
 * This is a fallback when proper embedding models aren't available
 */
class LLMBasedEmbeddings extends Embeddings {
  private llm: any;
  private cache: Map<string, number[]> = new Map();

  constructor(agentId: string = 'retrieval-embeddings') {
    super({});
    this.llm = createLangChainLLM(agentId, 0.1); // Low temperature for consistency
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.embedQuery(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  async embedQuery(text: string): Promise<number[]> {
    // Check cache first
    if (this.cache.has(text)) {
      return this.cache.get(text)!;
    }

    // Skip LLM generation if LangChain is disabled or if we've had multiple failures
    const skipLLM = process.env.LANGCHAIN_ENABLED !== 'true';

    if (!skipLLM) {
      try {
        // Use LLM to generate a semantic representation
        const prompt = `Analyze this text and generate 10 numerical features (0-1) representing its semantic meaning:
Text: "${text.substring(0, 500)}"

Return exactly 10 decimal numbers between 0 and 1, separated by commas, representing:
1. Technical/Scientific content level
2. Emotional/Personal content level  
3. Factual/Informational density
4. Abstract/Concrete concepts ratio
5. Positive/Negative sentiment
6. Complexity/Simplicity score
7. Action/Description orientation
8. Present/Past tense focus
9. Question/Statement nature
10. Specificity/Generality level

Format: 0.1,0.8,0.3,0.5,0.7,0.2,0.9,0.4,0.6,0.1`;

        const response = await this.llm._call(prompt, {});

        // Parse the response to extract numbers
        const numbers = response.match(/\d+\.\d+/g);
        if (numbers && numbers.length >= 10) {
          const embedding = numbers.slice(0, 10).map((n: string) => parseFloat(n));
          this.cache.set(text, embedding);
          return embedding;
        }
      } catch (error) {
        console.log('[LLMBasedEmbeddings] LLM not available, using fallback embedding generation');
        // Continue to fallback below
      }
    }

    // Fallback: generate embedding based on text characteristics
    const fallbackEmbedding = this.generateFallbackEmbedding(text);
    this.cache.set(text, fallbackEmbedding);
    return fallbackEmbedding;
  }

  private generateFallbackEmbedding(text: string): number[] {
    // Simple hash-based embedding generation as fallback
    const features = new Array(10).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    // Feature 1: Technical terms
    const techWords = ['api', 'database', 'server', 'client', 'algorithm', 'function', 'class'];
    features[0] = Math.min(1, words.filter((w) => techWords.includes(w)).length / 10);

    // Feature 2: Question indicators
    features[1] =
      text.includes('?') ||
      text.toLowerCase().includes('what') ||
      text.toLowerCase().includes('how')
        ? 0.8
        : 0.2;

    // Feature 3: Text length (normalized)
    features[2] = Math.min(1, text.length / 1000);

    // Feature 4: Uppercase ratio
    features[3] = (text.match(/[A-Z]/g) || []).length / Math.max(1, text.length);

    // Feature 5-10: Based on character and word patterns
    features[4] = Math.min(1, words.length / 50);
    features[5] = text.includes('!') ? 0.7 : 0.3;
    features[6] = (text.match(/\d/g) || []).length / Math.max(1, text.length);
    features[7] = (text.match(/[.]/g) || []).length / Math.max(1, words.length);
    features[8] = words.filter((w) => w.length > 6).length / Math.max(1, words.length);
    features[9] = Math.random() * 0.2 + 0.4; // Add some randomness to avoid identical embeddings

    return features;
  }
}

/**
 * In-memory knowledge base with default content
 */
const DEFAULT_KNOWLEDGE_BASE = [
  {
    content:
      "FAISS (Facebook AI Similarity Search) is a library for efficient similarity search and clustering of dense vectors. It's designed for large-scale vector databases and supports GPU acceleration. FAISS is particularly good for in-memory and offline similarity search applications.",
    metadata: { topic: 'vector_databases', type: 'library' },
  },
  {
    content:
      'Milvus is an open-source vector database that provides scalable similarity search. It supports distributed deployment with sharding and replication, making it suitable for production environments with high availability requirements.',
    metadata: { topic: 'vector_databases', type: 'service' },
  },
  {
    content:
      "PGVector is a PostgreSQL extension that adds vector similarity search capabilities. It's great for applications that need both traditional relational data and vector search, allowing for complex queries that join vector similarity with SQL operations.",
    metadata: { topic: 'vector_databases', type: 'extension' },
  },
  {
    content:
      'LangChain is a framework for developing applications powered by language models. It provides abstractions for working with LLMs, including prompt templates, chains, agents, and memory systems.',
    metadata: { topic: 'llm_frameworks', type: 'framework' },
  },
  {
    content:
      'Retrieval-Augmented Generation (RAG) is a technique that combines information retrieval with text generation. It retrieves relevant documents from a knowledge base and uses them as context for generating responses.',
    metadata: { topic: 'llm_techniques', type: 'pattern' },
  },
  {
    content:
      'Vector embeddings are numerical representations of text that capture semantic meaning. They enable similarity search by measuring distances between vectors in high-dimensional space.',
    metadata: { topic: 'embeddings', type: 'concept' },
  },
  {
    content:
      'Text chunking strategies include fixed-size chunking, sentence-based chunking, and semantic chunking. The choice depends on the content type and downstream tasks.',
    metadata: { topic: 'text_processing', type: 'technique' },
  },
  {
    content:
      'Agent systems combine planning, action execution, and reflection to solve complex tasks autonomously. They use tools to interact with external systems and maintain memory for context.',
    metadata: { topic: 'ai_agents', type: 'concept' },
  },
];

/**
 * Enhanced retrieval tool class
 */
export class EnhancedRetrievalTool {
  private vectorStore: MemoryVectorStore | null = null;
  private embeddings: LLMBasedEmbeddings;
  private textSplitter: RecursiveCharacterTextSplitter;
  private agentId: string;
  private isInitialized = false;

  constructor(agentId: string = 'retrieval-tool') {
    this.agentId = agentId;
    this.embeddings = new LLMBasedEmbeddings(agentId);
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
      separators: ['\n\n', '\n', '.', '!', '?', ';', ' ', ''],
    });
  }

  /**
   * Initialize the vector store with default knowledge base
   */
  private async initializeVectorStore(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('[EnhancedRetrieval] Initializing vector store...');

      // Create documents from default knowledge base
      const documents = DEFAULT_KNOWLEDGE_BASE.map(
        (item) =>
          new Document({
            pageContent: item.content,
            metadata: item.metadata,
          })
      );

      // Create vector store with embeddings
      this.vectorStore = await MemoryVectorStore.fromDocuments(documents, this.embeddings);

      this.isInitialized = true;
      console.log(
        `[EnhancedRetrieval] Vector store initialized with ${documents.length} documents`
      );
    } catch (error) {
      console.error('[EnhancedRetrieval] Failed to initialize vector store:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Add documents to the vector store
   */
  async addDocuments(texts: string[], metadatas?: Record<string, any>[]): Promise<void> {
    await this.initializeVectorStore();

    if (!this.vectorStore) {
      throw new Error('Vector store not initialized');
    }

    try {
      // Split texts into chunks
      const allChunks: Document[] = [];

      for (let i = 0; i < texts.length; i++) {
        const chunks = await this.textSplitter.splitText(texts[i]);
        const docs = chunks.map(
          (chunk) =>
            new Document({
              pageContent: chunk,
              metadata: metadatas?.[i] || { source: 'user_added', index: i },
            })
        );
        allChunks.push(...docs);
      }

      // Add to vector store
      await this.vectorStore.addDocuments(allChunks);
      console.log(`[EnhancedRetrieval] Added ${allChunks.length} document chunks to vector store`);
    } catch (error) {
      console.error('[EnhancedRetrieval] Error adding documents:', error);
      throw error;
    }
  }

  /**
   * Perform vector similarity search
   */
  private async vectorSearch(
    query: string,
    maxResults: number = 3,
    minScore: number = 0.3
  ): Promise<RetrievalResult> {
    await this.initializeVectorStore();

    if (!this.vectorStore) {
      return {
        ok: false,
        results: [],
        method: 'vector_search',
        totalResults: 0,
        explanation: 'Vector store not available',
      };
    }

    try {
      console.log(`[EnhancedRetrieval] Performing vector search for: "${query}"`);

      // Perform similarity search with scores
      const searchResults = await this.vectorStore.similaritySearchWithScore(query, maxResults);

      // Filter by minimum score and format results
      const filteredResults = searchResults
        .filter(([_, score]) => score >= minScore)
        .map(([doc, score]) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
          score: score,
          source: 'vector_search',
        }));

      return {
        ok: true,
        results: filteredResults,
        method: 'vector_search',
        totalResults: filteredResults.length,
        explanation: `Found ${filteredResults.length} relevant documents using semantic similarity`,
      };
    } catch (error) {
      console.error('[EnhancedRetrieval] Vector search error:', error);
      return {
        ok: false,
        results: [],
        method: 'vector_search',
        totalResults: 0,
        explanation: `Vector search failed: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Use LLM to synthesize information from search results
   */
  private async synthesizeResults(
    query: string,
    searchResults: RetrievalResult
  ): Promise<RetrievalResult> {
    if (!searchResults.ok || searchResults.results.length === 0) {
      return searchResults;
    }

    try {
      const llm = createLangChainLLM(this.agentId, 0.7);

      const prompt = ChatPromptTemplate.fromTemplate(`
Based on the following search results, provide a comprehensive answer to the user's query.

Query: {query}

Search Results:
{results}

Instructions:
1. Synthesize information from multiple sources when relevant
2. Highlight the most important points
3. If the results don't fully answer the query, mention what's missing
4. Keep the response focused and informative

Response:`);

      const resultsText = searchResults.results
        .map(
          (result, i) => `${i + 1}. ${result.content} (Score: ${result.score?.toFixed(2) || 'N/A'})`
        )
        .join('\n\n');

      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      const synthesis = await chain.invoke({
        query,
        results: resultsText,
      });

      // Return original results plus synthesized content
      return {
        ...searchResults,
        results: [
          {
            content: synthesis,
            metadata: { type: 'llm_synthesis', sourceCount: searchResults.results.length },
            source: 'llm_synthesis',
          },
          ...searchResults.results,
        ],
        method: 'llm_synthesis',
        explanation: `Synthesized answer from ${searchResults.results.length} sources using LLM`,
      };
    } catch (error) {
      console.error('[EnhancedRetrieval] Synthesis error:', error);
      return searchResults; // Return original results if synthesis fails
    }
  }

  /**
   * Fallback keyword search for when vector search fails
   */
  private keywordSearch(query: string, maxResults: number = 3): RetrievalResult {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const scoredResults = DEFAULT_KNOWLEDGE_BASE.map((item) => {
      const contentLower = item.content.toLowerCase();

      // Calculate keyword match score
      const exactMatches = queryWords.filter(
        (word) => contentLower.includes(word) && word.length > 2
      ).length;

      const score = exactMatches / Math.max(1, queryWords.length);

      return {
        content: item.content,
        metadata: item.metadata,
        score,
        source: 'keyword_search',
      };
    })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return {
      ok: scoredResults.length > 0,
      results: scoredResults,
      method: 'keyword_search',
      totalResults: scoredResults.length,
      explanation: `Found ${scoredResults.length} results using keyword matching`,
    };
  }

  /**
   * Mock fallback for when all else fails
   */
  private mockSearch(query: string): RetrievalResult {
    // Simple heuristic matching
    const queryLower = query.toLowerCase();
    let result = DEFAULT_KNOWLEDGE_BASE[0]; // Default fallback

    if (queryLower.includes('milvus')) {
      result = DEFAULT_KNOWLEDGE_BASE[1];
    } else if (queryLower.includes('postgres') || queryLower.includes('sql')) {
      result = DEFAULT_KNOWLEDGE_BASE[2];
    } else if (queryLower.includes('langchain') || queryLower.includes('framework')) {
      result = DEFAULT_KNOWLEDGE_BASE[3];
    } else if (queryLower.includes('rag') || queryLower.includes('retrieval')) {
      result = DEFAULT_KNOWLEDGE_BASE[4];
    }

    return {
      ok: true,
      results: [
        {
          content: result.content,
          metadata: result.metadata,
          source: 'mock',
        },
      ],
      method: 'mock',
      totalResults: 1,
      explanation: 'Used mock search due to system limitations',
    };
  }

  /**
   * Main retrieval function with intelligent fallback strategy
   */
  async retrieve(input: RetrievalInput): Promise<RetrievalResult> {
    const { query, maxResults = 3, minSimilarityScore = 0.3, useEmbeddings = true } = input;

    console.log(`[EnhancedRetrieval] Processing query: "${query}"`);

    // Try vector search first if embeddings are enabled and LangChain is available
    if (useEmbeddings && process.env.LANGCHAIN_ENABLED === 'true') {
      const vectorResult = await this.vectorSearch(query, maxResults, minSimilarityScore);

      if (vectorResult.ok && vectorResult.results.length > 0) {
        // Optionally synthesize results using LLM (only if LLM is available)
        if (
          process.env.LANGCHAIN_SYNTHESIS !== 'false' &&
          process.env.LANGCHAIN_ENABLED === 'true'
        ) {
          try {
            return await this.synthesizeResults(query, vectorResult);
          } catch (error) {
            console.log('[EnhancedRetrieval] Synthesis failed, returning vector results');
            return vectorResult;
          }
        }
        return vectorResult;
      }

      console.log('[EnhancedRetrieval] Vector search failed, falling back to keyword search');
    }

    // Fall back to keyword search
    const keywordResult = this.keywordSearch(query, maxResults);
    if (keywordResult.ok && keywordResult.results.length > 0) {
      return keywordResult;
    }

    // Final fallback to mock search
    console.log('[EnhancedRetrieval] Keyword search failed, using mock search');
    return this.mockSearch(query);
  }

  /**
   * Legacy interface compatibility
   */
  async call(input: RetrievalInput): Promise<{ snippet: string; source: string; score?: number }> {
    const result = await this.retrieve(input);

    if (result.ok && result.results.length > 0) {
      const topResult = result.results[0];
      return {
        snippet: topResult.content,
        source: topResult.source,
        score: topResult.score,
      };
    }

    return {
      snippet: '',
      source: 'none',
    };
  }
}

// Export default instance
export const enhancedRetrievalTool = new EnhancedRetrievalTool('enhanced-retrieval');

/**
 * Factory function for creating retrieval tools
 */
export function createRetrievalTool(agentId: string): EnhancedRetrievalTool {
  return new EnhancedRetrievalTool(agentId);
}
