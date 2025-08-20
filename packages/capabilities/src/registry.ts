import { Capability } from './capability';
import { calculator } from './base/calculator';
import { summarize } from './base/summarize';
import { browser_readable } from './base/browser_readable';

export function loadBaseCapabilities(): Capability<any, any>[] {
  return [calculator, summarize, browser_readable];
}

export type CapabilityRegistry = {
  list(): Capability<any, any>[];
  get(name: string): Capability<any, any> | undefined;
};

export function createRegistry(extra: Capability<any, any>[] = []): CapabilityRegistry {
  const caps = [...loadBaseCapabilities(), ...extra];
  const map = new Map(caps.map((c) => [c.meta.name, c]));
  return {
    list: () => caps,
    get: (name: string) => map.get(name),
  };
}
