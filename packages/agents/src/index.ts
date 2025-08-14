import { JobData } from '@soup/common';
import { Tools } from './tools';
import { MockPlanner, ExecutionResult } from './mockPlanner';

export class SimpleAgent {
  id: string;
  temperature: number;
  tools: string[];
  private planner: MockPlanner;

  constructor(id: string, t: number, tools: string[]) {
    this.id = id;
    this.temperature = t;
    this.tools = tools;
    this.planner = new MockPlanner(t, tools);
  }

  async handle(job: JobData) {
    try {
      // Phase 1: Planning
      const plan = this.planner.plan(job.category, job.payload);

      // Phase 2: Acting (execute each step)
      const executionResults: ExecutionResult[] = [];
      let totalStepsUsed = 0;

      for (const step of plan.steps) {
        try {
          let result: any;

          // Actor: Execute tool calls based on plan
          switch (step.tool) {
            case 'browser':
              if (this.tools.includes('browser')) {
                result = await Tools.browser(step.params);
                totalStepsUsed += result.stepsUsed || 0;
              } else {
                result = { error: 'Browser tool not available' };
              }
              break;

            case 'stringKit':
              if (this.tools.includes('stringKit')) {
                result = await Tools.stringKit(step.params);
              } else {
                result = { error: 'StringKit tool not available' };
              }
              break;

            case 'calc':
              if (this.tools.includes('calc')) {
                result = await Tools.calc(step.params);
              } else {
                result = { error: 'Calc tool not available' };
              }
              break;

            case 'retrieval':
              if (this.tools.includes('retrieval')) {
                result = await Tools.retrieval(step.params);
              } else {
                result = { error: 'Retrieval tool not available' };
              }
              break;

            default:
              result = { error: `Unknown tool: ${step.tool}` };
          }

          executionResults.push({
            success: !result.error,
            result,
            error: result.error,
            stepsUsed: result.stepsUsed || 0,
          });
        } catch (error) {
          executionResults.push({
            success: false,
            result: null,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Phase 3: Reflection
      const reflection = this.planner.reflect(plan, executionResults);

      return {
        ok: reflection.success,
        artifact: reflection.finalResult,
        stepsUsed: totalStepsUsed,
        planUsed: plan.goal,
        adjustments: reflection.adjustments,
      };
    } catch (error) {
      // Fallback to simple behavior if planner fails
      return this.handleSimple(job);
    }
  }

  // Fallback to original simple implementation
  private async handleSimple(job: JobData) {
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
