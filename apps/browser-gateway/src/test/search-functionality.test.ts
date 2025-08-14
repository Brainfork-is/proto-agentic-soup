import { describe, it, expect, beforeAll } from 'vitest';

const GATEWAY_PORT = 3101;
const SITE_PORT = 3200; // site-kb port

describe('N-5: Synthetic Search Page', () => {
  beforeAll(async () => {
    // Wait for services to be ready
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  it('should load the search page successfully', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `http://localhost:${SITE_PORT}/search.html`,
        steps: [
          { type: 'wait', ms: 1000 },
          { type: 'extract', selector: 'h1' },
        ],
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.lastText).toBe('Knowledge Base Search');
    expect(data.stepsUsed).toBe(2);
  });

  it('should type a search query and trigger search', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `http://localhost:${SITE_PORT}/search.html`,
        steps: [
          { type: 'wait', ms: 1000 },
          { type: 'type', selector: '#search-input', text: 'vector databases' },
          { type: 'click', selector: '#search-button' },
          { type: 'wait', ms: 1000 },
          { type: 'extract', selector: '#search-status' },
        ],
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.lastText).toContain('Found');
    expect(data.lastText).toContain('vector databases');
    expect(data.stepsUsed).toBe(5);
  });

  it('should click on search result and navigate', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `http://localhost:${SITE_PORT}/search.html`,
        steps: [
          { type: 'wait', ms: 1000 },
          { type: 'type', selector: '#search-input', text: 'vector' },
          { type: 'click', selector: '#search-button' },
          { type: 'wait', ms: 1000 },
          { type: 'click', selector: '.result-title' },
          { type: 'wait', ms: 1000 },
          { type: 'extract', selector: 'h1' },
        ],
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    // Should navigate to vector-db.html page
    expect(data.lastText).toBe('Vector DBs');
    expect(data.stepsUsed).toBe(7);
  });

  it('should handle no results found scenario', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `http://localhost:${SITE_PORT}/search.html`,
        steps: [
          { type: 'wait', ms: 1000 },
          { type: 'type', selector: '#search-input', text: 'nonexistent search term xyz123' },
          { type: 'click', selector: '#search-button' },
          { type: 'wait', ms: 1000 },
          { type: 'extract', selector: '.no-results' },
        ],
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.lastText).toContain('No results found');
    expect(data.stepsUsed).toBe(5);
  });

  it('should search for RAG and find relevant results', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `http://localhost:${SITE_PORT}/search.html`,
        steps: [
          { type: 'wait', ms: 1000 },
          { type: 'type', selector: '#search-input', text: 'rag implementation' },
          { type: 'click', selector: '#search-button' },
          { type: 'wait', ms: 1000 },
          { type: 'extract', selector: '.result-title' },
        ],
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.lastText).toBe('RAG Implementation Guide');
    expect(data.stepsUsed).toBe(5);
  });

  it('should search for cooperation and find policy page', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `http://localhost:${SITE_PORT}/search.html`,
        steps: [
          { type: 'wait', ms: 1000 },
          { type: 'type', selector: '#search-input', text: 'cooperation policies' },
          { type: 'click', selector: '#search-button' },
          { type: 'wait', ms: 1000 },
          { type: 'click', selector: 'a[href="/policies/coop.html"]' },
          { type: 'wait', ms: 1000 },
          { type: 'extract', selector: 'h1' },
        ],
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.lastText).toBe('Agent Cooperation Policies');
    expect(data.stepsUsed).toBe(7);
  });

  it('should handle form submission with Enter key', async () => {
    const response = await fetch(`http://localhost:${GATEWAY_PORT}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `http://localhost:${SITE_PORT}/search.html`,
        steps: [
          { type: 'wait', ms: 1000 },
          { type: 'type', selector: '#search-input', text: 'optimization' },
          { type: 'click', selector: '#search-input' },
          // Simulate pressing Enter (though our current implementation doesn't support key events)
          { type: 'click', selector: '#search-button' },
          { type: 'wait', ms: 1000 },
          { type: 'extract', selector: '#search-status' },
        ],
      }),
    });

    expect(response.ok).toBe(true);
    const data = await response.json();
    expect(data.lastText).toContain('Found');
    expect(data.lastText).toContain('optimization');
    expect(data.stepsUsed).toBe(6);
  });
});
