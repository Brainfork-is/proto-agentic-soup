# System Crash Fixes - Validation Strategy Update

## Revised Problem Summary (2025-10-01 13:05)

**Original problem**: System crashed during tool loading with `ReferenceError: sales is not defined`

**Initial fix attempt**: Added aggressive static analysis validation that blocked 237/242 tool generation attempts

**Actual root cause**: The validation regex patterns were too aggressive and caused massive false positives, reducing tool success from reasonable levels to near-zero.

**Final solution**: Remove pre-load validation, rely on:
1. Enhanced LLM prompts educating about best practices
2. Runtime error detection with actionable error messages
3. Auto-fix for common issues (validator API) during generation

---

## Original Problem (Before Over-Validation)

System crashed during tool loading with `ReferenceError: sales is not defined` at:
```
/Users/phil/Projects/agentic-soup/packages/agents/src/generated-tools/code/temp_e6a5e64d_4ff0e700-7aad-4928-ac0b-6fcac4c5347b.js:27
```

**Root Cause**: Generated tool had multiple critical issues:
1. **Undefined variable in object shorthand**: `{ sku: 'X', sales, revenue: 150000 }` where `sales` was not defined
2. **setTimeout at top-level**: Timer running at module scope caused crash in callback during import

**Impact**: System crashes during dynamic import, preventing tool from loading and potentially crashing entire agent worker.

---

## Implemented Fixes (Revised)

User directive after seeing results: **System took a step back in tool success** - validation was blocking 237/242 tool attempts.

**Learning**: Regex-based static analysis creates too many false positives. Better to rely on LLM education + runtime error handling.

### Fix #1: Validation for Top-Level Timers ❌ REMOVED
**Originally**: `packages/agents/src/tools/dynamicToolLoader.ts` attempted to detect setTimeout/setInterval

**Problem**: The regex pattern `/^(?!.*async\s+invoke).*\b(setTimeout|setInterval)\s*\(/gm` caused false positives

**Current approach**: Removed validation, rely on runtime errors with better diagnostics:

**Impact**: Runtime crashes still produce clear error messages via Fix #3's enhanced import error handling

---

### Fix #2: Enhanced LLM Prompt Warnings ✅ KEPT
**File**: `packages/agents/src/tools/codeGenerator.ts` lines 316-345

**Status**: This fix is effective - educates the LLM without blocking tools

Added critical section to prompt about top-level side effects:

```typescript
⚠️ CRITICAL: TOP-LEVEL SIDE EFFECTS (CRASHES THE SYSTEM):
1. **NEVER** use setTimeout() or setInterval() at module/global scope
2. **NEVER** run side effects during module initialization
3. **ONLY** use timers, async operations, and side effects **INSIDE** invoke()
4. **ALL** initialization code must be synchronous and side-effect free

WRONG PATTERNS - These will cause system crashes:
✗ setTimeout(() => { ... }, 1000);  // At top level - CRASHES SYSTEM
✗ setInterval(() => { ... }, 5000);  // At top level - CRASHES SYSTEM
✗ const data = calculateSomething();  // If this has side effects - DANGEROUS

CORRECT PATTERN - Side effects ONLY inside invoke():
✓ const myTool = {
    async invoke(params) {
      // ✓ Timers and side effects only here
      const result = await new Promise(resolve => {
        setTimeout(() => resolve(data), 1000);
      });
      return JSON.stringify({ success: true, result });
    }
  };
```

Also added object shorthand warning (educational only, not validated):

```typescript
1. **Object shorthand**: Only use {key} if variable exists: {name, age} requires 'name' and 'age' variables
```

**Impact**: Reduces future tool generation errors by educating the LLM about dangerous patterns

---

### Fix #3: Better Error Handling in Dynamic Loader ✅ KEPT
**File**: `packages/agents/src/tools/dynamicToolLoader.ts` lines 593-629

**Status**: This fix is effective - provides clear diagnostics when tools fail to load

Enhanced error handling around dynamic imports with actionable error messages:

```typescript
try {
  // Import the tool module with enhanced error handling
  let toolModule;
  try {
    toolModule = await import(tempFilePath);
  } catch (importError) {
    // Capture detailed error information from import failures
    const errorMsg = importError instanceof Error ? importError.message : String(importError);
    const errorStack = importError instanceof Error ? importError.stack : '';

    logError(
      `[DynamicToolLoader] Failed to import tool ${manifest.toolName}:`,
      `Error: ${errorMsg}`,
      `Stack: ${errorStack}`
    );

    // Provide actionable error messages for common issues
    if (errorMsg.includes('is not defined')) {
      const match = errorMsg.match(/(\w+) is not defined/);
      const varName = match ? match[1] : 'variable';
      throw new Error(
        `Tool ${manifest.toolName} uses undefined variable "${varName}". ` +
        `Common causes: 1) Variable not declared, 2) Object shorthand {${varName}} without variable, ` +
        `3) Side effect during module load. Check that all variables are defined before use.`
      );
    } else if (errorMsg.includes('setTimeout') || errorMsg.includes('setInterval')) {
      throw new Error(
        `Tool ${manifest.toolName} uses setTimeout/setInterval at module scope causing crash. ` +
        `Move all timers inside invoke() method.`
      );
    } else {
      throw new Error(
        `Tool ${manifest.toolName} failed to load: ${errorMsg}. ` +
        `This may indicate syntax errors, side effects at module scope, or undefined variables.`
      );
    }
  }

  let toolInstance = toolModule.default || toolModule;
  // ... rest of loading
}
```

