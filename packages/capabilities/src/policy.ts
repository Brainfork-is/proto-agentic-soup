import { Permission, ToolRuntimeCtx } from './capability';

export function assertPermissions(required: Permission[] | undefined, ctx: ToolRuntimeCtx) {
  if (!required || required.length === 0) return;
  const allow = new Set(ctx.policy?.allow ?? []);
  for (const p of required) {
    if (!allow.has(p))
      throw new Error(`Capability requires permission ${p}, but policy forbids it`);
  }
}

export function assertBudget(costDollars: number | undefined, ctx: ToolRuntimeCtx) {
  if (costDollars == null) return;
  const max = ctx.policy?.maxCostDollars;
  if (max != null && costDollars > max) {
    throw new Error(`Capability estimated cost $${costDollars} exceeds budget $${max}`);
  }
}
