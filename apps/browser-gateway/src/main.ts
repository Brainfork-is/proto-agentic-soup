import Fastify from 'fastify';
import cors from '@fastify/cors';
import { chromium, Browser } from 'playwright';
import { loadBrowserConfig, log } from '@soup/common';

const cfg = loadBrowserConfig();
const app = Fastify();
app.register(cors, { origin: '*' });

const ALLOWED = cfg.ALLOWED_HOSTS as string[];

let browser: Browser | null = null;

app.get('/healthz', async () => ({ ok: true }));

app.post('/run', async (req, reply) => {
  const b: any = (req as any).body || {};
  const url: string = b.url;
  const steps: any[] = b.steps || [];

  try {
    // eslint-disable-next-line no-undef
    const u = new URL(url);
    const hostname = u.hostname;

    // Check if hostname matches any allowed patterns
    const isAllowed = ALLOWED.some((pattern) => {
      if (pattern.startsWith('*.')) {
        const domain = pattern.substring(2);
        return hostname === domain || hostname.endsWith('.' + domain);
      }
      return hostname === pattern;
    });

    if (!isAllowed) {
      return reply.status(400).send({ error: 'host_not_allowed' });
    }

    if (!browser) browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto(url, { waitUntil: 'load' });

    let lastText = '';
    let stepsUsed = 0;

    for (const s of steps) {
      if (s.type === 'click' && s.selector) {
        await page.click(s.selector);
        stepsUsed++;
      }
      if (s.type === 'type' && s.selector && typeof s.text === 'string') {
        await page.fill(s.selector, s.text);
        stepsUsed++;
      }
      if (s.type === 'wait' && s.ms) {
        await page.waitForTimeout(s.ms);
        stepsUsed++;
      }
      if (s.type === 'extract' && s.selector) {
        const t = await page.textContent(s.selector);
        lastText = (t || '').trim();
        stepsUsed++;
      }
    }

    const content = await page.content();
    await ctx.close();

    return { ok: true, lastText, contentLength: content.length, stepsUsed };
  } catch (e: any) {
    return reply.status(500).send({ error: e?.message || 'browser_error' });
  }
});

const port = cfg.BROWSER_GATEWAY_PORT;
app.listen({ port, host: '0.0.0.0' }).then(() => log(`[browser-gateway] ${port}`));
