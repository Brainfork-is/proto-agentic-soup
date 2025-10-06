#!/bin/bash
# Test script for tool-examples MCP server

echo "Building MCP server..."
pnpm build

echo ""
echo "Testing MCP server (will hang waiting for stdin - Ctrl+C to exit)"
echo "To test properly, use an MCP client or Claude Desktop"
echo ""
echo "Server logs will appear below:"
echo "=============================================="

node dist/index.js
