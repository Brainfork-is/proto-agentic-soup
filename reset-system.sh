#!/bin/bash

# Agentic Soup System Reset Script
# This script creates a backup of the current state and resets the system

set -e  # Exit on any error

# Configuration
BACKUP_DIR="backups/reset-$(date +%Y%m%d-%H%M%S)"
TOOLS_DIR="packages/agents/src/generated-tools"
DIST_TOOLS_DIR="packages/agents/dist/src/generated-tools"
DB_FILE="apps/soup-runner/src/prisma/dev.db"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_DB="${REDIS_DB:-0}"

echo "🧹 Agentic Soup System Reset"
echo "============================="
echo "This will:"
echo "1. Export current job data to CSV"
echo "2. Backup generated tools"
echo "3. Clear the SQLite database"  
echo "4. Clear the Redis job queue"
echo "5. Create timestamped backup in: $BACKUP_DIR"
echo

# Confirm action
read -p "Are you sure you want to reset the system? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Reset cancelled"
    exit 1
fi

echo "🚀 Starting system reset..."
echo

# Step 1: Create backup directory
echo "📁 Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Step 2: Export current job data
echo "📊 Exporting job data to CSV..."
if [ -f "$DB_FILE" ]; then
    cd apps/soup-runner
    npx tsx src/export-jobs.ts --all --output "../../$BACKUP_DIR/jobs-export.csv"
    cd ../..
    echo "✅ Job data exported to $BACKUP_DIR/jobs-export.csv"
else
    echo "⚠️  Database file not found at $DB_FILE, skipping CSV export"
fi

# Step 3: Backup generated tools
echo "🛠️  Backing up generated tools..."
TOOL_COUNT=0
MANIFEST_COUNT=0
DIST_TOOL_COUNT=0
DIST_MANIFEST_COUNT=0

if [ -d "$TOOLS_DIR" ]; then
    cp -r "$TOOLS_DIR" "$BACKUP_DIR/generated-tools-src"
    TOOL_COUNT=$(find "$BACKUP_DIR/generated-tools-src" -name "*.js" | wc -l | tr -d ' ')
    MANIFEST_COUNT=$(find "$BACKUP_DIR/generated-tools-src" -name "*.json" | wc -l | tr -d ' ')
    echo "✅ Source generated tools backed up"
else
    echo "⚠️  Generated tools source directory not found, skipping source backup"
fi

if [ -d "$DIST_TOOLS_DIR" ]; then
    cp -r "$DIST_TOOLS_DIR" "$BACKUP_DIR/generated-tools-dist"
    DIST_TOOL_COUNT=$(find "$BACKUP_DIR/generated-tools-dist" -name "*.js" | wc -l | tr -d ' ')
    DIST_MANIFEST_COUNT=$(find "$BACKUP_DIR/generated-tools-dist" -name "*.json" | wc -l | tr -d ' ')
    echo "✅ Compiled generated tools backed up"
else
    echo "⚠️  Generated tools dist directory not found, skipping dist backup"
fi

# Step 4: Backup database (before clearing)
echo "💾 Backing up database..."
if [ -f "$DB_FILE" ]; then
    cp "$DB_FILE" "$BACKUP_DIR/database-backup.db"
    echo "✅ Database backed up to $BACKUP_DIR/database-backup.db"
else
    echo "⚠️  Database file not found, skipping database backup"
fi

# Step 5: Clear the database 
echo "🗑️  Clearing SQLite database..."
if [ -f "$DB_FILE" ]; then
    cd apps/soup-runner
    
    # Drop all data but keep schema
    sqlite3 src/prisma/dev.db "
        DELETE FROM Ledger;
        DELETE FROM Job;
        DELETE FROM AgentState;
        DELETE FROM Swarm;
        DELETE FROM Blueprint;
        DELETE FROM Edge;
    "
    
    # Reset any auto-increment sequences (only if table exists)
    sqlite3 src/prisma/dev.db "
        DELETE FROM sqlite_sequence WHERE name IN ('Ledger', 'Job', 'AgentState', 'Swarm', 'Blueprint', 'Edge');
    " 2>/dev/null || echo "   Note: No auto-increment sequences to reset"
    
    echo "✅ Database tables cleared"
    cd ../..
else
    echo "⚠️  Database file not found, skipping database clear"
fi

# Step 6: Clear Redis job queue
echo "🔴 Clearing Redis job queue..."
if command -v redis-cli &> /dev/null; then
    redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -n "$REDIS_DB" FLUSHDB > /dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "✅ Redis database cleared"
    else
        echo "⚠️  Could not connect to Redis, skipping queue clear"
    fi
else
    echo "⚠️  redis-cli not found, skipping queue clear"
fi

# Step 7: Clear generated tools
echo "🛠️  Clearing generated tools..."

rm -rf "$TOOLS_DIR" "$DIST_TOOLS_DIR"
mkdir -p "$TOOLS_DIR/code" "$TOOLS_DIR/manifests"
mkdir -p "$DIST_TOOLS_DIR/code" "$DIST_TOOLS_DIR/manifests"

echo "✅ Generated tools directories (src & dist) cleared and recreated"

# Step 8: Create backup summary
echo "📋 Creating backup summary..."
cat > "$BACKUP_DIR/README.md" << EOF
# Agentic Soup System Reset Backup

**Backup Created:** $(date)
**Reset Performed:** $(date)

## Contents

- \`jobs-export.csv\` - All job data with results and metrics
- \`database-backup.db\` - Complete SQLite database backup
- \`generated-tools/\` - All custom tools created by agents
  - \`generated-tools/code/\` - Tool JavaScript files
  - \`generated-tools/manifests/\` - Tool metadata and usage stats

## System State Before Reset

- **Tools Backed Up (src):** $TOOL_COUNT JavaScript files, $MANIFEST_COUNT manifest files
- **Tools Backed Up (dist):** $DIST_TOOL_COUNT JavaScript files, $DIST_MANIFEST_COUNT manifest files
- **Database:** $([ -f "$DB_FILE" ] && echo "Backed up" || echo "Not found")
- **Redis Queue:** Cleared
- **Generated Tools:** Cleared and directories recreated

## Restore Instructions

To restore from this backup:

1. **Restore Database:**
   \`\`\`bash
   cp $BACKUP_DIR/database-backup.db apps/soup-runner/src/prisma/dev.db
   \`\`\`

2. **Restore Generated Tools:**
   \`\`\`bash
   cp -r $BACKUP_DIR/generated-tools-src/* packages/agents/src/generated-tools/
   cp -r $BACKUP_DIR/generated-tools-dist/* packages/agents/dist/src/generated-tools/
   \`\`\`

3. **Restart Services:**
   \`\`\`bash
   pnpm redis:start
   pnpm dev
   \`\`\`

## Files in This Backup

$(find "$BACKUP_DIR" -type f | sort)
EOF

echo "✅ Backup summary created"

# Final summary
echo
echo "🎉 System Reset Complete!"
echo "========================="
echo "✅ Job data exported and backed up"
echo "✅ Generated tools backed up and cleared"
echo "✅ Database cleared (tables emptied)"
echo "✅ Redis queue cleared"
echo "✅ Fresh tool directories created"
echo
echo "📁 Full backup saved to: $BACKUP_DIR"
echo "📄 Backup summary: $BACKUP_DIR/README.md"
echo
echo "🚀 System is now reset and ready for fresh agent evolution!"
echo "   Run 'pnpm dev' to start the system with a clean slate."
echo
