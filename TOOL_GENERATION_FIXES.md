# Tool Generation Fixes - System Improvements

## Summary

Fixed the two critical systemic issues causing ~600 job failures (80-90% of all failures):

1. **webResearch called during tool loading** (261 occurrences)
2. **validator API misuse** (341 occurrences)

## Root Cause Analysis

### Issue #1: webResearch Function Called During Tool Loading

**Problem:** Generated tools call `webResearch()` at module top-level, not inside `invoke()` method.

**Example of broken code:**
```javascript
// ❌ Called during loading - causes immediate failure
const defaultData = await webResearch("company info");

const myTool = {
  async invoke(params) {
    // This never gets reached
  }
};
```

**Fix:** Added explicit rules to code generation prompt and static analysis validation.

---

### Issue #2: "success is not defined" Errors

**Problem:** Tools use `validator.isString()`, `validator.isArray()` which don't exist in validator.js.

**Example of broken code:**
```javascript
// ❌ validator.isString doesn't exist
if (!validator.isString(value)) { ... }

// ✅ Correct approach
if (typeof value !== 'string') { ... }
```

**Fix:** Added validator API documentation to prompt and auto-fix transformations.

---

## Implemented Solutions

### 1. Enhanced Code Generation Prompt

**File:** `packages/agents/src/tools/codeGenerator.ts` (lines 236-291)

**Changes:**
- Added **CRITICAL: webResearch() PLACEMENT RULES** section with clear examples
- Added **CRITICAL: VALIDATOR PACKAGE USAGE** section with valid methods
- Emphasized these are the two most common errors
- Provided correct vs incorrect patterns side-by-side

### 2. Static Analysis Before Saving Tools

**File:** `packages/agents/src/tools/codeGenerator.ts` (lines 106-143)

**Features:**
- Validates code **before** saving to filesystem
- Checks for top-level async calls (webResearch, fetchWebContent, axios)
- **Auto-fixes** validator API misuse by transforming to native JavaScript
- Warns about duplicate const declarations

**Example auto-fix:**
```javascript
// Before auto-fix
if (!validator.isString(x)) { ... }

// After auto-fix
if (!(typeof x === "string")) { ... }
```

### 3. Validation During Tool Loading

**File:** `packages/agents/src/tools/dynamicToolLoader.ts` (lines 498-517)

**Features:**
- Validates code before attempting to load into registry
- Rejects tools with top-level async calls immediately
- Rejects tools with validator API misuse
- Provides clear error messages for debugging

### 4. MCP Server for Tool Examples

**Location:** `packages/mcp-servers/tool-examples/`

**Purpose:** Allow code generator to learn from real, working tools rather than static examples.

**Tools Provided:**
- `search_successful_tools` - Find tools by keywords with high success rates
- `get_tool_by_pattern` - Find tools using specific patterns (webResearch, validator, etc.)
- `get_similar_tools` - Find tools with similar task descriptions

**How it works:**
1. Indexes all generated tool manifests
2. Filters by success rate (successCount / usageCount)
3. Searches code and descriptions for relevance
4. Returns highest-performing, most relevant examples

**Future Integration:** The code generator can call this MCP server before generating new tools to get relevant examples.

---

## Files Modified

### Core Fixes
1. `packages/agents/src/tools/codeGenerator.ts`
   - Enhanced prompt with webResearch rules (lines 236-253)
   - Added validator API documentation (lines 255-275)
   - Added static analysis before save (lines 106-143)

2. `packages/agents/src/tools/dynamicToolLoader.ts`
   - Added validation during tool loading (lines 498-517)
   - Improved fallback mechanism for transformation errors (lines 416-442)

### New Infrastructure
3. `packages/mcp-servers/tool-examples/` - Complete MCP server implementation
   - `src/index.ts` - Main server logic
   - `package.json` - Dependencies and scripts
   - `tsconfig.json` - TypeScript configuration
   - `README.md` - Documentation

4. `pnpm-workspace.yaml` - Added mcp-servers to workspace

---

## Expected Impact

### Before Fixes
- **~600 failed jobs** in sample dataset
- **261 webResearch errors**
- **341 validator errors**
- **~80-90% failure rate** from these two issues alone

### After Fixes
- **Static analysis prevents bad tools from being saved**
- **Loading validation catches remaining issues**
- **Auto-fix transformations correct validator usage**
- **Clear prompt instructions guide LLM to correct patterns**

**Expected reduction:** 80-90% fewer tool-related failures

---

## Testing the Fixes

### 1. Test Static Analysis

Generate a tool with intentional errors:

```bash
# The code generator should reject this tool during static analysis
pnpm dev

# Watch for log: "[CodeGeneratorTool] STATIC ANALYSIS FAILED: ..."
```

### 2. Test Loading Validation

If a bad tool somehow gets saved:

```bash
# The loader should reject it during loading
pnpm dev

# Watch for log: "[DynamicToolLoader] Tool X calls async functions at top level - rejecting"
```

### 3. Test Auto-Fix

Generate a tool that uses `validator.isString`:

```bash
# Should see log: "[CodeGeneratorTool] Auto-fixed validator API calls..."
```

### 4. Test MCP Server

```bash
cd packages/mcp-servers/tool-examples
pnpm build
node dist/index.js

# Send test request (via MCP client or Claude Desktop)
```

---

## Next Steps

### Short Term
1. **Monitor logs** for new tool generation to verify fixes are working
2. **Reset system** and run for 24 hours to collect success metrics
3. **Compare failure rates** before/after to validate impact

### Medium Term
1. **Integrate MCP server** with code generator to provide real examples
2. **Add telemetry** to track which fixes are most effective
3. **Expand validation** to catch other common patterns

### Long Term
1. **Machine learning** on successful tool patterns
2. **Automated tool refinement** based on execution metrics
3. **Pattern library** of proven tool implementations

---

## Configuration Changes

### pnpm Workspace
Added MCP servers to workspace configuration:

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'packages/mcp-servers/*'  # Added
  - 'infra/*'
  - 'seeds'
```

### Claude Desktop (Optional)
To use the MCP server with Claude Desktop:

```json
{
  "mcpServers": {
    "tool-examples": {
      "command": "node",
      "args": [
        "/absolute/path/to/agentic-soup/packages/mcp-servers/tool-examples/dist/index.js"
      ]
    }
  }
}
```

---

## Maintenance

### Adding New Validations

To add new static analysis checks:

1. Edit `packages/agents/src/tools/codeGenerator.ts` (after line 143)
2. Add validation pattern
3. Optionally add auto-fix transformation
4. Add corresponding prompt documentation

### Updating MCP Server

To add new MCP tools or improve ranking:

1. Edit `packages/mcp-servers/tool-examples/src/index.ts`
2. Add new tool in `ListToolsRequestSchema` handler
3. Implement tool logic in `CallToolRequestSchema` handler
4. Rebuild with `pnpm build`

---

## References

- Original analysis: See logs in `backups/reset-20251001-093711/`
- Error counts from CSV: ~600 failed jobs analyzed
- webResearch errors: 261 occurrences
- validator errors: 341 occurrences
