-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Blueprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" INTEGER NOT NULL,
    "llmModel" TEXT NOT NULL,
    "temperature" REAL NOT NULL,
    "tools" TEXT NOT NULL,
    "archetype" TEXT NOT NULL DEFAULT 'research-specialist',
    "coopThreshold" REAL NOT NULL,
    "minBalance" INTEGER NOT NULL,
    "mutationRate" REAL NOT NULL,
    "maxOffspring" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Blueprint" ("coopThreshold", "createdAt", "id", "llmModel", "maxOffspring", "minBalance", "mutationRate", "temperature", "tools", "version") SELECT "coopThreshold", "createdAt", "id", "llmModel", "maxOffspring", "minBalance", "mutationRate", "temperature", "tools", "version" FROM "Blueprint";
DROP TABLE "Blueprint";
ALTER TABLE "new_Blueprint" RENAME TO "Blueprint";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
