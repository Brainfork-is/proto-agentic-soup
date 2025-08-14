"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadBrowserConfig = loadBrowserConfig;
exports.loadSiteConfig = loadSiteConfig;
exports.loadRunnerConfig = loadRunnerConfig;
const dotenv_1 = require("dotenv");
const zod_1 = require("zod");
// Load environment variables once (idempotent)
(0, dotenv_1.config)();
const commonSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.string().optional().default('development'),
    LLM_PROVIDER: zod_1.z.string().optional().default(''),
    OPENAI_API_KEY: zod_1.z.string().optional().default(''),
});
const browserSchema = zod_1.z.object({
    BROWSER_GATEWAY_PORT: zod_1.z.coerce.number().optional().default(3100),
    ALLOWED_HOSTS: zod_1.z
        .string()
        .optional()
        .default('localhost,127.0.0.1')
        .transform((s) => s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)),
});
const siteSchema = zod_1.z.object({
    SITE_KB_PORT: zod_1.z.coerce.number().optional().default(3200),
});
const runnerSchema = zod_1.z.object({
    SOUP_RUNNER_PORT: zod_1.z.coerce.number().optional().default(3000),
    REDIS_URL: zod_1.z.string().optional().default('redis://localhost:6379'),
    DATABASE_URL: zod_1.z.string().optional().default('file:./dev.db'),
    JOBS_PER_MIN: zod_1.z.coerce.number().optional().default(10),
    EPOCH_MINUTES: zod_1.z.coerce.number().optional().default(120),
    FAIL_PENALTY: zod_1.z.coerce.number().optional().default(3),
    BROWSER_STEP_COST: zod_1.z.coerce.number().optional().default(1),
    SOUP_BOOTSTRAP: zod_1.z
        .union([zod_1.z.literal('1'), zod_1.z.literal('0')])
        .optional()
        .default('0')
        .transform((v) => v === '1'),
});
function readEnvObject(schema) {
    return schema.parse(process.env);
}
function loadBrowserConfig() {
    const common = readEnvObject(commonSchema);
    const app = readEnvObject(browserSchema);
    return { ...common, ...app };
}
function loadSiteConfig() {
    const common = readEnvObject(commonSchema);
    const app = readEnvObject(siteSchema);
    return { ...common, ...app };
}
function loadRunnerConfig() {
    const common = readEnvObject(commonSchema);
    const app = readEnvObject(runnerSchema);
    return { ...common, ...app };
}
