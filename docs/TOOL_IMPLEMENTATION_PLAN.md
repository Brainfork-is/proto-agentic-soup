# Real-World Tool Implementation Plan

## Overview

Based on our research of LangChain.js built-in tools, this plan outlines which tools to implement for our agent competition ecosystem and how to integrate them with LangGraph.

## Phase 1: Core Productivity Tools (Week 1)

### Priority 1: Research & Information Tools

#### Web Research Suite
```typescript
// Location: packages/agents/src/tools/research/
import { WebBrowser } from "@langchain/community/tools/webbrowser";
import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
```

**Job Categories:**
- `market_research`: Research competitors, industry trends
- `fact_checking`: Verify claims and statements
- `competitive_analysis`: Compare products/services

**Implementation:**
- Wrap built-in tools with cost tracking
- Add timeout and retry logic
- Implement result caching

#### Mathematical & Financial Tools
```typescript
// Location: packages/agents/src/tools/calculation/
import { Calculator } from "@langchain/community/tools/calculator";
import { WolframAlphaQueryRun } from "@langchain/community/tools/wolframalpha";
```

**Job Categories:**
- `financial_analysis`: ROI calculations, budget analysis
- `data_analysis`: Statistical calculations
- `price_optimization`: Cost/benefit analysis

### Priority 2: Communication Tools

#### Email & Scheduling
```typescript
// Location: packages/agents/src/tools/communication/
import { GmailCreateDraft } from "@langchain/community/tools/gmail";
import { GoogleCalendarCreateEvent } from "@langchain/community/tools/google_calendar";
```

**Job Categories:**
- `email_drafting`: Professional email composition
- `meeting_scheduling`: Calendar management
- `follow_up_automation`: Customer communication

## Phase 2: Technical & Data Tools (Week 2)

### Priority 1: Data Processing

#### File & Data Management
```typescript
// Location: packages/agents/src/tools/data/
import { ReadFileTool, WriteFileTool } from "@langchain/community/tools/fs";
import { JsonListKeysTool, JsonGetValueTool } from "@langchain/community/tools/json";
import { PythonInterpreterTool } from "@langchain/community/tools/python_interpreter";
```

**Job Categories:**
- `data_cleaning`: CSV/JSON data validation and cleaning
- `report_generation`: Automated document creation
- `data_transformation`: Format conversion and processing

#### API Integration
```typescript
// Location: packages/agents/src/tools/integration/
import { RequestsGetTool, RequestsPostTool } from "@langchain/community/tools/requests";
```

**Job Categories:**
- `api_testing`: Endpoint validation and testing
- `service_integration`: Connect different systems
- `webhook_processing`: Handle incoming data

## Phase 3: Creative & Advanced Tools (Week 3)

### Priority 1: Content Creation

#### Visual & Media Tools
```typescript
// Location: packages/agents/src/tools/creative/
import { DallEAPIWrapper } from "@langchain/community/tools/dalle_image_generator";
```

**Job Categories:**
- `image_generation`: Visual content for marketing
- `presentation_creation`: Slide deck generation
- `social_media_content`: Post creation with visuals

### Priority 2: Specialized Business Tools

#### Database & Analytics
```typescript
// Location: packages/agents/src/tools/business/
import { SqlTool } from "@langchain/community/tools/sql";
```

**Job Categories:**
- `business_intelligence`: Data reporting and insights
- `customer_analysis`: User behavior analysis
- `performance_monitoring`: KPI tracking

## Tool Integration Architecture

### Tool Adapter Pattern
```typescript
// packages/agents/src/tools/adapters/ToolAdapter.ts
export interface ToolAdapter {
  name: string;
  description: string;
  cost: number; // Steps or credits
  timeout: number;
  invoke(input: any): Promise<ToolResult>;
}

export class LangChainToolAdapter implements ToolAdapter {
  constructor(
    private tool: any,
    public name: string,
    public description: string,
    public cost: number = 1,
    public timeout: number = 30000
  ) {}
  
  async invoke(input: any): Promise<ToolResult> {
    const startTime = Date.now();
    try {
      const result = await Promise.race([
        this.tool.invoke(input),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tool timeout')), this.timeout)
        )
      ]);
      
      return {
        success: true,
        output: result,
        duration: Date.now() - startTime,
        cost: this.cost,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        cost: this.cost,
      };
    }
  }
}
```

### Tool Registry
```typescript
// packages/agents/src/tools/ToolRegistry.ts
export class ToolRegistry {
  private tools = new Map<string, ToolAdapter>();
  
  register(tool: ToolAdapter) {
    this.tools.set(tool.name, tool);
  }
  
  get(name: string): ToolAdapter | undefined {
    return this.tools.get(name);
  }
  
  list(): ToolAdapter[] {
    return Array.from(this.tools.values());
  }
  
  getByCategory(category: string): ToolAdapter[] {
    // Implementation for categorized tool retrieval
  }
}
```

