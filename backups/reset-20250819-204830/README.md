# Agentic Soup System Reset Backup

**Backup Created:** Di 19 Aug 2025 20:48:31 CEST
**Reset Performed:** Di 19 Aug 2025 20:48:31 CEST

## Contents

- `jobs-export.csv` - All job data with results and metrics
- `database-backup.db` - Complete SQLite database backup
- `generated-tools/` - All custom tools created by agents
  - `generated-tools/code/` - Tool JavaScript files
  - `generated-tools/manifests/` - Tool metadata and usage stats

## System State Before Reset

- **Tools Backed Up:** 1 JavaScript files, 1 manifest files
- **Database:** Backed up
- **Redis Queue:** Cleared
- **Generated Tools:** Cleared and directories recreated

## Restore Instructions

To restore from this backup:

1. **Restore Database:**
   ```bash
   cp backups/reset-20250819-204830/database-backup.db apps/soup-runner/src/prisma/dev.db
   ```

2. **Restore Generated Tools:**
   ```bash
   cp -r backups/reset-20250819-204830/generated-tools/* packages/agents/src/generated-tools/
   ```

3. **Restart Services:**
   ```bash
   pnpm redis:up
   pnpm dev
   ```

## Files in This Backup

backups/reset-20250819-204830/database-backup.db
backups/reset-20250819-204830/generated-tools/code/cmeipzlrv003bb8mt7d9lnrd8_flight_parser_1755619079158_466cb93e.js
backups/reset-20250819-204830/generated-tools/manifests/flight_parser_466cb93e.json
backups/reset-20250819-204830/jobs-export.csv
backups/reset-20250819-204830/README.md
