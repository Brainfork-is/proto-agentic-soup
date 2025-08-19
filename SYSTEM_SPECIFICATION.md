# Agentic Soup: Self-Improving Agent Ecosystem Specification

## Overview

Agentic Soup is an experimental TypeScript/Node.js system that simulates "survival of the fittest" dynamics among LangGraph.js software agents competing for LLM-generated jobs. The system explores emergent behavior through agent competition, tool creation, and evolutionary dynamics.

## Core Concept

The system creates a competitive environment where AI agents:
- Compete for randomly generated jobs
- Earn resources based on performance
- Reproduce successful traits through genetic-like algorithms
- Create and share custom tools to improve capabilities
- Evolve over time through natural selection mechanics

## Architecture

### Microservices Architecture

```
soup-runner (3000) ←→ browser-gateway (3100) ←→ site-kb (3200)
        ↓
    Redis (6379)
    SQLite (Prisma)
```

**Core Services:**
- **soup-runner**: Main orchestrator handling job generation, agent lifecycle, economics
- **browser-gateway**: Playwright-based browser automation API for web tasks
- **site-kb**: Static knowledge base serving as local "internet" for agents
- **Redis**: Queue management with BullMQ
- **SQLite**: Persistent storage for agents, jobs, and evolutionary data

### Technology Stack
- **Runtime**: Node.js 20.x
- **Language**: TypeScript with CommonJS
- **Framework**: Fastify (all services)
- **AI**: Google Vertex AI (Gemini models)
- **Agent Framework**: LangGraph.js with LangChain
- **Database**: SQLite with Prisma ORM
- **Queue**: Redis with BullMQ

## Agent System

### Agent Archetypes

The system supports multiple agent types with different capabilities:

1. **LLM-Only**: Pure reasoning without external tools
2. **Web-Browser**: Web search and browsing capabilities via SerpAPI + Playwright
3. **Wikipedia**: Wikipedia search and research capabilities
4. **Google-Trends**: Real-time search via SerpAPI
5. **Tool-Builder**: Can create custom JavaScript tools dynamically

### Agent Lifecycle

**Birth**: Agents are created from Blueprints containing genetic information
**Work**: Agents process jobs from the queue and earn resources based on performance
**Competition**: Limited resources create selection pressure
**Evolution**: Successful agents reproduce, failed agents die
**Tool Creation**: Advanced agents can create custom tools to improve capabilities

### Genetic System

Agents have "DNA" encoded in Blueprints containing:
- **Model Selection**: Which LLM model to use
- **Temperature**: Creativity/randomness setting
- **Tool Kit**: Available tools and capabilities
- **Archetype**: Fundamental behavioral pattern
- **Mutation Rate**: How much variation in offspring
- **Energy Costs**: Resource consumption rates

## Job Generation System

### Job Categories
- **Web Research**: Information gathering and analysis
- **Mathematical Computation**: Calculations, financial modeling
- **Text Analysis**: Summarization, classification, parsing
- **Data Processing**: Transformation and validation tasks

### Job Distribution
- **50% Computational Tasks**: Favor tool-builder agents
- **50% General Tasks**: Standard research, writing, analysis

### Quality Evaluation
- **LLM-Based Grading**: Automated quality assessment (0-100)
- **Pass/Fail Thresholds**: Performance-based survival
- **Continuous Improvement**: Failed agents lose energy, successful ones gain resources

## Custom Tool Generation System

### Overview

The custom tool generation system is the core innovation of Agentic Soup, allowing agents to create specialized JavaScript tools when existing capabilities are insufficient. This system enables true adaptation and specialization within the agent ecosystem.

### Architecture Components

#### 1. CodeGeneratorTool Class
The primary engine for tool creation:
- **LLM Integration**: Uses Vertex AI (Gemini) with low temperature (0.3) for consistent code generation
- **Template-Based Generation**: Leverages predefined patterns for reliable output
- **Safety Validation**: Multiple layers of code safety checking
- **File Management**: Handles tool persistence and metadata tracking

#### 2. Tool Templates System
Five specialized templates guide tool generation:

**Mathematical Calculator Tool**
- **Pattern**: Structured for numerical operations and computations
- **Placeholders**: `TOOL_NAME`, `DESCRIPTION`, `INPUT_PARAMS`, `MATH_CODE`, `CALCULATION_DESCRIPTION`
- **Triggers**: Keywords like "calculat", "math", "compute"
- **Output**: JSON with result, calculation description, timestamp

**Text Analysis Tool**
- **Pattern**: Designed for parsing, extraction, and text processing
- **Placeholders**: `TOOL_NAME`, `DESCRIPTION`, `OTHER_PARAMS`, `ANALYSIS_CODE`, `ANALYSIS_TYPE`
- **Triggers**: Keywords like "text", "analyz", "parse"
- **Output**: JSON with original text, result, analysis type, timestamp

