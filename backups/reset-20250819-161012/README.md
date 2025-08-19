# Agentic Soup System Reset Backup

**Backup Created:** Di 19 Aug 2025 16:10:15 CEST
**Reset Performed:** Di 19 Aug 2025 16:10:15 CEST

## Contents

- `jobs-export.csv` - All job data with results and metrics
- `database-backup.db` - Complete SQLite database backup
- `generated-tools/` - All custom tools created by agents
  - `generated-tools/code/` - Tool JavaScript files
  - `generated-tools/manifests/` - Tool metadata and usage stats

## System State Before Reset

- **Tools Backed Up:** 2 JavaScript files, 2 manifest files
- **Database:** Backed up
- **Redis Queue:** Cleared
- **Generated Tools:** Cleared and directories recreated

## Restore Instructions

To restore from this backup:

1. **Restore Database:**
   ```bash
   cp backups/reset-20250819-161012/database-backup.db apps/soup-runner/src/prisma/dev.db
   ```

2. **Restore Generated Tools:**
   ```bash
   cp -r backups/reset-20250819-161012/generated-tools/* packages/agents/src/generated-tools/
   ```

3. **Restart Services:**
   ```bash
   pnpm redis:up
   pnpm dev
   ```

## Files in This Backup

backups/reset-20250819-161012/database-backup.db
backups/reset-20250819-161012/generated-tools/code/cmeikrmhj002rigl7lo2vy83m_date_difference_calculator_1755612011858_47b2442d.js
backups/reset-20250819-161012/generated-tools/code/cmeikrmhp0031igl752rs4yca_bmicalculator_1755611760555_70691db8.js
backups/reset-20250819-161012/generated-tools/manifests/bmicalculator_70691db8.json
backups/reset-20250819-161012/generated-tools/manifests/date_difference_calculator_47b2442d.json
backups/reset-20250819-161012/jobs-export.csv
backups/reset-20250819-161012/README.md
