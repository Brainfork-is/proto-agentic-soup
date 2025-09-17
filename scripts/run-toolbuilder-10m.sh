#!/usr/bin/env bash
set -euo pipefail

# Run soup-runner in tool-builder-only mode for a fixed duration (default: 10 minutes),
# capture logs and produce a summary + CSV export for later review.

# Usage:
#   bash scripts/run-toolbuilder-10m.sh [minutes]
#
# Environment overrides (optional):
#   JOBS_PER_MIN (default 2)
#   TOOL_LOADER_SHARE_MODE (default recent)
#   LLM_MAX_TOKENS_PER_HOUR (default 5000)
#   LLM_MAX_TOKENS_PER_AGENT (default 150)
#   VERTEX_AI_TEMPERATURE (default 0.2)
#   VERTEX_AI_MAX_OUTPUT_TOKENS (default 256)

MINUTES=${1:-10}
JOBS_PER_MIN=${JOBS_PER_MIN:-10}
TOOL_LOADER_SHARE_MODE=${TOOL_LOADER_SHARE_MODE:-recent}
LLM_MAX_TOKENS_PER_HOUR=${LLM_MAX_TOKENS_PER_HOUR:-5000}
LLM_MAX_TOKENS_PER_AGENT=${LLM_MAX_TOKENS_PER_AGENT:-150}
VERTEX_AI_TEMPERATURE=${VERTEX_AI_TEMPERATURE:-0.2}
VERTEX_AI_MAX_OUTPUT_TOKENS=${VERTEX_AI_MAX_OUTPUT_TOKENS:-256}

STAMP=$(date +%Y%m%d-%H%M%S)
RUN_DIR="runs/${STAMP}-toolbuilder"
mkdir -p "$RUN_DIR"

echo "[run] Using run directory: $RUN_DIR"

# Verify Redis is reachable
if command -v redis-cli >/dev/null 2>&1; then
  if ! redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ping >/dev/null 2>&1; then
    echo "[run] ERROR: Redis not reachable at ${REDIS_HOST:-localhost}:${REDIS_PORT:-6379}" >&2
    exit 1
  fi
else
  echo "[run] WARN: redis-cli not installed; proceeding without ping"
fi

# Build workspace to ensure summarize script is available
echo "[run] Node: $(node -v) | pnpm: $(pnpm -v)"
if ! node -v | grep -qE '^v20\.'; then
  echo "[run] WARN: Repo targets Node 20. You are running $(node -v). Consider 'nvm use' for best results."
fi

echo "[run] Ensuring workspace dependencies..."
pnpm i --frozen-lockfile >/dev/null

echo "[run] Building workspace..."
pnpm -r build >/dev/null

# Quick sanity for workspace links
if [ ! -e "apps/soup-runner/node_modules/@soup/common" ]; then
  echo "[run] WARN: workspace link for @soup/common missing under apps/soup-runner/node_modules"
fi

echo "[run] Generating Prisma client for soup-runner..."
pnpm --filter @soup/soup-runner prisma:generate >/dev/null || true

# Preflight: verify @soup packages entrypoints exist
AGENTS_PKG="apps/soup-runner/node_modules/@soup/agents"
COMMON_PKG="apps/soup-runner/node_modules/@soup/common"

if [ -f "$AGENTS_PKG/package.json" ]; then
  AGENTS_MAIN_REL=$(node -e "const p=require('$AGENTS_PKG/package.json');process.stdout.write(p.main||'')" 2>/dev/null || true)
  [ -z "$AGENTS_MAIN_REL" ] && AGENTS_MAIN_REL="dist/index.js"
  AGENTS_MAIN_ABS="$AGENTS_PKG/${AGENTS_MAIN_REL}"
  if [ ! -f "$AGENTS_MAIN_ABS" ]; then
    echo "[run] WARN: @soup/agents main not found at $AGENTS_MAIN_ABS; creating fallback dist/index.js -> ./src/index.js"
    mkdir -p "$AGENTS_PKG/dist"
    echo "module.exports = require('./src/index.js');" > "$AGENTS_PKG/dist/index.js"
  fi
fi

if [ -f "$COMMON_PKG/package.json" ]; then
  COMMON_MAIN_REL=$(node -e "const p=require('$COMMON_PKG/package.json');process.stdout.write(p.main||'')" 2>/dev/null || true)
  [ -z "$COMMON_MAIN_REL" ] && COMMON_MAIN_REL="dist/index.js"
  COMMON_MAIN_ABS="$COMMON_PKG/${COMMON_MAIN_REL}"
  if [ ! -f "$COMMON_MAIN_ABS" ]; then
    echo "[run] WARN: @soup/common main not found at $COMMON_MAIN_ABS; creating fallback dist/index.js -> ./src/index.js"
    mkdir -p "$COMMON_PKG/dist"
    echo "module.exports = require('./src/index.js');" > "$COMMON_PKG/dist/index.js"
  fi
