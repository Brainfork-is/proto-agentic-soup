#!/bin/bash

# System Status Check Script
echo "🔍 Agentic Soup System Status"
echo "============================="

# Check database
DB_FILE="apps/soup-runner/src/prisma/dev.db"
if [ -f "$DB_FILE" ]; then
    echo "📊 Database Status:"
    echo "   Database file: ✅ Found"
    
    cd apps/soup-runner
    
    # Count records in each table
    AGENT_COUNT=$(sqlite3 src/prisma/dev.db "SELECT COUNT(*) FROM AgentState;" 2>/dev/null || echo "0")
    JOB_COUNT=$(sqlite3 src/prisma/dev.db "SELECT COUNT(*) FROM Job;" 2>/dev/null || echo "0")
    LEDGER_COUNT=$(sqlite3 src/prisma/dev.db "SELECT COUNT(*) FROM Ledger;" 2>/dev/null || echo "0")
    BLUEPRINT_COUNT=$(sqlite3 src/prisma/dev.db "SELECT COUNT(*) FROM Blueprint;" 2>/dev/null || echo "0")
    
    echo "   - Agents: $AGENT_COUNT"
    echo "   - Jobs: $JOB_COUNT"
    echo "   - Ledger entries: $LEDGER_COUNT"
    echo "   - Blueprints: $BLUEPRINT_COUNT"
    
    cd ../..
else
    echo "📊 Database Status: ❌ Not found"
fi

# Check generated tools
TOOLS_DIR="packages/agents/src/generated-tools"
if [ -d "$TOOLS_DIR" ]; then
    echo "🛠️  Generated Tools:"
    
    TOOL_FILES=$(find "$TOOLS_DIR/code" -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
    MANIFEST_FILES=$(find "$TOOLS_DIR/manifests" -name "*.json" 2>/dev/null | wc -l | tr -d ' ')
    
    echo "   - Tool files: $TOOL_FILES"
    echo "   - Manifest files: $MANIFEST_FILES"
    
    if [ "$TOOL_FILES" -gt 0 ]; then
        echo "   Recent tools:"
        find "$TOOLS_DIR/code" -name "*.js" -exec basename {} \; 2>/dev/null | head -3 | sed 's/^/     - /'
    fi
else
    echo "🛠️  Generated Tools: ❌ Directory not found"
fi

# Check Redis
echo "🔴 Redis Status:"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

if command -v redis-cli &> /dev/null; then
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping > /dev/null 2>&1; then
        REDIS_KEYS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" dbsize 2>/dev/null || echo "unknown")
        echo "   Connection: ✅ Connected"
        echo "   Keys in database: $REDIS_KEYS"
    else
        echo "   Connection: ❌ Cannot connect"
    fi
else
    echo "   redis-cli: ❌ Not installed"
fi

# Check backups
echo "📁 Backup History:"
if [ -d "backups" ]; then
    BACKUP_COUNT=$(find backups -name "reset-*" -type d 2>/dev/null | wc -l | tr -d ' ')
    echo "   Previous resets: $BACKUP_COUNT"
    
    if [ "$BACKUP_COUNT" -gt 0 ]; then
        echo "   Recent backups:"
        find backups -name "reset-*" -type d 2>/dev/null | sort -r | head -3 | sed 's/^/     - /'
    fi
else
    echo "   Previous resets: 0"
fi

echo
echo "🚀 System ready for operations!"
echo "   Run 'pnpm reset' to create backup and reset system"
echo "   Run 'pnpm export-jobs' to export current job data"
echo "   Run 'pnpm dev' to start the system"