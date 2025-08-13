# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by `pnpm` workspaces. Key folders:
  - `apps/`: runnable services — `browser-gateway` (Playwright gateway), `site-kb` (static KB), `soup-runner` (agents + jobs + Prisma).
  - `packages/`: shared libraries — `common`, `agents`.
  - `infra/`: Docker and ops; `docker-compose.yml` starts Redis.
  - `docs/`: specs and tickets; `seeds/`: data archetypes.
- Source lives under `src/`; builds output to `dist/` (entrypoints like `src/main.ts`).

## Build, Test, and Development Commands
- Root:
  - `pnpm dev`: run gateway, site, and runner in watch mode.
  - `pnpm start`: run all apps from `dist/`.
  - `pnpm build`: type-check and compile all packages/apps.
  - `pnpm lint`: placeholder across workspace.
  - `pnpm test`: workspace test hook (no tests yet).
- Data & services:
  - `pnpm prisma:generate` / `pnpm prisma:migrate` (scoped to `apps/soup-runner`).
  - `cd infra && docker compose up -d` to start Redis (localhost:6379).

## Coding Style & Naming Conventions
- Language: TypeScript targeting Node; commonjs packaging. Shared config in `tsconfig.base.json`.
- Indentation: 2 spaces; semicolons required; single quotes in TS.
- Names: `camelCase` for functions/vars, `PascalCase` for classes/types, `kebab-case` for file and package names.
- Exports: prefer named exports from `index.ts` in libraries; app entry at `src/main.ts`.

## Testing Guidelines
- Current state: no automated tests. Add unit tests per package/app.
- Conventions: place tests next to code as `*.test.ts` or under `src/__tests__/`.
- Suggested tools: Vitest or Jest. Run via package script and wire into root `pnpm test`.

## Commit & Pull Request Guidelines
- Commits: prefer Conventional Commits, e.g. `feat(runner): add job retry` or `fix(gateway): handle 429`.
- PRs: concise title, summary of changes, linked issues, and local-run notes. Include screenshots for `site-kb` UI changes and logs for `browser-gateway` flows.
- Checks: ensure `pnpm build` passes and database migrations (if any) are included.

## Security & Configuration Tips
- Environment: load with `dotenv`. Example `.env` for runner: `DATABASE_URL="file:./dev.db"` and `REDIS_URL="redis://localhost:6379"`.
- Avoid committing secrets. Add new env keys to README or `docs/` and reference where consumed.
