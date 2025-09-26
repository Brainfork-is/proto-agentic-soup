-- CreateTable
CREATE TABLE "AgentTool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "avgQuality" REAL NOT NULL DEFAULT 0.0,
    "lastUsed" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" TEXT
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccess" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" TEXT
);

-- CreateTable
CREATE TABLE "SwarmMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "swarmId" TEXT NOT NULL,
    "memoryType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccess" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" TEXT,
    CONSTRAINT "SwarmMemory_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AgentTool_agentId_category_idx" ON "AgentTool"("agentId", "category");

-- CreateIndex
CREATE INDEX "AgentTool_agentId_successCount_idx" ON "AgentTool"("agentId", "successCount");

-- CreateIndex
CREATE UNIQUE INDEX "AgentTool_agentId_toolName_key" ON "AgentTool"("agentId", "toolName");

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_memoryType_idx" ON "AgentMemory"("agentId", "memoryType");

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_importance_idx" ON "AgentMemory"("agentId", "importance");

-- CreateIndex
CREATE INDEX "AgentMemory_agentId_lastAccess_idx" ON "AgentMemory"("agentId", "lastAccess");

-- CreateIndex
CREATE INDEX "SwarmMemory_swarmId_memoryType_idx" ON "SwarmMemory"("swarmId", "memoryType");

-- CreateIndex
CREATE INDEX "SwarmMemory_swarmId_importance_idx" ON "SwarmMemory"("swarmId", "importance");
