import { createRegistry, toLangGraphTool } from '@soup/capabilities';

const registry = createRegistry();
export const capabilityTools = registry.list().map((c) => toLangGraphTool(c));
