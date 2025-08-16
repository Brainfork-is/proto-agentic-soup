# LangChain Integration Plan for Agentic Soup

## Overview
This document outlines the step-by-step plan to integrate LangChain.js into the Agentic Soup project to replace mock tool implementations with real LLM-powered capabilities.

## Current State
- **Agent Architecture**: Plan → Act → Reflect → Learn pattern
- **LLM Integration**: Already has `llmProvider` supporting local (Ollama) and Vertex AI
- **Tools**: Mostly mock implementations
  - `stringKit`: Simple text truncation for summarization
  - `calc`: Unsafe eval() for math
  - `retrieval`: Hardcoded knowledge base
  - `browser`: Basic web scraping without intelligence
- **Planner**: LLMPlanner with fallback to MockPlanner

## Integration Phases

### Phase 1: Tool Enhancement with LangChain (Priority)

#### Step 1.1: Install Dependencies
```bash
# In packages/agents/
pnpm add @langchain/core @langchain/community langchain mathjs
```

#### Step 1.2: Create LangChain LLM Wrapper
**File**: `packages/agents/src/langchainProvider.ts`
- Wrap existing `llmProvider` as LangChain BaseLLM
- Support both local (Ollama) and Vertex AI
- Maintain token tracking and budgets

#### Step 1.3: Enhance stringKit Tool
**File**: `packages/agents/src/tools/langchainStringKit.ts`
- **Summarization**: Use LangChain's summarization chains
- **Classification**: Use LangChain's classification chains
- Configuration:
  ```typescript
  interface StringKitConfig {
    useLLM: boolean;  // Toggle between mock and LLM
    model?: 'local' | 'vertex';
    maxRetries?: number;
  }
  ```

#### Step 1.4: Enhance calc Tool
**File**: `packages/agents/src/tools/langchainCalc.ts`
- Replace eval() with mathjs for safe expression evaluation
- Add LLM validation for complex expressions
- Word problem solving capabilities

#### Step 1.5: Enhance retrieval Tool
**File**: `packages/agents/src/tools/langchainRetrieval.ts`
- Implement vector embeddings for knowledge base
- Use LangChain's retrieval chains
- Support both local KB and external sources

#### Step 1.6: Enhance browser Tool
**File**: `packages/agents/src/tools/langchainBrowser.ts`
- LLM-powered content extraction
- Intelligent navigation decisions
- Structured data extraction from web pages

### Phase 2: LangChain Agent Options

#### Option A: Conservative (Recommended First)
- Keep existing `SimpleAgent` class
- Replace tool implementations only
- Minimal disruption to existing code

#### Option B: Hybrid Implementation
- Create `LangChainAgent` alongside `SimpleAgent`
- Allow configuration to choose agent type
- A/B testing capabilities

#### Option C: Full Migration
- Replace SimpleAgent with LangChain ReActAgent
- Complete rewrite of agent logic
- Maximum LangChain feature utilization

### Phase 3: Advanced Features (Future)

1. **Memory Systems**
   - ConversationSummaryMemory for long-term recall
   - VectorStoreMemory for semantic search
   - Integration with existing agentMemory

2. **Tool Composition**
   - Sequential chains for complex tasks
   - Conditional tool selection
   - Tool output parsing and validation

3. **Observability**
   - LangSmith integration for debugging
   - Token usage tracking
   - Performance metrics

## Implementation Order

### Sprint 1: Foundation (Current)
1. Document plan (this file) ✓
2. Install LangChain dependencies
3. Create LangChain LLM wrapper
4. Implement environment configuration

### Sprint 2: stringKit Enhancement
1. Create LangChain summarization chain
2. Create LangChain classification chain
3. Add fallback to mock behavior
4. Test with existing job types

### Sprint 3: calc Tool Security & Enhancement
1. Replace eval() with mathjs
2. Add LLM word problem solver
3. Implement validation and error handling
4. Test with math job category

### Sprint 4: retrieval Tool Intelligence
1. Set up vector store (in-memory initially)
2. Implement embedding generation
3. Create retrieval chain
4. Test with web_research jobs

### Sprint 5: browser Tool Enhancement
1. Implement LLM-powered content extraction
2. Add intelligent navigation
3. Structure extraction capabilities
4. Integration testing

### Sprint 6: Agent Integration
1. Update SimpleAgent to use new tools
2. Performance comparison (mock vs LLM)
3. Cost analysis
4. Production readiness

## Configuration Strategy

### Environment Variables
```bash
# Enable LangChain tools
LANGCHAIN_ENABLED=true
LANGCHAIN_TOOLS=stringKit,calc,retrieval,browser

# Tool-specific settings
STRINGKIT_USE_LLM=true
CALC_USE_LLM=true
RETRIEVAL_USE_EMBEDDINGS=true
BROWSER_USE_LLM=true

# Fallback behavior
FALLBACK_TO_MOCK=true
MOCK_TIMEOUT_MS=5000
```

### Feature Flags
```typescript
interface LangChainConfig {
  enabled: boolean;
  tools: {
    stringKit: { useLLM: boolean; fallbackToMock: boolean; };
    calc: { useLLM: boolean; useMathJS: boolean; };
    retrieval: { useEmbeddings: boolean; vectorStore: 'memory' | 'file'; };
    browser: { useLLM: boolean; extractionMode: 'simple' | 'structured'; };
  };
  monitoring: {
    trackTokenUsage: boolean;
    logToLangSmith: boolean;
  };
}
```

## Testing Strategy

### Unit Tests
- Test each tool in isolation
- Mock LLM responses for predictable testing
- Verify fallback behavior

### Integration Tests
- Test complete job execution flow
- Compare mock vs LLM outputs
- Performance benchmarks

### Cost Analysis
- Track tokens per job type
- Calculate cost per successful job
- ROI analysis for LLM usage

## Risk Mitigation

1. **Token Costs**
   - Implement aggressive caching
   - Use smaller models where possible
   - Batch similar requests

2. **Latency**
   - Parallel tool execution where possible
   - Timeout handling
   - Fallback to mock for time-sensitive operations

3. **Reliability**
   - Robust error handling
   - Automatic retries with backoff
   - Circuit breaker pattern for LLM failures

4. **Backwards Compatibility**
   - Keep mock implementations
   - Feature flags for gradual rollout
   - A/B testing capabilities

## Success Metrics

1. **Functional Success**
   - Job completion rate > 80%
   - Correct answers for test cases
   - Tool reliability > 95%

2. **Performance Metrics**
   - Average job completion < 30s
   - Token usage within budget
   - Fallback rate < 10%

3. **Quality Metrics**
   - Summarization quality scores
   - Classification accuracy
   - Math problem solving rate

## Next Steps

1. Review and approve this plan
2. Create feature branch: `feat/langchain-integration`
3. Implement Step 1.1-1.2 (Dependencies and LLM Wrapper)
4. Begin with stringKit enhancement (highest impact)
5. Iterative testing and refinement

## References

- [LangChain.js Documentation](https://js.langchain.com/)
- [LangChain Tools Guide](https://js.langchain.com/docs/modules/agents/tools/)
- [MathJS Documentation](https://mathjs.org/)
- [Ollama Integration](https://js.langchain.com/docs/integrations/llms/ollama)