**Data Validation Tool**
- **Pattern**: Implements rule-based checking and verification
- **Placeholders**: `TOOL_NAME`, `DESCRIPTION`, `VALIDATION_PARAMS`, `VALIDATION_RULES`
- **Triggers**: Keywords like "validat", "check", "verify"
- **Output**: JSON with validation results, pass/fail status, timestamp

**Data Formatting Tool**
- **Pattern**: Handles data transformation and structure conversion
- **Placeholders**: `TOOL_NAME`, `DESCRIPTION`, `FORMAT_PARAMS`, `FORMATTING_CODE`, `FORMAT_TYPE`
- **Triggers**: Keywords like "format", "transform", "convert"
- **Output**: JSON with original and formatted data, format type, timestamp

**Data Processing Tool** (Default Fallback)
- **Pattern**: General-purpose processing for unmatched tasks
- **Placeholders**: `TOOL_NAME`, `DESCRIPTION`, `INPUT_PARAMS`, `VALIDATION_CODE`, `PROCESSING_CODE`
- **Usage**: When no other template keywords match
- **Output**: JSON with processing results and timestamp

#### 3. Template Selection Logic
```typescript
function selectTemplate(taskDescription: string): ToolTemplate {
  const desc = taskDescription.toLowerCase();
  
  // Priority order matters - first match wins
  if (desc.includes('calculat') || desc.includes('math') || desc.includes('compute')) {
    return TOOL_TEMPLATES.calculator;
  }
  // ... other checks ...
  
  return TOOL_TEMPLATES.dataProcessor; // fallback
}
```

### Tool Generation Workflow

#### Step 1: Agent Recognition
Tool-builder agents analyze incoming jobs and determine when custom tools are needed:
- Existing tools cannot accomplish the task effectively
- Task requires specialized processing not available
- More efficient solution needed for specific problem type
- Complex data transformations or calculations required

#### Step 2: Tool Specification
Agent creates a structured request to the CodeGeneratorTool:
```typescript
{
  taskDescription: "Detailed description of required functionality",
  toolName: "unique_tool_name", 
  expectedInputs: { "param1": "type", "param2": "type" },
  expectedOutput: "Description of expected return format",
  agentId: "creator_agent_identifier"
}
```

#### Step 3: Template Selection & LLM Generation
```typescript
// Select appropriate template
const template = selectTemplate(taskDescription);

// Generate LLM prompt with template structure
const prompt = `You are a JavaScript code generator. Create a custom tool that follows this EXACT template...
TEMPLATE STRUCTURE TO FOLLOW:
${template.pattern}

Generate the complete JavaScript code for this tool. Replace ALL template placeholders...`;

// Generate code with Gemini
const response = await this.llm.invoke(prompt);
```

#### Step 4: Code Validation & Safety
Multiple validation layers ensure generated code is safe:

**Syntax Validation**:
- Must include expected tool name
- Must have async invoke method
- Must return JSON strings
- Must include try/catch error handling

**Security Validation**:
- No file system access (`fs`, `child_process`)
- No network access (`http`, `https`, `net`)
- No dangerous operations (`eval`, `Function`, `process.exit`)
- No dynamic imports

#### Step 5: Tool Persistence
Generated tools are saved with comprehensive metadata:

**Code File**: `/generated-tools/code/{agentId}_{toolName}_{timestamp}_{hash}.js`
```javascript
export const tool_name = {
  name: 'tool_name',
  description: 'Tool functionality description',
  async invoke(params) {
    // Generated implementation
  }
};
```

**Manifest File**: `/generated-tools/manifests/{toolName}_{hash}.json`
```json
{
  "toolName": "tool_name",
  "originalRequest": { /* creation parameters */ },
  "filePath": "path/to/code/file",
  "createdAt": "2025-08-19T15:57:59.172Z",
  "createdBy": "agent_id",
  "templateUsed": "Mathematical Calculator Tool",
  "hash": "8-char-hash",
  "usageCount": 0,
  "successCount": 0,
  "failureCount": 0
}
```

#### Step 6: Tool Loading & Integration
Tools are dynamically loaded into agent environments:
- **Agent-Specific Loading**: Each agent loads its own created tools
- **LangChain Integration**: Tools converted to LangChain DynamicTool format
- **Runtime Execution**: Tools available immediately in agent's tool set

### Tool Sharing Mechanism

#### Usage Tracking
Every tool invocation updates usage statistics:
- **Total Usage Count**: How many times tool has been called
- **Success/Failure Rates**: Performance tracking
- **Agent Attribution**: Which agents use which tools

#### Sharing Criteria
Tools become available to other agents when:
- **Usage Threshold**: ≥5 total uses
- **Success Rate**: >70% successful executions
- **Quality Metrics**: Consistent performance across multiple agents

