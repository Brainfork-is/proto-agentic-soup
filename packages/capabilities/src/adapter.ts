import { DynamicTool } from '@langchain/core/tools';
import { Capability } from './capability';
import { z } from 'zod';

export function toLangGraphTool<I, O>(cap: Capability<I, O>) {
  return new DynamicTool({
    name: cap.meta.name,
    description: cap.meta.description,
    // LangGraph/LangChain tools expect/return strings.
    func: async (raw: string) => {
      const parsed = JSON.parse(raw || '{}');
      const input = (cap.input as z.ZodType<I>).parse(parsed);
      // In production you'll pass a real ctx from soup-runner.
      const out = await cap.impl(input, {
        log: () => {},
        budgetMs: cap.meta.costs?.estMs ?? 5000,
        providers: {},
        policy: { allow: cap.meta.permissions ?? ['none'] },
      });
      const validated = (cap.output as z.ZodType<O>).parse(out);
      return JSON.stringify(validated);
    },
  });
}
