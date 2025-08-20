import { z } from 'zod';

export type Permission = 'none' | 'http' | 'fs.read' | 'fs.write' | 'llm';

export type CapabilityMeta = {
  name: string;
  version: string; // semver e.g., "0.1.0"
  description: string;
  permissions?: Permission[];
  costs?: { estMs?: number; estDollars?: number; estTokens?: number };
  stability?: 'experimental' | 'stable';
};

export type ToolRuntimeCtx = {
  log: (...args: any[]) => void;
  budgetMs: number;
  // Providers are injected by the host app (soup-runner)
  providers: {
    llm?: (args: { system?: string; prompt: string; maxTokens?: number }) => Promise<string>;
    httpGet?: (
      url: string,
      headers?: Record<string, string>
    ) => Promise<{ status: number; headers: Record<string, string>; body: string }>;
    browserReadable?: (
      url: string
    ) => Promise<{ title: string; text: string; links: { href: string; text?: string }[] }>;
  };
  policy?: {
    allow: Permission[];
    maxCostDollars?: number;
  };
};

export interface Capability<I, O> {
  meta: CapabilityMeta;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  impl: (input: I, ctx: ToolRuntimeCtx) => Promise<O>;
}

export type CompositionNode = {
  id: string;
  cap: string; // capability name
  args: Record<string, any>; // JSONPath-like "$.node.field" supported in executor
};

export type CompositionSpec = {
  name: string;
  version: string;
  description: string;
  permissions?: Permission[];
  costs?: { estMs?: number; estDollars?: number; estTokens?: number };
  stability?: 'experimental' | 'stable';
  inputSchema: any; // JSON Schema
  outputSchema: any; // JSON Schema
  composition: {
    nodes: CompositionNode[];
    edges: [string, string][];
    expose: Record<string, string>; // map of output fields to JSONPath
  };
  tests?: Array<{ input: any; assert?: string }>;
};