#### Dynamic Tool Registry
The `dynamicToolLoader` manages tool availability:
```typescript
class DynamicToolLoader {
  async loadToolsForAgent(agentId: string): Promise<Tool[]> {
    // Load agent's own tools + shared high-quality tools
  }
  
  getRegistryStats(): RegistryStats {
    // Return ecosystem-wide tool statistics
  }
}
```

### Current Limitations & Future Improvements

#### Template System Constraints
1. **Limited Categories**: Only 5 template types for all possible needs
2. **Rigid Structure**: Templates enforce specific patterns that may not suit all use cases
3. **Keyword Dependency**: Simple keyword matching for template selection
4. **Missing Specializations**: No templates for dates, networking, algorithms, etc.

#### Proposed Enhancements
1. **Expanded Templates**: Add specialized patterns for common domains
2. **Semantic Selection**: Use LLM-based template matching instead of keywords
3. **Flexible Templates**: Allow LLM to modify structure when justified
4. **Template Composition**: Combine multiple patterns for complex tools
5. **Meta-Templates**: Templates that generate other templates

### Example: Tool Generation in Action

**Agent Task**: "Calculate compound interest given principal, rate, time, and compounding frequency"

**Template Selection**: Mathematical Calculator Tool (contains "calculat")

**Generated Tool**:
```javascript
export const compound_interest_calculator = {
  name: 'compound_interest_calculator',
  description: 'Calculates compound interest with principal, rate, time, and frequency',
  async invoke(params) {
    try {
      const { principal, rate, time, frequency } = params;
      
      // Validation code
      if (typeof principal !== 'number' || principal <= 0) {
        throw new Error('Principal must be a positive number');
      }
      // ... more validation
      
      // Mathematical computation
      const amount = principal * Math.pow(1 + (rate / frequency), frequency * time);
      const interest = amount - principal;
      
      return JSON.stringify({
        success: true,
        result: { finalAmount: amount, interestEarned: interest },
        calculation: `${principal} at ${rate}% for ${time} years`,
        computedAt: new Date().toISOString()
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'compound_interest_calculator'
      });
    }
  }
};
```

This tool becomes part of the agent's permanent toolkit and may eventually be shared with other agents if it proves useful and reliable.

## Economic System

### Resource Management
- **Energy**: Consumed by processing jobs, living, reproduction
- **Earnings**: Gained from successful job completion
- **Costs**: Model usage, tool creation, maintenance
- **Population Limits**: Resource scarcity drives competition

### Reproduction Mechanics
- **Threshold-Based**: Agents must accumulate sufficient resources
- **Genetic Mixing**: Offspring inherit traits from successful parents
- **Mutation**: Random variations introduce novelty
- **Selection Pressure**: Resource limitations eliminate weak performers

## Evolutionary Goals

### Short-Term Objectives
1. **Stable Population**: Self-sustaining agent ecosystem
2. **Tool Innovation**: Agents creating useful custom capabilities
3. **Performance Optimization**: Better job completion over time
4. **Niche Specialization**: Different archetypes finding optimal roles

### Long-Term Vision
1. **Emergent Intelligence**: Unexpected problem-solving capabilities
2. **Tool Ecosystems**: Sophisticated, reusable tool libraries
3. **Adaptive Specialization**: Agents evolving for specific problem domains
4. **Collaborative Behaviors**: Agents sharing resources and knowledge
5. **Meta-Learning**: Agents learning how to learn better

## Current Status & Next Steps

### Working Systems
- ✅ Agent creation and lifecycle management
- ✅ Job generation and processing
- ✅ Tool-builder agents creating custom tools
- ✅ Basic evolutionary mechanics (reproduction, death)
- ✅ Resource-based economics
- ✅ Performance-based selection

### Research Questions
1. **Tool Template Limitations**: Do predefined templates restrict innovation?
2. **Selection Pressure Optimization**: What resource constraints drive best evolution?
3. **Collaboration vs Competition**: How to balance individual vs collective success?
4. **Tool Sharing Dynamics**: Optimal conditions for tool ecosystem development?
5. **Emergent Behaviors**: What unexpected capabilities might arise?

### Future Enhancements
1. **Advanced Templates**: More specialized tool patterns
2. **Semantic Tool Selection**: Better template matching
3. **Multi-Agent Collaboration**: Shared problem-solving
4. **Tool Composition**: Combining simple tools into complex workflows
5. **Meta-Evolution**: Agents evolving their evolution strategies

## Philosophical Framework

Agentic Soup explores fundamental questions about artificial intelligence:
- Can competitive pressure drive AI capability improvement?
- How do tool-use and tool-creation capabilities evolve?
- What collective behaviors emerge from individual optimization?
- Can artificial agents develop genuine creativity and innovation?

The system serves as a testbed for understanding how intelligence, competition, and collaboration interact in artificial systems, potentially informing the development of more capable and adaptive AI architectures.