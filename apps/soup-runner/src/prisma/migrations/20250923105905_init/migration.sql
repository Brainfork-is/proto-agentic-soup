-- CreateTable
CREATE TABLE "Swarm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "reputation" REAL NOT NULL DEFAULT 0.5,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "meanTtcSec" INTEGER NOT NULL DEFAULT 0,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AgentState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blueprintId" TEXT,
    "swarmId" TEXT,
    "name" TEXT,
    "archetype" TEXT,
    "balance" INTEGER NOT NULL,
    "reputation" REAL NOT NULL,
    "attempts" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "meanTtcSec" INTEGER NOT NULL,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "lastBeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentState_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AgentState" ("alive", "attempts", "balance", "blueprintId", "id", "lastBeat", "meanTtcSec", "name", "reputation", "wins") SELECT "alive", "attempts", "balance", "blueprintId", "id", "lastBeat", "meanTtcSec", "name", "reputation", "wins" FROM "AgentState";
DROP TABLE "AgentState";
ALTER TABLE "new_AgentState" RENAME TO "AgentState";
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "payout" INTEGER NOT NULL,
    "deadlineS" INTEGER NOT NULL,
    "swarmId" TEXT,
    "agentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Job_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("category", "createdAt", "deadlineS", "id", "payload", "payout") SELECT "category", "createdAt", "deadlineS", "id", "payload", "payout" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE TABLE "new_Ledger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT,
    "swarmId" TEXT,
    "jobId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "qualityGrade" INTEGER,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ledger_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ledger" ("agentId", "delta", "id", "jobId", "qualityGrade", "reason", "ts") SELECT "agentId", "delta", "id", "jobId", "qualityGrade", "reason", "ts" FROM "Ledger";
DROP TABLE "Ledger";
ALTER TABLE "new_Ledger" RENAME TO "Ledger";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