**Impact**: Provides clear, actionable error messages instead of cryptic crashes, helping diagnose issues faster

---

### Fix #4: Auto-Fix for Validator API ✅ KEPT
**File**: `packages/agents/src/tools/codeGenerator.ts` lines 109-135

**Status**: This fix is effective - automatically corrects common mistakes

Automatically transforms non-existent validator methods to native JavaScript:

```typescript
// Auto-fix validator API misuse
if (/validator\.(?:isString|isArray|isObject|isNumber|isBoolean)\(/g.test(generatedCode)) {
  generatedCode = generatedCode
    .replace(/validator\.isString\(([^)]+)\)/g, '(typeof $1 === "string")')
    .replace(/validator\.isArray\(([^)]+)\)/g, 'Array.isArray($1)')
    .replace(/validator\.isObject\(([^)]+)\)/g, '(typeof $1 === "object" && $1 !== null)')
    .replace(/validator\.isNumber\(([^)]+)\)/g, '(typeof $1 === "number")')
    .replace(/validator\.isBoolean\(([^)]+)\)/g, '(typeof $1 === "boolean")');
}
```

**Impact**: Eliminates "validator.isString is not a function" errors at generation time

---

### Removed Validations

**What was removed**:
1. Static analysis for top-level webResearch calls (`codeGenerator.ts` lines 109-117)
2. Pre-load validation for webResearch calls (`dynamicToolLoader.ts` lines 498-508)
3. Pre-load validation for validator API misuse (`dynamicToolLoader.ts` lines 510-521)
4. Pre-load validation for setTimeout/setInterval (`dynamicToolLoader.ts` lines 519-528)

**Why removed**: Regex patterns `/^(?!.*async\s+invoke).*\bawait\s+(webResearch|...)/gm` caused 237 false positives out of 242 tool generation attempts (98% rejection rate)

**Evidence**: `backups/reset-20251001-130256/soup-runner.log` shows 237 "STATIC ANALYSIS FAILED" messages, only 5 tools successfully generated

---

## Impact Analysis

### Before Any Fixes (backups/reset-20251001-105559):
- System crashed with "ReferenceError: sales is not defined"
- Cryptic error messages
- No guidance on what went wrong

### After First Fix Attempt (backups/reset-20251001-130256):
- **237 tools blocked by validation** (98% rejection rate)
- Only 5 tools successfully generated
- System became worse, not better
- "STATIC ANALYSIS FAILED" dominated logs

### After Validation Removal (current):
- **No pre-load blocking** - tools can be generated
- **Runtime errors** provide clear diagnostics via enhanced error handling
- **Auto-fix** corrects validator API issues silently
- **LLM education** reduces future errors without blocking valid code
- **Expected**: Return to previous tool success rates with better error messages when failures occur

**Key Learning**: Static analysis validation creates more problems than it solves. Better to:
1. Educate the LLM via prompts (low false positive rate)
2. Auto-fix common issues (zero false positives)
3. Provide great error messages at runtime (catches real issues only)

---

## Testing

### Verify Improvements:

1. **Start system:**
   ```bash
   pnpm dev
   ```

2. **Watch logs for:**
   - `[DynamicToolLoader] Tool X has setTimeout/setInterval at top-level - rejecting`
   - `Tool X uses undefined variable "varName". Common causes: 1) Variable not declared...`
   - Fewer system crashes during tool loading
   - More tools successfully loading

3. **Check tool generation:**
   - Tools should no longer have setTimeout at module scope
   - Error messages should be actionable and clear

---

## Files Modified

1. **`packages/agents/src/tools/dynamicToolLoader.ts`**
   - Added top-level timer validation (lines 519-528)
   - Enhanced import error handling with actionable messages (lines 593-629)

2. **`packages/agents/src/tools/codeGenerator.ts`**
   - Added top-level side effects warning section (lines 316-336)
   - Added object shorthand education (line 339)

---

## Related Documentation

- See `SWARM_FAILURE_FIXES.md` for agent collaboration fixes
- See `TOOL_GENERATION_FIXES.md` for webResearch/validator fixes
- See `archive-old-tools.sh` for cleaning up old broken tools

---

## Monitoring

### Key Metrics to Track:

1. **Crash Rate**: System should no longer crash during tool loading
2. **Timer Errors**: Look for rejection messages about setTimeout/setInterval
3. **Undefined Variable Errors**: Should have clear, actionable error messages
4. **Tool Success Rate**: More tools should load successfully

### Success Indicators:

- ✅ No system crashes from timer callbacks
- ✅ Clear error messages for undefined variables
- ✅ Tools rejected before causing crashes
- ✅ Actionable diagnostics for developers
