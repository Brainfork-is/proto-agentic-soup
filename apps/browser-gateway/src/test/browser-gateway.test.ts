import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { chromium, Browser } from 'playwright';
import { loadBrowserConfig } from '@soup/common';

describe('Browser Gateway', () => {
  let app: any;
  let mockSiteApp: any;
  let browser: Browser | null = null;
  const GATEWAY_PORT = 3101;
  const SITE_PORT = 3201;

  beforeAll(async () => {
    // Start mock site server
    mockSiteApp = Fastify();
    await mockSiteApp.register(cors, { origin: '*' });

    mockSiteApp.get('/healthz', async () => ({ ok: true }));
    mockSiteApp.get('/docs/vector-db.html', async () => {
      return `<!doctype html><html><head><meta charset='utf-8'><title>Vector DBs</title></head><body><h1>Vector DBs</h1><ul><li>FAISS: library, best for in-memory/offline.</li><li>Milvus: scalable service, supports sharding and replication.</li><li>PGVector: Postgres extension, great for simplicity and joins.</li></ul></body></html>`;
    });

    await mockSiteApp.listen({ port: SITE_PORT, host: '0.0.0.0' });

    // Start browser gateway app
    app = Fastify();
    await app.register(cors, { origin: '*' });

    const ALLOWED = ['localhost', '127.0.0.1'];

    app.get('/healthz', async () => ({ ok: true }));

    app.post('/run', async (req, reply) => {
      const b: any = (req as any).body || {};
      const url: string = b.url;
      const steps: any[] = b.steps || [];

      try {
        const u = new URL(url);
        if (!ALLOWED.includes(u.hostname)) {
          return reply.status(400).send({ error: 'host_not_allowed' });
        }

        if (!browser)
          browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
          });
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

    await app.listen({ port: GATEWAY_PORT, host: '0.0.0.0' });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (app) {
      await app.close();
    }
    if (mockSiteApp) {
      await mockSiteApp.close();
    }
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`http://localhost:${GATEWAY_PORT}/healthz`);
      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data).toEqual({ ok: true });
    });
  });

  describe('Browser Automation', () => {
    it('should extract text from page elements', async () => {
      const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `http://localhost:${SITE_PORT}/docs/vector-db.html`,
          steps: [{ type: 'extract', selector: 'h1' }],
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.ok).toBe(true);
      expect(data.lastText).toBe('Vector DBs');
      expect(data.contentLength).toBeGreaterThan(0);
      expect(data.stepsUsed).toBe(1);
    });

    it('should handle multiple steps and count them correctly', async () => {
      const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `http://localhost:${SITE_PORT}/docs/vector-db.html`,
          steps: [
            { type: 'extract', selector: 'li:first-child' },
            { type: 'wait', ms: 100 },
            { type: 'extract', selector: 'li:nth-child(3)' },
          ],
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.ok).toBe(true);
      expect(data.lastText).toBe('PGVector: Postgres extension, great for simplicity and joins.');
      expect(data.stepsUsed).toBe(3);
    });

    it('should return zero steps when no steps provided', async () => {
      const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `http://localhost:${SITE_PORT}/docs/vector-db.html`,
          steps: [],
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.ok).toBe(true);
      expect(data.stepsUsed).toBe(0);
    });
  });

  describe('Host Allow-List', () => {
    it('should block requests to non-allowed hosts', async () => {
      const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://google.com',
          steps: [{ type: 'extract', selector: 'h1' }],
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('host_not_allowed');
    });

    it('should allow requests to allowed hosts (localhost)', async () => {
      const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `http://localhost:${SITE_PORT}/docs/vector-db.html`,
          steps: [{ type: 'extract', selector: 'h1' }],
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.ok).toBe(true);
    });

    it('should allow requests to allowed hosts (127.0.0.1)', async () => {
      const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `http://127.0.0.1:${SITE_PORT}/docs/vector-db.html`,
          steps: [{ type: 'extract', selector: 'h1' }],
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid selectors gracefully', async () => {
      const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `http://localhost:${SITE_PORT}/docs/vector-db.html`,
          steps: [{ type: 'extract', selector: 'li:contains("invalid")' }],
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('not a valid selector');
    });
  });
});