fi

# Verify dist exists
if [ ! -f "apps/soup-runner/dist/main.js" ]; then
  echo "[run] ERROR: apps/soup-runner/dist/main.js not found after build. Aborting." >&2
  exit 2
fi

# Save env used for the run
cat >"$RUN_DIR/env.used" <<EOF
TEST_TOOL_BUILDER_ONLY=1
TOOL_LOADER_SHARE_MODE=$TOOL_LOADER_SHARE_MODE
JOBS_PER_MIN=$JOBS_PER_MIN
LLM_MAX_TOKENS_PER_HOUR=$LLM_MAX_TOKENS_PER_HOUR
LLM_MAX_TOKENS_PER_AGENT=$LLM_MAX_TOKENS_PER_AGENT
VERTEX_AI_TEMPERATURE=$VERTEX_AI_TEMPERATURE
VERTEX_AI_MAX_OUTPUT_TOKENS=$VERTEX_AI_MAX_OUTPUT_TOKENS
EOF

echo "[run] Starting soup-runner (tool-builder only) for ${MINUTES} minutes..."
export TEST_TOOL_BUILDER_ONLY=1 \
  TOOL_LOADER_SHARE_MODE \
  JOBS_PER_MIN \
  LLM_MAX_TOKENS_PER_HOUR \
  LLM_MAX_TOKENS_PER_AGENT \
  VERTEX_AI_TEMPERATURE \
  VERTEX_AI_MAX_OUTPUT_TOKENS

(
  pnpm --filter @soup/soup-runner start
) >"$RUN_DIR/soup-runner.log" 2>&1 &
PID=$!
echo "[run] soup-runner PID: $PID"

# Detect early failure (within first 5s)
sleep 5
if ! kill -0 "$PID" 2>/dev/null; then
  echo "[run] soup-runner exited early. See log: $RUN_DIR/soup-runner.log" >&2
  tail -n +1 "$RUN_DIR/soup-runner.log" | sed 's/^/[log] /'
  # Generate summary anyway to snapshot manifests
  pnpm --filter @soup/soup-runner summarize -- --minutes=10 >"$RUN_DIR/summary.json" || true
  exit 3
fi

# Time-bound run
sleep "${MINUTES}m" || true

echo "[run] Stopping soup-runner (PID $PID)..."
kill "$PID" 2>/dev/null || true

# Wait briefly, then force if needed
for i in $(seq 1 15); do
  if kill -0 "$PID" 2>/dev/null; then
    sleep 1
  else
    break
  fi
done
if kill -0 "$PID" 2>/dev/null; then
  echo "[run] Force killing soup-runner (PID $PID)"
  kill -9 "$PID" 2>/dev/null || true
fi

echo "[run] Generating summary (last ${MINUTES} minutes)..."
pnpm --filter @soup/soup-runner summarize -- --minutes="$MINUTES" >"$RUN_DIR/summary.json" || true

# Detect early failure and hint
if grep -q "Cannot find module .*@soup/common" "$RUN_DIR/soup-runner.log"; then
  echo "[run] NOTE: soup-runner failed to start due to missing workspace links. Run 'pnpm i' at repo root and retry." | tee -a "$RUN_DIR/summary.json" >/dev/null || true
fi

echo "[run] Exporting recent jobs CSV..."
pnpm export-jobs -- --output "$RUN_DIR/jobs-export.csv" >/dev/null 2>&1 || true

# Snapshot manifests and generated code (if present)
MAN_DIR="packages/agents/dist/src/generated-tools/manifests"
CODE_DIR="packages/agents/dist/src/generated-tools/code"
if [ -d "$MAN_DIR" ]; then
  mkdir -p "$RUN_DIR/manifests"
  cp -R "$MAN_DIR/." "$RUN_DIR/manifests/" || true
fi
if [ -d "$CODE_DIR" ]; then
  mkdir -p "$RUN_DIR/code"
  cp -R "$CODE_DIR/." "$RUN_DIR/code/" || true
fi

echo "[run] Done. Outputs:"
echo "  - $RUN_DIR/soup-runner.log"
echo "  - $RUN_DIR/summary.json"
echo "  - $RUN_DIR/jobs-export.csv"
if [ -d "$RUN_DIR/manifests" ]; then echo "  - $RUN_DIR/manifests/ (snapshot)"; fi
if [ -d "$RUN_DIR/code" ]; then echo "  - $RUN_DIR/code/ (snapshot)"; fi
