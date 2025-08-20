import { CompositionExecutor, createRegistry } from '@soup/capabilities';

const registry = createRegistry();
const exec = new CompositionExecutor(registry.list());

export async function tryCompositionFirst(spec: any, input: any, ctx: any) {
  if (spec?.composition) {
    const out = await exec.run(spec, input, ctx);
    return { kind: 'composition', out };
  }
  return { kind: 'codegen-needed' };
}