## Job Categories & Grading

### New Job Categories

#### Data-Focused Jobs
1. **data_cleaning** (10-50 credits)
   - Clean CSV files with missing values
   - Validate JSON structure
   - Grade: Data quality improvement %

2. **data_analysis** (20-100 credits)
   - Generate insights from datasets
   - Create statistical summaries
   - Grade: Accuracy and insight quality

3. **api_testing** (15-40 credits)
   - Test REST endpoints
   - Validate response schemas
   - Grade: Coverage and issue detection

#### Communication Jobs
1. **email_drafting** (5-25 credits)
   - Professional email composition
   - Follow-up sequences
   - Grade: Tone, clarity, effectiveness

2. **meeting_scheduling** (10-30 credits)
   - Calendar coordination
   - Availability optimization
   - Grade: Efficiency and accuracy

#### Research Jobs
1. **market_research** (25-75 credits)
   - Industry trend analysis
   - Competitor research
   - Grade: Depth and accuracy

2. **fact_checking** (15-35 credits)
   - Verify claims with sources
   - Cross-reference information
   - Grade: Source quality and accuracy

### Advanced Grading System

#### LLM-Based Evaluation
```typescript
// apps/soup-runner/src/services/graders/LLMGrader.ts
export class LLMGrader {
  async gradeOutput(
    category: string,
    payload: any,
    artifact: any,
    context: any
  ): Promise<GradeResult> {
    const prompt = this.buildGradingPrompt(category, payload, artifact, context);
    const response = await llmProvider.generateContent({
      prompt,
      temperature: 0.1, // Low temperature for consistent grading
      maxTokens: 300,
    });
    
    return this.parseGradeResponse(response.content);
  }
}
```

#### Partial Credit System
- **Perfect (100%)**: Exceeds requirements
- **Good (80-99%)**: Meets requirements with minor issues
- **Acceptable (60-79%)**: Partially meets requirements
- **Poor (40-59%)**: Minimal effort, major issues
- **Failed (0-39%)**: Does not attempt or completely wrong

## Environment Setup

### Required API Keys
```env
# Core LLM
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Research Tools
DUCKDUCKGO_API_KEY=  # Often not required
WIKIPEDIA_API_KEY=   # Often not required
WOLFRAM_ALPHA_APPID=your_wolfram_id

# Productivity Tools
GOOGLE_API_KEY=your_google_key
GMAIL_CREDENTIALS=path/to/credentials.json
CALENDAR_CREDENTIALS=path/to/credentials.json

# Creative Tools
OPENAI_API_KEY=your_openai_key  # For DALL-E

# Business Tools
DATABASE_URL=your_database_url
```

### Tool Configuration
```env
# Tool Timeouts (milliseconds)
WEB_BROWSER_TIMEOUT=30000
CALCULATOR_TIMEOUT=5000
PYTHON_INTERPRETER_TIMEOUT=60000
API_REQUEST_TIMEOUT=15000

# Cost/Budget Controls
DAILY_TOOL_BUDGET=1000  # Total steps per agent per day
EXPENSIVE_TOOL_LIMIT=50  # Limit for high-cost tools
```

## Testing Strategy

### Unit Tests
- Test each tool adapter individually
- Mock external API calls
- Verify timeout and error handling

### Integration Tests
- Test tool combinations in workflows
- Verify LangGraph integration
- Test job processing end-to-end

### Performance Tests
- Measure tool execution times
- Test concurrent tool usage
- Monitor resource consumption

## Migration Strategy

### Phase 1: Parallel Implementation
1. Keep existing SimpleAgent working
2. Implement LangGraphAgent with new tools
3. Add feature flag for A/B testing

### Phase 2: Gradual Rollout
1. Start with 10% of agents using LangGraph
2. Monitor performance and success rates
3. Gradually increase percentage

### Phase 3: Full Migration
1. Switch all new agents to LangGraph
2. Migrate existing agents during reproduction
3. Remove SimpleAgent implementation

## Success Metrics

### Technical Metrics
- **Tool Success Rate**: >90% successful tool executions
- **Performance**: <2x execution time vs SimpleAgent
- **Resource Usage**: CPU/memory within acceptable limits

### Business Metrics
- **Job Success Rate**: >60% overall job success
- **Agent Diversity**: Multiple successful strategies emerge
- **Economic Balance**: Stable agent population with healthy competition

### User Experience
- **Debugging**: Clear tool execution logs
- **Monitoring**: Real-time tool usage metrics
- **Observability**: Visual workflow tracking

## Timeline

- **Week 1**: Core tools (research, calculation, communication)
- **Week 2**: Data tools (file processing, API integration)
- **Week 3**: Advanced tools (creative, database, specialized)
- **Week 4**: Testing, optimization, and rollout

This plan transforms our agent ecosystem from simple task executors to sophisticated workers capable of real-world gig economy tasks.