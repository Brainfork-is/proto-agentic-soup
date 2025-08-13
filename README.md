# agentic-soup (MVP + Web Browsing, with Agents)
Single-machine MVP with Redis, SQLite, Playwright, and agent workers. See quickstart in README after unzip.

## Development

- Monorepo managed by `pnpm` workspaces with apps in `apps/` and packages in `packages/`.
- Install deps: `pnpm i`
- Build all: `pnpm -r build`
- Dev run: `pnpm dev`

## Code Style & Formatting

- Prettier is required for formatting. Rules are defined in `.prettierrc.json` (2 spaces, semicolons, single quotes, width 100).
- ESLint enforces TypeScript best practices and integrates with Prettier via `plugin:prettier/recommended`.
- Before committing or opening a PR:
  - Format: `pnpm format` (or check only: `pnpm format:check`)
  - Lint: `pnpm lint` (auto-fix: `pnpm lint:fix`)
  - Build: `pnpm -r build`

See `docs/CONTRIBUTING.md` for full contributor guidelines.
