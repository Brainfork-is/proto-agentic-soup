import { z } from 'zod';
import { Capability, ToolRuntimeCtx } from '../capability';
import { assertBudget, assertPermissions } from '../policy';

export const browser_readable: Capability<
  { url: string },
  { title: string; text: string; links: { href: string; text?: string }[] }
> = {
  meta: {
    name: 'browser_readable',
    version: '0.1.0',
    description: 'Fetches a URL via browser-gateway and returns readable text + links.',
    permissions: ['http'],
    costs: { estMs: 1200, estDollars: 0.0005 },
  },
  input: z.object({ url: z.string().url() }),
  output: z.object({
    title: z.string(),
    text: z.string(),
    links: z.array(z.object({ href: z.string().url(), text: z.string().optional() })),
  }),
  impl: async ({ url }, ctx: ToolRuntimeCtx) => {
    assertPermissions(['http'], ctx);
    assertBudget(0.0005, ctx);
    if (!ctx.providers.browserReadable) throw new Error('No browserReadable provider wired');
    const page = await ctx.providers.browserReadable(url);
    return page;
  },
};
