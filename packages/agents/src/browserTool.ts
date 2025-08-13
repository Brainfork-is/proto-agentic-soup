import fetch from 'node-fetch';
const BROWSER_URL = process.env.BROWSER_GATEWAY_URL || 'http://localhost:3100';
export async function browserRun(input:{url:string,steps:any[]}): Promise<any> {
  const r = await fetch(`${BROWSER_URL}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input)
  });
  if (!r.ok) throw new Error(`browser ${r.status}`);
  return (await r.json()) as any;
}
