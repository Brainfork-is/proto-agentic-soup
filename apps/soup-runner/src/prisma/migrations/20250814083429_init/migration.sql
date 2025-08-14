-- CreateTable
CREATE TABLE "Blueprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "llmModel" TEXT NOT NULL,
    "temperature" REAL NOT NULL,
    "tools" TEXT NOT NULL,
    "coopThreshold" REAL NOT NULL,
    "minBalance" INTEGER NOT NULL,
    "mutationRate" REAL NOT NULL,
    "maxOffspring" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blueprintId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,
    "reputation" REAL NOT NULL,
    "attempts" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "meanTtcSec" INTEGER NOT NULL,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "lastBeat" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "payout" INTEGER NOT NULL,
    "deadlineS" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Edge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
