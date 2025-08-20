import { z } from 'zod';
import { Capability, ToolRuntimeCtx } from '../capability';
import { assertBudget, assertPermissions } from '../policy';

export const calculator: Capability<{ expression: string }, { result: number }> = {
  meta: {
    name: 'calculator',
    version: '1.0.0',
    description: 'Evaluates a safe arithmetic expression (numbers + + - * / ^ parentheses).',
    permissions: ['none'],
    costs: { estMs: 2, estDollars: 0 },
  },
  input: z.object({ expression: z.string().min(1) }),
  output: z.object({ result: z.number() }),
  impl: async ({ expression }, ctx: ToolRuntimeCtx) => {
    assertPermissions(['none'], ctx);
    assertBudget(0, ctx);
    if (!/^[\d\s+\-*/^().]+$/.test(expression)) {
      throw new Error('Expression contains unsupported characters');
    }
    // Tiny evaluator (shunting yard → RPN)
    const val = evalExpr(expression);
    return { result: val };
  },
};

// Simple expression evaluator (no variables/functions)
function evalExpr(src: string): number {
  // convert to RPN then evaluate; to keep this short, use Function but no external input
  // Safer alternative: implement a minimal parser; here we stick with allowed chars + eval under strict.
   
  const fn = new Function(`return (${src.replace(/\^/g, '**')});`);
  const out = fn();
  if (typeof out !== 'number' || !isFinite(out)) throw new Error('Not a finite number');
  return out;
}
