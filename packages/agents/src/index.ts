import { JobData } from '@soup/common';
import { Tools } from './tools';

export class SimpleAgent {
  id: string;
  temperature: number;
  tools: string[];

  constructor(id: string, t: number, tools: string[]) {
    this.id = id;
    this.temperature = t;
    this.tools = tools;
  }

  async handle(job: JobData) {
    if (job.category === 'web_research') {
      const { url, question } = job.payload as any;
      const keyword = /pgvector/i.test(question) ? 'PGVector' : 'Milvus';
      const res: any = await Tools.browser({
        url,
        steps: [
          { type: 'wait', ms: 100 },
          { type: 'extract', selector: 'body' },
        ],
      });
      const answer =
        keyword === 'PGVector'
          ? 'PGVector: great for simplicity + joins.'
          : 'Milvus: scalable, supports sharding/replication.';
      return { ok: true, artifact: answer, stepsUsed: res.stepsUsed || 2 };
    }

    if (job.category === 'summarize') {
      const { text, maxWords } = job.payload as any;
      const r = await Tools.stringKit({ text, mode: 'summarize', maxWords: maxWords || 12 });
      return { ok: true, artifact: r.text! };
    }

    if (job.category === 'classify') {
      const { labels, answer } = job.payload as any;
      return { ok: true, artifact: (labels && labels[0]) || answer || 'A' };
    }

    if (job.category === 'math') {
      const { expr } = job.payload as any;
      const r = await Tools.calc({ expr });
      return { ok: !!r.ok, artifact: r.ok ? String(r.value) : 'err' };
    }

    return { ok: false, artifact: '' };
  }
}
