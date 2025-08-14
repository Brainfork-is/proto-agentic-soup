# MCP Knowledge Server Integration

## Overview

The Agentic Soup system supports integration with an external MCP (Model Context Protocol) knowledge server to provide agents with enhanced retrieval capabilities beyond the local knowledge base.

## Configuration

### Environment Variables

Add these variables to your `.env` file:

```bash
# MCP Knowledge Server URL
MCP_KNOWLEDGE_SERVER=http://localhost:8080

# Bearer token for authentication
MCP_BEARER_TOKEN=your-bearer-token-here
```

### Server Requirements

The MCP knowledge server should implement the following endpoints:

1. **POST /search** - Search the knowledge base
   ```json
   Request:
   {
     "query": "vector databases",
     "maxResults": 5,
     "filters": {}
   }
   
   Response:
   {
     "results": [
       {
         "id": "doc-123",
         "title": "Vector Database Guide",
         "content": "Full document content...",
         "score": 0.95,
         "metadata": {}
       }
     ],
     "totalCount": 42,
     "queryTime": 125
   }
   ```

2. **GET /documents/:id** - Retrieve specific document
3. **POST /documents** - Add new document to knowledge base
4. **GET /similar/:id** - Find similar documents using vector similarity
5. **GET /health** - Health check endpoint

### Authentication

All requests include the bearer token in the Authorization header:
```
Authorization: Bearer your-bearer-token-here
```

## Usage in Agents

### Using the Retrieval Tool

The standard retrieval tool now supports MCP integration:

```javascript
// Use MCP knowledge server if available
const result = await Tools.retrieval({
  query: "vector databases",
  useKnowledgeServer: true
});

// Response includes source information
console.log(result.source); // 'mcp' or 'local'
console.log(result.snippet); // Retrieved content
console.log(result.score);   // Relevance score (if from MCP)
```

### Direct Knowledge Search

For more advanced searches, use the dedicated knowledge search tool:

```javascript
const searchResult = await Tools.knowledgeSearch({
  query: "RAG implementation patterns",
  maxResults: 10
});

if (searchResult.ok) {
  searchResult.results.forEach(doc => {
    console.log(`${doc.title}: ${doc.content} (score: ${doc.score})`);
  });
}
```

## Implementation Details

### MCP Client

The MCP client (`packages/agents/src/mcpClient.ts`) provides:
- Automatic configuration from environment variables
- Bearer token authentication
- Error handling with fallback to local KB
- Connection pooling and retry logic
- Health check capabilities

### Integration Points

1. **Browser Gateway**: Can use MCP for enriching web automation context
2. **Agent Tools**: Retrieval tool seamlessly integrates MCP when configured
3. **Runner**: Agents have access to MCP configuration for knowledge retrieval

## Testing

To test MCP integration without a real server:

1. Use the provided mock server script (if available)
2. Set environment variables to point to mock server
3. Run agent tests with knowledge retrieval

## Security Considerations

1. **Bearer Token**: Store securely, never commit to repository
2. **Network Security**: Use HTTPS in production
3. **Rate Limiting**: Implement client-side rate limiting to respect server limits
4. **Data Privacy**: Ensure sensitive data is not sent to external knowledge servers

## Troubleshooting

### Common Issues

1. **Connection Refused**: Check server URL and port
2. **401 Unauthorized**: Verify bearer token is correct
3. **Timeout Errors**: Increase timeout or check network connectivity
4. **Fallback to Local**: Check logs for MCP errors, system will use local KB

### Debug Mode

Enable debug logging for MCP client:
```bash
DEBUG=mcp:* pnpm dev
```

## Future Enhancements

- [ ] Support for multiple MCP servers
- [ ] Caching layer for frequently accessed documents
- [ ] Vector embedding generation for local documents
- [ ] Automatic knowledge base synchronization
- [ ] WebSocket support for real-time updates