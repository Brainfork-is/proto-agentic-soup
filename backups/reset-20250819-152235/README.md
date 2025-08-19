# Agentic Soup System Reset Backup

**Backup Created:** Di 19 Aug 2025 15:22:35 CEST
**Reset Performed:** Di 19 Aug 2025 15:22:35 CEST

## Contents

- `jobs-export.csv` - All job data with results and metrics
- `database-backup.db` - Complete SQLite database backup
- `generated-tools/` - All custom tools created by agents
  - `generated-tools/code/` - Tool JavaScript files
  - `generated-tools/manifests/` - Tool metadata and usage stats

## System State Before Reset

- **Tools Backed Up:** 11 JavaScript files, 11 manifest files
- **Database:** Backed up
- **Redis Queue:** Cleared
- **Generated Tools:** Cleared and directories recreated

## Restore Instructions

To restore from this backup:

1. **Restore Database:**
   ```bash
   cp backups/reset-20250819-152235/database-backup.db apps/soup-runner/src/prisma/dev.db
   ```

2. **Restore Generated Tools:**
   ```bash
   cp -r backups/reset-20250819-152235/generated-tools/* packages/agents/src/generated-tools/
   ```

3. **Restart Services:**
   ```bash
   pnpm redis:up
   pnpm dev
   ```

## Files in This Backup

backups/reset-20250819-152235/database-backup.db
backups/reset-20250819-152235/generated-tools/code/cmeihcijo000bds5c9mwrcytz_isbn10_validator_1755609435337_ab60fbc3.js
backups/reset-20250819-152235/generated-tools/code/cmeihcijp000dds5c9idbwrpp_celsius_to_fahrenheit_converter_1755608867581_98adaa80.js
backups/reset-20250819-152235/generated-tools/code/cmeihcijr000hds5cgktawvid_roi_calculator_1755608867746_19bf163d.js
backups/reset-20250819-152235/generated-tools/code/cmeihcijs000jds5cyrvne8xr_sort_numbers_ascending_1755609433348_6ab6092a.js
backups/reset-20250819-152235/generated-tools/code/cmeihcijv000rds5cmgjaz3q2_email_validator_1755608867973_6797c58e.js
backups/reset-20250819-152235/generated-tools/code/test_bookworm_discount_calculator_1755607767340_6050ffc2.js
backups/reset-20250819-152235/generated-tools/code/test_date_difference_calculator_1755607767547_a20bec6e.js
backups/reset-20250819-152235/generated-tools/code/test_parse_customer_order_1755607768477_4d3da16c.js
backups/reset-20250819-152235/generated-tools/code/test_revenue_growth_rate_calculator_1755607766284_f74540e4.js
backups/reset-20250819-152235/generated-tools/code/test-agent-001_basic_calculator_1755606278681_d190ac04.js
backups/reset-20250819-152235/generated-tools/code/test-agent-001_basic_calculator_1755606280229_60252b7b.js
backups/reset-20250819-152235/generated-tools/manifests/basic_calculator_60252b7b.json
backups/reset-20250819-152235/generated-tools/manifests/basic_calculator_d190ac04.json
backups/reset-20250819-152235/generated-tools/manifests/bookworm_discount_calculator_6050ffc2.json
backups/reset-20250819-152235/generated-tools/manifests/celsius_to_fahrenheit_converter_98adaa80.json
backups/reset-20250819-152235/generated-tools/manifests/date_difference_calculator_a20bec6e.json
backups/reset-20250819-152235/generated-tools/manifests/email_validator_6797c58e.json
backups/reset-20250819-152235/generated-tools/manifests/isbn10_validator_ab60fbc3.json
backups/reset-20250819-152235/generated-tools/manifests/parse_customer_order_4d3da16c.json
backups/reset-20250819-152235/generated-tools/manifests/revenue_growth_rate_calculator_f74540e4.json
backups/reset-20250819-152235/generated-tools/manifests/roi_calculator_19bf163d.json
backups/reset-20250819-152235/generated-tools/manifests/sort_numbers_ascending_6ab6092a.json
backups/reset-20250819-152235/jobs-export.csv
backups/reset-20250819-152235/README.md
