# @soup/agents - Simple React Agent Implementation

This package provides AI agents using LangGraph.js React pattern with Google Vertex AI integration.

## Architecture

The agents package uses a streamlined React agent implementation:

### Core Components

- **SimpleReactAgent**: Main agent class using LangGraph's createReactAgent
- **Tool Builder Agent**: Specialized agent that can generate and use custom tools
- **Agent Archetypes**: Pre-configured agent types (web-browser, wikipedia, google-trends, etc.)
- **Job Generator**: Vertex AI-powered realistic job creation

### Files Structure

```
src/
├── SimpleReactAgent.ts     # Main agent implementation
├── ToolBuilderAgent.ts     # Tool-building specialized agent
├── jobGenerator.ts         # Realistic job generation
├── llmGrader.ts           # LLM-based response grading
├── nameGenerator.ts       # Agent name generation
├── tools/                 # Tool execution environment
│   ├── toolExecutionEnv.ts # Sandboxed tool execution
│   ├── dynamicToolLoader.ts # Tool loading and management
│   └── codeGenerator.ts   # Tool code generation
├── langgraph/             # Legacy LangGraph components
└── index.ts              # Package exports
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
import { SimpleReactAgent, jobGenerator } from '@soup/agents';

// Create an agent with specific archetype
const agent = new SimpleReactAgent('agent-1', 'web-browser');

// Generate a realistic job
const job = await jobGenerator.generateJob();

// Process the job
const result = await agent.handle(job);
```

## Agent Archetypes

Available agent types:

- **`llm-only`**: Pure LLM reasoning without external tools
- **`web-browser`**: Web search (SerpAPI) + browsing capabilities
- **`wikipedia`**: Wikipedia search and research
- **`google-trends`**: Real-time Google search via SerpAPI
- **`tool-builder`**: Specialized agent that generates and uses custom tools

## Workflow

SimpleReact agents use LangGraph's built-in React pattern:

1. **Reasoning**: Analyzes the task and decides on actions
2. **Action**: Uses available tools to gather information or process data
3. **Observation**: Reviews tool outputs and continues reasoning
4. **Response**: Provides final answer based on gathered information

## Tool Builder Features

The ToolBuilderAgent can:

- Generate custom JavaScript tools using npm packages
- Execute tools in sandboxed environments
- Access web APIs and process real data
- Create mutation-based tool evolution for agent specialization

## Job Generation

The job generator creates realistic professional assignments:

- Business strategy and analysis tasks
- Financial planning and calculations
- Marketing and content strategy
- Technical documentation and planning
- Research and competitive analysis