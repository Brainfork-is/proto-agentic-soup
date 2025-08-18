# LangGraph.js Migration Plan

## Overview

This document outlines the migration from our custom `SimpleAgent` implementation to LangGraph.js, including the implementation of real-world tools that better reflect the competitive agent ecosystem.

## Current State Analysis

### Existing Architecture
- **SimpleAgent**: Custom Plan-Act-Reflect pattern with JSON parsing
- **Tools**: Basic implementations (browser, calc, stringKit, retrieval)
- **LLM Integration**: Vertex AI, Ollama, OpenAI via custom provider
- **Job Processing**: BullMQ workers with SQLite persistence
- **Memory**: Custom AgentMemory with last-K job storage

### Limitations
1. Rigid sequential execution
2. Complex JSON parsing and sanitization
3. Simple tools unsuitable for real competition
4. Limited strategy adaptation
5. No checkpointing or resumption

## Migration Goals

1. **Leverage LangGraph.js** for sophisticated agent orchestration
2. **Implement real-world tools** that reflect actual gig economy tasks
3. **Enable adaptive strategies** through graph-based workflows
4. **Improve reliability** with checkpointing and error recovery
5. **Maintain compatibility** with existing infrastructure (BullMQ, SQLite, Redis)

## Phase 1: Foundation Setup ✅

### 1.1 Install Dependencies
```bash
npm install @langchain/langgraph @langchain/core @langchain/ollama
npm install @langchain/community  # For additional tools
```

### 1.2 Create Base LangGraph Agent Structure
- Location: `packages/agents/src/langgraph/`
- Core files:
  - `LangGraphAgent.ts` - Main agent implementation
  - `agentState.ts` - State annotation definitions
  - `nodes/` - Graph node implementations
  - `tools/` - Tool adapters and implementations

### 1.3 LLM Provider Integration
- Integrate ChatOllama for local models
- Maintain existing Vertex AI and OpenAI support
- Create unified interface for LangGraph compatibility

## Phase 2: Tool System Design

### 2.1 Tool Categories

#### Data Processing
- Transform, validate, and analyze structured data
- Support CSV, JSON, XML formats
- Statistical analysis and aggregation

#### Content Generation
- Code generation and review
- Document and email writing
- Template filling and formatting

#### Integration
- API interactions (REST, GraphQL)
- File system operations
- Database queries (read-only)

#### Analysis
- Sentiment and emotion analysis
- Pattern extraction and matching
- Image processing and OCR

### 2.2 Tool Implementation Strategy
- Wrap existing tools as LangGraph tools
- Create new tools using LangChain tool decorators
- Implement tool cost/benefit metadata
- Add tool discovery mechanism

## Phase 3: Job Categories & Grading

### 3.1 New Job Categories
Aligned with real-world gig economy tasks:
- **data_cleaning**: Clean and validate datasets
- **api_testing**: Test and document APIs
- **content_writing**: Generate articles/documentation
- **code_review**: Review code for bugs/improvements
- **data_analysis**: Extract insights from data
- **image_classification**: Categorize and tag images

### 3.2 Advanced Grading System
- LLM-based evaluation for complex outputs
- Partial credit scoring
- Performance metrics (speed, accuracy, efficiency)
- Category-specific graders

## Phase 4: Agent Implementation

### 4.1 State Management
```typescript
interface AgentState {
  agentId: string;
  jobData: JobData;
  plan: Plan;
  toolResults: ToolResult[];
  memory: JobMemory[];
  reflection: string;
  checkpoint: string;
  stepsUsed: number;
}
```

### 4.2 Graph Architecture
- **Nodes**: plan, execute, reflect, evaluate
- **Edges**: Conditional routing based on results
- **Checkpoints**: Enable resumption from any node
- **Parallel Execution**: Run independent tools simultaneously

### 4.3 Strategy Patterns
- Sequential: Traditional Plan-Act-Reflect
- Iterative: Multiple planning/execution cycles
- Parallel: Concurrent tool execution
- Hierarchical: Delegation to sub-agents

## Phase 5: Integration

### 5.1 Compatibility Layer
- AgentFactory for gradual migration
- Feature flags for A/B testing
- Backward compatibility with SimpleAgent

### 5.2 Infrastructure Integration
- BullMQ worker modifications
- SQLite persistence for checkpoints
- Redis for distributed state
- Metrics collection enhancements

## Phase 6: Testing & Optimization

### 6.1 Testing Strategy
- Unit tests for individual tools
- Integration tests for workflows
- Performance benchmarks
- Load testing with concurrent agents

### 6.2 Optimization Goals
- 2x faster job completion
- 30% higher success rate
- Reduced LLM token usage
- Better resource utilization

## Success Metrics

1. **Performance**: Job completion time and throughput
2. **Accuracy**: Success rate per job category
3. **Evolution**: Strategy diversity across agents
4. **Efficiency**: Resource usage per successful job
5. **Adaptability**: Performance improvement over time

## Configuration

### Environment Variables
```env
# LangGraph Configuration
USE_LANGGRAPH=true
LANGGRAPH_CHECKPOINT_DIR=./checkpoints
LANGGRAPH_DEBUG=true

# Tool Configuration  
ENABLE_REAL_WORLD_TOOLS=true
TOOL_TIMEOUT_MS=30000
MAX_TOOL_RETRIES=3

# Grading Configuration
USE_LLM_GRADING=true
PARTIAL_CREDIT_ENABLED=true
```

## Timeline

- **Week 1**: Foundation, tools, job categories
- **Week 2**: Agent implementation, integration, testing
- **Week 3**: Optimization, monitoring, gradual rollout

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Performance regression | Feature flags, A/B testing |
| Tool reliability | Timeouts, retries, fallbacks |
| Increased complexity | Comprehensive documentation, debugging tools |
| Resource usage | Rate limiting, budget controls |

## Next Steps

1. Complete Phase 1 implementation
2. Research available LangChain/LangGraph tools
3. Design tool adapter interface
4. Create proof-of-concept agent
5. Benchmark against SimpleAgent