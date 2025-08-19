# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agentic Soup is an experimental TypeScript/Node.js system that simulates "survival of the fittest" dynamics among LangGraph.js software agents competing for LLM-generated jobs. It uses a microservices architecture with three main services (soup-runner, browser-gateway, site-kb) backed by Redis and SQLite, with Google Vertex AI providing the intelligence layer.

## Development Commands

### Initial Setup

```bash
nvm use                    # Switch to Node 20.x (required)
corepack enable           # Enable pnpm
pnpm i                    # Install all dependencies
```

### Running Services

```bash
# Start infrastructure
pnpm redis:up             # Start Redis container
pnpm redis:down           # Stop Redis container

# Database setup
pnpm --filter @soup/soup-runner prisma:generate  # Generate Prisma client
pnpm --filter @soup/soup-runner prisma:migrate   # Run migrations

# Development mode (starts all services)
pnpm dev                  # Runs all three services concurrently

# Debug logs are written to console and files
# System automatically creates debug output for monitoring

# Individual services
pnpm --filter @soup/soup-runner dev        # Main orchestrator (port 3000)
pnpm --filter @soup/browser-gateway dev    # Browser API (port 3100)
pnpm --filter @soup/site-kb dev            # Knowledge base (port 3200)
```

### Code Quality

```bash
pnpm format               # Format code with Prettier
pnpm lint                # Run ESLint checks
pnpm -r build            # Build all packages (TypeScript compilation)
```

### Testing

```bash
# Currently minimal test setup - tests are placeholders
pnpm test                # Run tests (when implemented)
```

### System Management

```bash
# Check system status (agents, jobs, tools, backups)
pnpm status              # Show comprehensive system status

# Export job data to CSV
pnpm export-jobs         # Export last 50 jobs
pnpm export-jobs -- --all --output filename.csv  # Export all jobs to custom file

# Reset system with backup
pnpm reset               # Creates timestamped backup then resets everything
```

## Architecture

### Service Architecture

```
soup-runner (3000) ←→ browser-gateway (3100) ←→ site-kb (3200)
        ↓
    Redis (6379)
    SQLite (Prisma)
```

### Key Directories

- `/apps/soup-runner/`: Main orchestrator - job generation, agent workers, economics
- `/apps/browser-gateway/`: Playwright-based browser automation API
- `/apps/site-kb/`: Static website serving as local "internet" for agents
- `/packages/common/`: Shared types, utilities, and configuration
- `/packages/agents/`: Agent implementations and tool adapters

### Technology Stack

- **Runtime**: Node.js 20.x (strict requirement)
- **Language**: TypeScript with CommonJS modules
- **Framework**: Fastify (all services)
- **Database**: SQLite with Prisma ORM
- **Queue**: Redis with BullMQ
- **Browser**: Playwright
- **Config**: Zod-validated environment variables

## Key Patterns

### Error Handling Philosophy

**NO MOCKS OR FALLBACKS**: When something fails, it should fail gracefully and log the failure. Do not add mock implementations or fallback behaviors. Let failures be visible and debuggable. This applies to:
- LLM plan parsing failures
- Tool execution failures  
- API call failures
- Any other errors

If an agent can't generate a valid plan or execute a task, it should simply fail with proper logging rather than falling back to mock behavior.

### Workspace Structure

This is a pnpm workspace monorepo. Import packages using `@soup/` prefix:

```typescript
import { Blueprint, AgentState } from '@soup/common';
```

### Environment Configuration

All services use Zod-validated configs loaded from `.env`:

```typescript
// packages/common/src/config.ts defines the schema
import { loadConfig } from '@soup/common';
const config = loadConfig();
```

### Database Operations

Use Prisma client for all database operations:

```typescript
// apps/soup-runner/src/prisma/client.ts
import { prisma } from './prisma/client';
```

### Job Processing

Jobs are processed through BullMQ queues with deterministic grading:

- Jobs have categories: `web_research`, `summarize`, `classify`, `math`
- Each job type has specific auto-graders in `apps/soup-runner/src/services/graders/`

### Agent Tools

LangGraph agents have access to structured tools with proper Zod schemas:

- `calculator`: Mathematical expression evaluation
- `text_processor`: Summarization and classification operations  
- `browser`: Web navigation and content extraction
- `knowledge_retrieval`: Knowledge base search with MCP integration

## Development Guidelines

### Code Style

- TypeScript strict mode enabled
- Prettier: 2 spaces, single quotes, 100 char lines
- File naming: kebab-case for files, PascalCase for types, camelCase for variables

### Adding New Features

1. For new job types: Add grader in `apps/soup-runner/src/services/graders/` and update JobGenerator templates
2. For new agent tools: Implement in `packages/agents/src/langgraph/tools/index.ts` with proper Zod schemas
3. For new agent archetypes: Add to `seeds/archetypes.json`
4. For schema changes: Edit `apps/soup-runner/src/prisma/schema.prisma` and run migrations
5. For workflow changes: Modify nodes in `packages/agents/src/langgraph/nodes/`

### Common Tasks

- **Add a new job category**: Update `JobCategory` enum in schema, implement grader
- **Modify agent economics**: Adjust costs/payouts in `.env`
- **Change reproduction rules**: Edit `apps/soup-runner/src/services/lifecycle.ts`
- **Debug agent behavior**: Check logs and `/apps/soup-runner/src/services/workers.ts`

## Important Files

- `apps/soup-runner/src/prisma/schema.prisma`: Database schema
- `packages/common/src/config.ts`: Environment configuration schema
- `seeds/archetypes.json`: Initial agent definitions
- `apps/soup-runner/src/main.ts`: Main orchestrator entry point
- `packages/agents/src/langgraph/LangGraphAgent.ts`: Core agent implementation
- `packages/agents/src/jobGenerator.ts`: Vertex AI job generation
- `.env.example`: Environment variable template
- `docs/VERTEX_AI_CONFIGURATION.md`: Vertex AI setup guide

## Important Notes for Claude Code

### Background Process Management

When running development servers or any background processes:

1. **Always kill background processes when done**: Use `KillBash` for any processes started with `run_in_background: true`
2. **Check for running processes**: Use `ps aux | grep -E "pnpm|tsx|node"` to find lingering processes
3. **Clean up ports**: If ports are in use, check with `lsof -i :PORT` and kill processes as needed
4. **Never leave processes running**: Always clean up at task completion or before ending the session

### Environment Setup

- The soup-runner needs a local `.env` file with `DATABASE_URL=file:./dev.db` for Prisma
- Redis must be running (`pnpm redis:up`) before starting the full system
- Database must be initialized (`pnpm prisma:migrate`) before first run

### Pre-Push Checklist

**ALWAYS run these commands before committing/pushing changes:**

```bash
# Format all code
pnpm format

# Verify formatting passes
pnpm format:check

# Verify linting passes  
pnpm lint

# Generate Prisma client (if schema changed)
pnpm prisma:generate

# Test build passes
pnpm --filter @soup/common build
pnpm --filter @soup/agents build  
pnpm --filter @soup/browser-gateway build
pnpm --filter @soup/site-kb build
pnpm --filter @soup/build-agent build
pnpm --filter @soup/soup-runner build
```

**Why this matters:** The CI pipeline runs these exact checks. Failing to run them locally will cause CI failures and delay PR merges. Always verify locally before pushing.
