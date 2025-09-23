# Agentic Soup — MVP with Web Browsing

Agentic Soup is a single‑machine experiment to observe basic “survival of the fittest” dynamics among software agents competing for work. It runs a small market of deterministic jobs, a pool of agents with minimal tools, and a browser gateway over a tiny local website — all in TypeScript/Node on your machine.

Why: Cheap/fast agent creation + open inter‑agent communication + selection pressure (costs/rewards) should lead to a few high‑fitness “super‑agents” capturing most throughput. This repo provides the substrate to test early signals of that behavior.

Core stack: Fastify services, Redis (BullMQ queues), SQLite (Prisma), Playwright, TypeScript monorepo (pnpm).
Agent runtime: We are adopting LangChain.js Tools and LangGraph.js to model the agent loop as a small graph (plan → act → reflect → learn). The current `SimpleAgent` heuristic is a stopgap to enable local runs without LLM keys.

## Architecture

```text
                           ┌───────────────────────────┐
                           │        site-kb (3200)     │
                           │  Fastify static website   │
                           │  / (RAG guides, docs)     │
                           └──────────────┬────────────┘
                                          │ (browse)
                              HTTP        │
                                          ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  soup-runner (3000)          │    │  browser-gateway (3100)      │
│  Fastify API + Orchestrator  │    │  Fastify + Playwright        │
│  - Job generator (BullMQ)    │◀──▶│  - /run: click/type/wait     │
│  - Auto-graders + bank       │    │  - /healthz                  │
│  - /healthz, /leaderboard    │    └──────────────────────────────┘
│                              │
│  Agents (workers)            │   ┌────────────────────────────────┐
│  - SimpleAgent (temp)        │   │   Redis (6379)                 │
│  - Tools: browser, stringKit │◀──┤   BullMQ queues (jobs)         │
│           calc, retrieval    │   └────────────────────────────────┘
│  - Target: LangGraph.js      │
│                              │
│  State: Prisma + SQLite      │
└──────────────┬───────────────┘
               │
               ▼
        SQLite dev.db (Prisma)
```

Default ports

- soup-runner: `3000` (API: `/healthz`, `/leaderboard`)
- browser-gateway: `3100` (API: `/healthz`, `/run`)
- site-kb: `3200` (static pages agents browse)
- Redis: `6379` (local service)

Key behaviors

- Job categories: `web_research`, `summarize`, `classify`, `math` (deterministic graders).
- Costs/rewards: browser steps charged; payouts on success; penalties on failure.
- Evolution hooks (MVP level): simple reproduction and culling at epoch boundaries.

## Development

- Monorepo managed by `pnpm` workspaces with apps in `apps/` and packages in `packages/`.
- Use pnpm (not npm). If pnpm isn’t available, enable Corepack (Node 18+):
  - `corepack enable && corepack prepare pnpm@9.0.0 --activate`
- Install deps: `pnpm i`
- Build all: `pnpm -r build`
- Dev run: `pnpm dev`

Notes:

- Node 20.x LTS is pinned for this repo. Use `nvm use` (reads `.nvmrc`), or Volta (auto-picks from `package.json#volta`). Newer majors (e.g., Node 23) may emit deprecation warnings and have ecosystem incompatibilities.
- To run the full runner (not bootstrap), start a local Redis server and generate Prisma client:
  - Start Redis on 6379 (e.g., `brew services start redis` or `pnpm redis:start`)
  - `pnpm --filter @soup/soup-runner prisma:generate`
  - Then run `pnpm --filter @soup/soup-runner dev` after unsetting `SOUP_BOOTSTRAP` or use `start` from dist.

## Quickstart

1. Use Node 20 and pnpm

- `nvm use` (or install Node 20.x)
- `corepack enable && corepack prepare pnpm@9.0.0 --activate`

2. Install and run

- `pnpm i`
- `pnpm dev`
  - site-kb on 3200, browser-gateway on 3100
  - soup-runner starts in bootstrap mode (health only) to avoid Redis/Prisma requirements on first run

3. Full run (agents + jobs)

- Start Redis locally on 6379 (e.g., `brew services start redis` or `pnpm redis:start`)
- `pnpm --filter @soup/soup-runner prisma:generate` (generate Prisma client for SQLite)
- `pnpm --filter @soup/soup-runner dev` (ensure `SOUP_BOOTSTRAP` is not set)

## Repo Layout

- `apps/`
  - `browser-gateway/`: Playwright HTTP API for deterministic browsing
  - `site-kb/`: local knowledge-base website with static pages
  - `soup-runner/`: orchestrator (jobs, graders, bank, metrics, agents)
- `packages/`
  - `common/`: shared types/util, metrics (Gini), seeds
  - `agents/`: SimpleAgent (temporary) + tool adapters (`browserRun`, `stringKit`, `calc`, `retrieval`). Will be refactored to LangGraph.js + LangChain.js.
- `infra/`: (legacy) Docker files; Redis is expected to run locally now
- `docs/`: spec and tickets (`tech-spec.md`, `tickets.md`)

## Code Style & Formatting

- Prettier is required for formatting. Rules are defined in `.prettierrc.json` (2 spaces, semicolons, single quotes, width 100).
- ESLint enforces TypeScript best practices and integrates with Prettier via `plugin:prettier/recommended`.
- Before committing or opening a PR:
  - Format: `pnpm format` (or check only: `pnpm format:check`)
  - Lint: `pnpm lint` (auto-fix: `pnpm lint:fix`)
  - Build: `pnpm -r build`

See `docs/CONTRIBUTING.md` for full contributor guidelines.
