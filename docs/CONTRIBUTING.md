# Contributing Guide

## Code Style & Formatting

- Use TypeScript targeting Node (CommonJS). Shared compiler settings in `tsconfig.base.json`.
- Formatting is enforced by Prettier:
  - 2 spaces, semicolons, single quotes, print width 100.
  - Configured in `.prettierrc.json`; ignore patterns in `.prettierignore`.
- Linting uses ESLint with `@typescript-eslint` and `plugin:prettier/recommended`.
- Naming:
  - `camelCase` for variables/functions
  - `PascalCase` for classes/types
  - `kebab-case` for file and package names

## Required Checks Before PRs

- Format: `pnpm format` (or `pnpm format:check`)
- Lint: `pnpm lint` (or `pnpm lint:fix`)
- Build: `pnpm -r build`

## Repo Commands

- Install: `pnpm i`
- Dev run: `pnpm dev`
- Start from dist: `pnpm start`
- Prisma (runner only): `pnpm prisma:generate` / `pnpm prisma:migrate`
- Redis: run locally on 6379 (e.g., `brew services start redis` or `pnpm redis:start`)

## Editor Setup

- Enable Prettier “format on save”.
- Enable ESLint plugin for TypeScript.

## Scope Notes

- Tests: co-locate as `*.test.ts` or under `src/__tests__/` (Vitest/Jest suggested).
- Do not commit secrets. Use `.env` locally; document new env keys under `docs/`.
