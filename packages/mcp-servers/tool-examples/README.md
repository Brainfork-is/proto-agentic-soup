# Tool Examples MCP Server

An MCP server that provides access to successful tool implementations from the generated-tools directory. This allows the code generator to learn from real, working tools rather than relying on static examples.

## Features

- **search_successful_tools**: Find tools by keywords with high success rates
- **get_tool_by_pattern**: Find tools using specific patterns (webResearch, validator, axios, etc.)
- **get_similar_tools**: Find tools with similar task descriptions

## Installation

```bash
cd packages/mcp-servers/tool-examples
pnpm install
pnpm build
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tool-examples": {
      "command": "node",
      "args": [
        "/Users/phil/Projects/agentic-soup/packages/mcp-servers/tool-examples/dist/index.js"
      ]
    }
  }
}
```

## Usage from Code

The code generator will automatically use this MCP server (when integrated) to fetch relevant examples before generating new tools.

## Examples

### Search for tools using webResearch

```javascript
// MCP call
{
  "name": "search_successful_tools",
  "arguments": {
    "keywords": ["webResearch", "axios"],
    "minSuccessRate": 0.75,
    "limit": 2
  }
}
```

### Get tools by pattern

```javascript
// MCP call
{
  "name": "get_tool_by_pattern",
  "arguments": {
    "pattern": "webResearch",
    "minSuccessRate": 0.8,
    "limit": 2
  }
}
```

### Find similar tools

```javascript
// MCP call
{
  "name": "get_similar_tools",
  "arguments": {
    "taskDescription": "Research and compile information about companies",
    "limit": 2
  }
}
```

## How It Works

1. Loads all tool manifests from `packages/agents/src/generated-tools/manifests/`
2. Filters tools by success rate (successCount / usageCount)
3. Searches tool code and descriptions for keyword matches
4. Returns the most relevant, highest-performing tools as examples
5. Scores tools based on keyword frequency and task description similarity

## Future Enhancements

- Add caching for frequently requested examples
- Support for filtering by tool age (prefer recent tools)
- Support for filtering by specific agent archetypes
- Integration with tool performance metrics from Redis
