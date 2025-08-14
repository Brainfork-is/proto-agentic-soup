export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const nowIso = () => new Date().toISOString();
export const rnd = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
