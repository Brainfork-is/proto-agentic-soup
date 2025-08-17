'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Tools = void 0;
const browserTool_1 = require('./browserTool');
exports.Tools = {
  async browser(i) {
    return await (0, browserTool_1.browserRun)(i);
  },
  async calc(i) {
    if (!/^[0-9+\-*/().\s]+$/.test(i.expr)) return { ok: false };
    // eslint-disable-next-line no-eval
    const v = eval(i.expr);
    return { ok: true, value: v };
  },
  async stringKit(i) {
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
  async retrieval(i) {
    const kb = [
      'FAISS is a library good for in-memory/offline.',
      'Milvus is a scalable service supporting sharding and replication.',
      'PGVector is a Postgres extension great for simplicity and joins.',
    ];
    const hit = kb.find((s) => s.toLowerCase().includes(i.query.toLowerCase()));
    return { snippet: hit || '' };
  },
};
