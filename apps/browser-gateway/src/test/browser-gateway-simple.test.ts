import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Simple integration test that tests against running services
describe('Browser Gateway Integration', () => {
  const GATEWAY_PORT = 3101;
  const SITE_PORT = 3200;

  beforeAll(async () => {
    // Check if services are available
    try {
      await fetch(`http://localhost:${GATEWAY_PORT}/healthz`);
      await fetch(`http://localhost:${SITE_PORT}/healthz`);
    } catch (e) {
      console.log('Services not running - start them with: pnpm dev');
      throw new Error('Browser Gateway and Site KB services must be running for integration tests');
    }
  });

  it('should return healthy status from browser gateway', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/healthz`);
    const data = await response.json();
    
    expect(response.ok).toBe(true);
    expect(data).toEqual({ ok: true });
  });

  it('should return healthy status from site-kb', async () => {
    const response = await fetch(`http://localhost:${SITE_PORT}/healthz`);
    const data = await response.json();
    
    expect(response.ok).toBe(true);
    expect(data).toEqual({ ok: true });
  });

  it('should block requests to non-allowed hosts', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://google.com',
        steps: [{ type: 'extract', selector: 'h1' }]
      })
    });

    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('host_not_allowed');
  });

  it('should extract text from allowed host pages', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `http://localhost:${SITE_PORT}/docs/vector-db.html`,
        steps: [{ type: 'extract', selector: 'h1' }]
      })
    });

    const data = await response.json();
    
    expect(response.ok).toBe(true);
    expect(data.ok).toBe(true);
    expect(data.lastText).toBe('Vector DBs');
    expect(data.stepsUsed).toBe(1);
    expect(data.contentLength).toBeGreaterThan(0);
  });

  it('should count steps correctly', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `http://localhost:${SITE_PORT}/docs/vector-db.html`,
        steps: [
          { type: 'extract', selector: 'li:first-child' },
          { type: 'wait', ms: 10 },
          { type: 'extract', selector: 'li:nth-child(3)' }
        ]
      })
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
        steps: []
      })
    });

    const data = await response.json();
    
    expect(response.ok).toBe(true);
    expect(data.ok).toBe(true);
    expect(data.stepsUsed).toBe(0);
  });
});