import { z } from 'zod';
import { Capability, ToolRuntimeCtx } from '../capability';
import { assertBudget, assertPermissions } from '../policy';

export const summarize: Capability<
  { text: string; style?: string; length?: 'short' | 'medium' | 'long' },
  { summary: string }
> = {
  meta: {
    name: 'summarize',
    version: '0.1.0',
    description: 'Summarize text with optional style and length hints.',
    permissions: ['llm'],
    costs: { estMs: 600, estDollars: 0.001, estTokens: 400 },
    stability: 'experimental',
  },
  input: z.object({
    text: z.string().min(1),
    style: z.string().optional(),
    length: z.enum(['short', 'medium', 'long']).optional(),
  }),
  output: z.object({ summary: z.string() }),
  impl: async ({ text, style, length }, ctx: ToolRuntimeCtx) => {
    assertPermissions(['llm'], ctx);
    assertBudget(0.001, ctx);
    const prompt = [
      style ? `Style: ${style}` : '',
      length ? `Target length: ${length}` : '',
      'Summarize the following:\n\n',
      text,
    ]
      .filter(Boolean)
      .join('\n');
    if (!ctx.providers.llm) throw new Error('No LLM provider wired');
    const out = await ctx.providers.llm({ prompt });
    return { summary: out.trim() };
  },
};
