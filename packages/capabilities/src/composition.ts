import { Capability, CompositionSpec, ToolRuntimeCtx } from './capability';
import { z } from 'zod';
import { assertBudget, assertPermissions } from './policy';

const JSONPath = {
  // very small JSONPath: "$.nodeId.field.sub" or "$.input.field"
  get(root: any, path: string) {
    if (!path.startsWith('$.')) throw new Error(`Bad path ${path}`);
    const parts = path.slice(2).split('.');
    let cur: any = root;
    for (const part of parts) {
      if (!(part in cur)) throw new Error(`Path ${path} not found`);
      cur = cur[part];
    }
    return cur;
  },
};

export class CompositionExecutor {
  private caps: Map<string, Capability<any, any>>;
  constructor(capabilities: Capability<any, any>[]) {
    this.caps = new Map(capabilities.map((c) => [c.meta.name, c]));
  }

  async run(spec: CompositionSpec, input: any, ctx: ToolRuntimeCtx) {
    assertPermissions(spec.permissions, ctx);
    assertBudget(spec.costs?.estDollars, ctx);

    // JSON Schema validation (minimal: rely on Zod at leaf caps)
    // If you want strict JSON Schema: add ajv; omitted to keep deps minimal.

    // Topological order
    const order = topoSort(spec.composition.nodes, spec.composition.edges);

    const bag: any = { input, nodes: {} as Record<string, any> };

    for (const id of order) {
      const node = spec.composition.nodes.find((n) => n.id === id)!;
      const cap = this.caps.get(node.cap);
      if (!cap) throw new Error(`Unknown capability '${node.cap}'`);

      assertPermissions(cap.meta.permissions, ctx);
      assertBudget(cap.meta.costs?.estDollars, ctx);

      const args = materializeArgs(node.args, bag);
      const validatedArgs = (cap.input as z.ZodType<any>).parse(args);
      const out = await cap.impl(validatedArgs, ctx);
      const validatedOut = (cap.output as z.ZodType<any>).parse(out);
      bag.nodes[id] = validatedOut;
    }

    // Expose outputs
    const result: any = {};
    for (const [k, v] of Object.entries(spec.composition.expose)) {
      result[k] = JSONPath.get(bag, v);
    }
    return result;
  }
}

function topoSort(nodes: { id: string }[], edges: [string, string][]) {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const [u, v] of edges) {
    adj.get(u)!.push(v);
    indeg.set(v, (indeg.get(v) ?? 0) + 1);
  }
  const q: string[] = [];
  indeg.forEach((d, id) => {
    if (d === 0) q.push(id);
  });
  const order: string[] = [];
  while (q.length) {
    const u = q.shift()!;
    order.push(u);
    for (const v of adj.get(u)!) {
      indeg.set(v, (indeg.get(v) ?? 0) - 1);
      if (indeg.get(v) === 0) q.push(v);
    }
  }
  if (order.length !== nodes.length) throw new Error('Composition has a cycle');
  return order;
}

function materializeArgs(args: Record<string, any>, bag: any) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.startsWith('$.')) out[k] = JSONPath.get(bag, v);
    else out[k] = v;
  }
  return out;
}
