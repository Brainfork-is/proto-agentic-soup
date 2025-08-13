# agentic-soup (MVP + Web Browsing, with Agents)
Single-machine MVP with Redis, SQLite, Playwright, and agent workers. See quickstart in README after unzip.

## Development

- Monorepo managed by `pnpm` workspaces with apps in `apps/` and packages in `packages/`.
- Use pnpm (not npm). If pnpm isn’t available, enable Corepack (Node 18+):
  - `corepack enable && corepack prepare pnpm@9.0.0 --activate`
- Install deps: `pnpm i`
- Build all: `pnpm -r build`
- Dev run: `pnpm dev`

Notes:
- Node 20.x LTS is recommended. Newer majors (e.g., Node 23) may emit deprecation warnings and have ecosystem incompatibilities.
- To run the full runner (not bootstrap), start Redis (`cd infra && docker compose up -d`) and generate Prisma client:
  - `pnpm --filter @soup/soup-runner prisma:generate`
  - then run `pnpm --filter @soup/soup-runner dev` after unsetting `SOUP_BOOTSTRAP` or use `start` from dist.

## Code Style & Formatting

- Prettier is required for formatting. Rules are defined in `.prettierrc.json` (2 spaces, semicolons, single quotes, width 100).
- ESLint enforces TypeScript best practices and integrates with Prettier via `plugin:prettier/recommended`.
- Before committing or opening a PR:
  - Format: `pnpm format` (or check only: `pnpm format:check`)
  - Lint: `pnpm lint` (auto-fix: `pnpm lint:fix`)
  - Build: `pnpm -r build`

See `docs/CONTRIBUTING.md` for full contributor guidelines.
