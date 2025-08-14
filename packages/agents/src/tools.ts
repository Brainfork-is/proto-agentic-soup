import { browserRun } from './browserTool';

export const Tools = {
  async browser(i: { url: string; steps: any[] }) {
    return await browserRun(i);
  },

  async calc(i: { expr: string }) {
    if (!/^[0-9+\-*/().\s]+$/.test(i.expr)) return { ok: false } as const;
    const v = eval(i.expr);
    return { ok: true, value: v } as const;
  },

  async stringKit(i: {
    text: string;
    mode: 'summarize' | 'classify';
    labels?: string[];
    maxWords?: number;
  }) {
    if (i.mode === 'summarize') {
      return {
        text: i.text
          .split(/\s+/)
          .slice(0, i.maxWords || 12)
          .join(' '),
      };
    }
    if (i.mode === 'classify') {
      return { label: (i.labels || ['A'])[0] };
    }
    return {};
  },

  async retrieval(i: { query: string }) {
    const kb = [
      'FAISS is a library good for in-memory/offline.',
      'Milvus is a scalable service supporting sharding and replication.',
      'PGVector is a Postgres extension great for simplicity and joins.',
    ];
    const hit = kb.find((s) => s.toLowerCase().includes(i.query.toLowerCase()));
    return { snippet: hit || '' };
  },
};
