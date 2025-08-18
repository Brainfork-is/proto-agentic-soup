# @soup/agents - Pure LangGraph Implementation

This package provides AI agents using LangGraph.js with Google Vertex AI integration.

## Architecture

The agents package has been completely refactored to use a pure LangGraph implementation:

### Core Components

- **LangGraphAgent**: Main agent class implementing plan-execute-reflect workflow
- **LangGraph Tools**: Structured tool system with proper schemas
- **Agent Memory**: Experience storage and learning system
- **Job Generator**: Vertex AI-powered dynamic job creation

### Files Structure

```
src/
├── langgraph/              # LangGraph implementation
│   ├── LangGraphAgent.ts   # Main agent class
│   ├── agentState.ts       # Workflow state definition
│   ├── nodes/              # Workflow nodes
│   │   ├── planNode.ts     # Planning phase
│   │   ├── executeNode.ts  # Execution phase
│   │   └── reflectNode.ts  # Learning phase
│   └── tools/              # LangGraph tools with schemas
├── agentMemory.ts          # Memory management
├── browserTool.ts          # Browser automation
├── jobGenerator.ts         # Vertex AI job generation
├── mcpClient.ts           # Knowledge server client
└── index.ts               # Package exports
```

## Configuration

### Environment Variables

```bash
# Vertex AI Configuration
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-1.5-flash
VERTEX_AI_TEMPERATURE=0.7
VERTEX_AI_MAX_OUTPUT_TOKENS=1000

# Authentication (choose one)
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
# OR
GOOGLE_CLOUD_CREDENTIALS=base64-encoded-credentials
```

## Usage

```typescript
import { LangGraphAgent, jobGenerator } from '@soup/agents';

// Create an agent
const agent = new LangGraphAgent('agent-id', 0.7, ['browser', 'calculator']);

// Generate a job
const job = await jobGenerator.generateJob();

// Process the job
const result = await agent.handle(job);
```

## Workflow

Each agent follows a structured workflow:

1. **Planning**: Analyzes the job and creates a step-by-step plan
2. **Execution**: Executes each step using appropriate tools
3. **Reflection**: Learns from the results for future improvements

## Tools Available

- **calculator**: Mathematical expression evaluation
- **text_processor**: Summarization and classification
- **browser**: Web navigation and content extraction
- **knowledge_retrieval**: Knowledge base search

## Removed Components

The following legacy components have been removed in the cleanup:

- SimpleAgent (backup functionality)
- LLM Provider abstraction layer
- Local LLM integration
- Hybrid agents
- Static/fallback job generation
- Legacy tool adapters