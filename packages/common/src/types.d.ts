export interface Blueprint {
    id: string;
    version: number;
    llmModel: string;
    temperature: number;
    tools: Array<'retrieval' | 'calc' | 'stringKit' | 'browser'>;
    coopThreshold: number;
    repro: {
        minBalance: number;
        mutationRate: number;
        maxOffspring: number;
    };
    createdAt: string;
}
export interface AgentState {
    id: string;
    blueprintId: string;
    balance: number;
    reputation: number;
    attempts: number;
    wins: number;
    meanTtcSec: number;
    alive: boolean;
    lastBeat: string;
}
export interface JobData {
    category: 'web_research' | 'summarize' | 'classify' | 'math';
    payload: Record<string, any>;
    payout: number;
    deadlineS: number;
}
export interface Submission {
    agentId: string;
    jobId: string;
    artifact: string;
    logs?: string;
}
