# Build Agent CLI

Automates ticket selection, prompt creation for Codex CLI, optional invocation, checkoff, and Git workflow.

## Usage

- Generate prompt for next open ticket:
  - `pnpm --filter @soup/build-agent dev` (watch) or
  - `pnpm --filter @soup/build-agent start` after build

Examples:

- Select by id and write prompt: `node dist/main.js --id M-1`
- Also mark done and commit on a new branch: `node dist/main.js --id M-1 --check-off --commit`
- Try PR via GitHub CLI: `node dist/main.js --id M-1 --check-off --commit --create-pr`
- Invoke Codex CLI if installed: `node dist/main.js --id M-1 --run-codex "codex --prompt {file}"`

Outputs:

- Prompt written to `docs/agent-prompts/<ID>.md`
- Ticket checkbox toggled in `docs/tickets.md` (with `--check-off`)
- Branch `feat/<id>-<slug>` with a conventional commit (with `--commit`)

Notes:

- Requires local `git` and optional `gh` (GitHub CLI) for PRs.
- No network calls are made except optional `gh pr create`.
