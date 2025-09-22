# Tool Builder Pipeline Refactor Plan

## Goal
Replace the current LangChain React agent flow with a deterministic builder → runner pipeline so that every generated tool is executed at least once and the final response contains the tool output. Success looks like ≥30% of tool-builder jobs completing with a non-code generator tool result during 10‑minute harness runs.

## Architecture Overview

1. **Builder Agent**
   - Responsibilities: decide whether to reuse an existing tool or draft a new spec; output a structured `GeneratedToolRequest`.
   - Implementation: single LLM call with strict JSON schema enforced by our validator (no LangChain planner).
   - Output: `{ reuseTool?: string, createTool?: GeneratedToolRequest, executionArgs?: Record<string, unknown> }`.

2. **Tool Registry & Loader**
   - After `createTool`, synchronously persist manifest/code, reload the dynamic loader, and return a hydrated tool instance.
   - Registry API must expose `loadToolByName` returning executable handles for Runner.

3. **Runner Agent**
   - Responsibilities: execute the selected tool (new or reused) with concrete arguments, capture the output, and summarise for the job record.
   - Implementation: direct invocation of `dynamicToolLoader.executeTool`; optional second LLM call to polish the final answer using tool output and job prompt.

4. **Orchestrator Flow**
   - Step A: call Builder.
   - Step B: if `createTool`, run CodeGenerator and reload registry.
   - Step C: select tool name (`reuseTool` or newly created) and assemble `executionArgs` (fall back to Builder-suggested args or heuristics based on prompt).
   - Step D: call Runner, gather execution logs, return structured job result.
   - Step E: persist run metadata (tool used, args, success flag) for grading.

5. **Grading & Strict Mode**
   - Strict mode becomes configurable via `TOOL_BUILDER_STRICT_MODE`. When disabled the pipeline still prefers tool execution but will not fail automatically if the builder insists no tool fits; we still record that as a miss for metrics.

## Implementation TODOs

- [x] Define new TypeScript interfaces (`BuilderPlan`, `RunnerResult`) under `packages/agents/src/types.ts`.
- [x] Implement `builderPlan(job: JobData)` in `packages/agents/src/toolBuilder/builder.ts` (single LLM call with JSON schema validation and retries).
- [x] Implement `runnerExecute(toolName: string, args: Record<string, unknown>)` in `packages/agents/src/toolBuilder/runner.ts` (direct loader execution + optional LLM summary step).
- [x] Add orchestrator function `handleToolBuilderJob(job)` in `ToolBuilderAgent` that wires builder → registry reload → runner.
- [x] Remove LangChain React agent usage and associated helper code from `ToolBuilderAgent.ts`.
- [x] Update dynamic loader to expose `ensureTool(name)` that reloads manifests and returns both metadata + executable.
- [x] Extend logging so every job records: selected tool, whether it was newly created, execution args, execution result snippet.
- [x] Update summarise script to include success rate by tool usage vs planner-only responses.
- [x] Add configuration flag `TOOL_BUILDER_STRICT_MODE` (already read) to builder prompt instructions.
- [x] Verify reset/run harness: run `scripts/run-toolbuilder-10m.sh` with strict mode on/off and capture success metrics.
- [x] Document new flow in `docs/tool-builder-refactor.md` (this file) and update README if necessary.

## Current Implementation Status

- `packages/agents/src/types.ts` now houses the shared `BuilderPlan`, `RunnerInput`, and `RunnerResult` contracts consumed across the pipeline.
- `packages/agents/src/toolBuilder/builder.ts` performs a single-shot LLM plan with JSON retries, while `runner.ts` executes the chosen tool and summarises the output.
- `ToolBuilderAgent.handle` orchestrates plan → optional code generation → dynamic loader reload → runner execution, returning structured metadata (`selectedTool`, `executionArgs`, `toolOutputSnippet`) for downstream analytics.
- `DynamicToolLoader` exposes `ensureTool` so the orchestrator can guarantee the selected tool is materialised before execution.
- `apps/soup-runner/src/summarize-run.ts` folds in Redis-derived telemetry to report success rates for tool executions versus planner-only responses.

## Validation Plan

1. Run `pnpm --filter @soup/agents build` and `pnpm --filter @soup/soup-runner build`.
2. Execute `TOOL_BUILDER_STRICT_MODE=1 bash scripts/run-toolbuilder-10m.sh` until ≥30% success is observed.
3. Repeat with `TOOL_BUILDER_STRICT_MODE=0` to confirm relaxed mode behaves sensibly.
4. Store latest run summaries under `runs/<timestamp>-toolbuilder/` for review.
