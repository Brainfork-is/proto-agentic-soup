# Capabilities: composition-first tools for LangGraph

**What**: a tiny contract around tools (typed I/O, permissions, costs) + a **mini subgraph executor** so the planner can **compose** existing blocks before resorting to codegen.  
**Why**: your spec calls out rigid templates and envisions tool composition. This delivers that without disrupting LangGraph or your dynamic tool loader.

## Contract

- `meta`: `name`, `version`, `description`, `permissions`, `costs`, `stability`
- `input`/`output`: Zod schemas
- `impl(input, ctx)`: async function with runtime `ctx` (providers, policy, budget)

## Composition spec

A JSON object with nodes/edges/expose. The `CompositionExecutor` runs it safely:
- validates I/O at each capability
- enforces declared `permissions` against policy
- checks estimated cost against budget

Example (URL → 5-bullet brief):

```json
{
  "name": "url_exec_brief",
  "version": "0.1.0",
  "description": "Reads a URL and returns a 5-bullet executive brief with citations.",
  "permissions": ["http", "llm"],
  "inputSchema": { "type": "object", "properties": {"url": {"type": "string", "format": "uri"}}, "required": ["url"] },
  "outputSchema": { "type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"] },
  "composition": {
    "nodes": [
      { "id": "read", "cap": "browser_readable", "args": { "url": "$.input.url" } },
      { "id": "summ", "cap": "summarize", "args": { "text": "$.nodes.read.text", "style": "5 bullets; include 2 anchors" } }
    ],
    "edges": [["read", "summ"]],
    "expose": { "summary": "$.nodes.summ.summary" }
  }
}
```

Generator prompts

planner.md: produce a capability spec; prefer composition of available capabilities; respect policy/budget.

toolsmith.md: only implement code files if composition can't satisfy requirements.

critic.md: check schemas, permissions, runtime, and tests before admitting to registry.

This implements your "Proposed Enhancements" around flexible templates and composition.
