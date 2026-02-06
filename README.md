# Agentic Soup

Agentic Soup is a TypeScript monorepo for experimenting with autonomous agent orchestration,
job generation, grading, and tool-building workflows.

This repository currently ships one runnable app (`soup-runner`) plus shared libraries in
`packages/`.

## What Is In This Repo

- `apps/soup-runner`: Fastify + BullMQ runner that orchestrates jobs/agents and exposes system APIs.
- `packages/agents`: Agent implementations, LLM provider adapters, tool builders, and memory services.
- `packages/common`: Shared config loading, logging, metrics, and common types.
- `packages/mcp-servers/tool-examples`: Example MCP server package.
- `docs/`: Specifications, plans, and contributor-facing documentation.

## Requirements

- Node `20.x` (see `.nvmrc` and `package.json#engines`)
- pnpm `9.x`
- Redis on `localhost:6379` for full runner mode

## Quick Start

```bash
nvm use
corepack enable && corepack prepare pnpm@9.0.0 --activate
pnpm i
```

Create a local `.env` from `.env.example` and set any provider-specific values you need.

### Run in dev mode

```bash
pnpm dev
```

This starts `@soup/soup-runner` in watch mode and writes output to `soup-runner.log`.

### Run from build output

```bash
pnpm build
pnpm start
```

## Full Runner Setup (Redis + Prisma)

```bash
pnpm redis:start
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

If you only want a lightweight boot mode for health checks, set `SOUP_BOOTSTRAP=1` in your `.env`.

## Common Commands

- `pnpm dev`: Run `soup-runner` in watch mode.
- `pnpm start`: Run built `soup-runner`.
- `pnpm build`: Build all workspace packages/apps.
- `pnpm lint`: Run ESLint across workspace.
- `pnpm lint:fix`: Auto-fix lint issues.
- `pnpm format`: Format source files with Prettier.
- `pnpm format:check`: Verify formatting.
- `pnpm test`: Workspace test hook (currently placeholder in packages).

## Environment Notes

- Config is loaded via `dotenv` from project root `.env`.
- Do not commit secrets; `.env` files are ignored and `.env.example` contains placeholders only.
- Key runtime values are documented in `.env.example` and `packages/common/src/config.ts`.

## Contributing

Before opening a PR:

```bash
pnpm format:check
pnpm lint
pnpm -r build
```

See `docs/CONTRIBUTING.md` for coding standards and workflow expectations.
