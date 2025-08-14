"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedArchetypes = seedArchetypes;
function seedArchetypes() {
    const base = [
        { id: 'Forager', temp: 0.1, tools: ['retrieval', 'browser'], coop: 0.3 },
        {
            id: 'Negotiator',
            temp: 0.3,
            tools: ['retrieval', 'stringKit', 'browser'],
            coop: 0.9,
        },
        { id: 'Sprinter', temp: 0.5, tools: ['browser'], coop: 0.3 },
        {
            id: 'Scholar',
            temp: 0.1,
            tools: ['retrieval', 'stringKit', 'browser', 'calc'],
            coop: 0.6,
        },
        { id: 'Cheapskate', temp: 0.1, tools: ['stringKit'], coop: 0.3 },
        { id: 'Socialite', temp: 0.3, tools: ['browser', 'stringKit'], coop: 0.9 },
    ];
    const out = [];
    for (const a of base) {
        for (let i = 0; i < 10; i++) {
            out.push({
                id: `${a.id}_${i}`,
                version: 1,
                llmModel: 'mock',
                temperature: a.temp,
                tools: a.tools,
                coopThreshold: a.coop,
                repro: { minBalance: 30, mutationRate: 0.15, maxOffspring: 2 },
                createdAt: new Date().toISOString(),
            });
        }
    }
    return out;
}
