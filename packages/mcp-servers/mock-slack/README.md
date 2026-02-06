# Mock Slack MCP Server

A realistic Slack workspace simulation for testing agents with MCP (Model Context Protocol) integration. Provides 8 tools for interacting with mock Slack data including channels, users, messages, and threads.

## Features

### Mock Data
- **12 users** with realistic names, titles, and statuses
- **6 channels**: #general, #engineering, #random, #product, #deployments, #incidents
- **50+ messages** with realistic conversations including:
  - Engineering bug discussions with threaded replies
  - Product planning discussions
  - Incident response coordination
  - Deployment notifications
  - Casual team chat
- **Message reactions** and **threaded conversations**
- **Stateful**: New messages and reactions persist during the session

### Available Tools

1. **slack_list_channels** - List all channels in the workspace
2. **slack_post_message** - Post a message to a channel
3. **slack_get_channel_history** - Retrieve recent messages from a channel
4. **slack_reply_to_thread** - Reply to a message thread
5. **slack_add_reaction** - Add emoji reactions to messages
6. **slack_get_users** - List all workspace users
7. **slack_search_messages** - Search for messages across channels
8. **slack_get_thread_replies** - Get all replies in a thread

## Installation

```bash
cd packages/mcp-servers/mock-slack
pnpm install
pnpm build
```

## Usage

### Running the Server

```bash
# Run directly
pnpm start

# Or run the built file
node dist/index.js
```

The server communicates via stdio and follows the MCP protocol.

### Example Tool Calls

#### List Channels
```json
{
  "name": "slack_list_channels",
  "arguments": {}
}
```

#### Post a Message
```json
{
  "name": "slack_post_message",
  "arguments": {
    "channel": "general",
    "text": "Hello team! This is a test message."
  }
}
```

#### Get Channel History
```json
{
  "name": "slack_get_channel_history",
  "arguments": {
    "channel": "engineering",
    "limit": 10
  }
}
```

#### Search Messages
```json
{
  "name": "slack_search_messages",
  "arguments": {
    "query": "bug",
    "channel": "engineering"
  }
}
```

#### Reply to Thread
```json
{
  "name": "slack_reply_to_thread",
  "arguments": {
    "channel": "engineering",
    "thread_ts": "1234567890.123456",
    "text": "I can help with that!"
  }
}
```

#### Add Reaction
```json
{
  "name": "slack_add_reaction",
  "arguments": {
    "channel": "general",
    "timestamp": "1234567890.123456",
    "emoji": "thumbsup"
  }
}
```

## Mock Data Details

### Users
- Alice Chen (Senior Backend Engineer)
- Bob Martinez (Frontend Developer)
- Charlie Davis (Product Manager)
- Diana Wong (DevOps Engineer)
- Eric Thompson (QA Engineer)
- Fiona Liu (UX Designer)
- Greg Anderson (Engineering Manager)
- Hannah Park (Data Scientist)
- Ivan Petrov (Security Engineer)
- Julia Kim (Sales Engineer)
- Kevin Brown (Technical Writer)
- Lisa Green (Customer Success Manager)

### Sample Conversations

#### Engineering Channel
- Bug discussions with threaded troubleshooting
- PR review requests
- Database migration planning
- Security audit results
- Component library releases

#### Incidents Channel
- Production incident response with full resolution threads
- Postmortem documentation
- Staging environment issues

#### Product Channel
- Feature requests with engineering estimates
- Product roadmap discussions
- Metrics dashboard sharing

## Testing

You can test the server using the MCP Inspector or by integrating it with an agent that supports MCP tools.

```bash
# Install MCP Inspector (if not already installed)
npm install -g @modelcontextprotocol/inspector

# Test the server
mcp-inspector node dist/index.js
```

## Integration with Agents

Configure your agent to use this MCP server via stdio transport:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['packages/mcp-servers/mock-slack/dist/index.js'],
});

const client = new Client({
  name: 'my-agent',
  version: '1.0.0',
}, {
  capabilities: {}
});

await client.connect(transport);

// List available tools
const tools = await client.listTools();

// Call a tool
const result = await client.callTool({
  name: 'slack_get_channel_history',
  arguments: { channel: 'general', limit: 5 }
});
```

## Development

```bash
# Watch mode for development
pnpm dev

# Build
pnpm build

# Run
pnpm start
```

## License

Part of the Agentic Soup project.
