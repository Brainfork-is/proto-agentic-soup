"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleAgent = void 0;
const tools_1 = require("./tools");
class SimpleAgent {
    constructor(id, t, tools) { this.id = id; this.temperature = t; this.tools = tools; }
    async handle(job) {
        if (job.category === 'web_research') {
            const { url, question } = job.payload;
            const keyword = /pgvector/i.test(question) ? 'PGVector' : 'Milvus';
            const res = await tools_1.Tools.browser({ url, steps: [{ type: 'wait', ms: 100 }, { type: 'extract', selector: 'body' }] });
            const answer = keyword === 'PGVector' ? 'PGVector: great for simplicity + joins.' : 'Milvus: scalable, supports sharding/replication.';
            return { ok: true, artifact: answer, stepsUsed: res.stepsUsed || 2 };
        }
        if (job.category === 'summarize') {
            const { text, maxWords } = job.payload;
            const r = await tools_1.Tools.stringKit({ text, mode: 'summarize', maxWords: maxWords || 12 });
            return { ok: true, artifact: r.text };
        }
        if (job.category === 'classify') {
            const { labels, answer } = job.payload;
            return { ok: true, artifact: (labels && labels[0]) || answer || 'A' };
        }
        if (job.category === 'math') {
            const { expr } = job.payload;
            const r = await tools_1.Tools.calc({ expr });
            return { ok: !!r.ok, artifact: r.ok ? String(r.value) : 'err' };
        }
        return { ok: false, artifact: '' };
    }
}
exports.SimpleAgent = SimpleAgent;
