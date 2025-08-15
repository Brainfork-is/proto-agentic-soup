import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import path from 'path';

// Load environment variables once (idempotent)
// Look for .env file in the project root, even when running from subdirectories
const envPath = path.join(process.cwd(), '.env');
const rootEnvPath = path.join(process.cwd(), '../../.env');
dotenvConfig({ path: [envPath, rootEnvPath] });

const commonSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),
  LLM_PROVIDER: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  GOOGLE_CLOUD_PROJECT: z.string().optional().default(''),
  GOOGLE_CLOUD_LOCATION: z.string().optional().default('us-central1'),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(''),
  GOOGLE_CLOUD_CREDENTIALS: z.string().optional().default(''),
  LLM_MAX_TOKENS_PER_HOUR: z.coerce.number().optional().default(100000),
  LLM_MAX_TOKENS_PER_AGENT: z.coerce.number().optional().default(1000),

  // Local LLM configuration
  LOCAL_LLM_ENABLED: z.string().optional().default('0'),
  LOCAL_MODEL_PATH: z.string().optional().default('granite3.1-dense:8b'),
  LOCAL_LLM_ENDPOINT: z.string().optional().default('http://localhost:11434/api/generate'),
  LOCAL_LLM_MAX_TOKENS_PER_HOUR: z.coerce.number().optional().default(200000),
  LOCAL_LLM_MAX_TOKENS_PER_AGENT: z.coerce.number().optional().default(2000),
});

const browserSchema = z.object({
  BROWSER_GATEWAY_PORT: z.coerce.number().optional().default(3100),
  ALLOWED_HOSTS: z
    .string()
    .optional()
    .default('localhost,127.0.0.1,*.local,*.example.com,httpbin.org,jsonplaceholder.typicode.com')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    ),
  MCP_KNOWLEDGE_SERVER: z.string().optional().default(''),
  MCP_BEARER_TOKEN: z.string().optional().default(''),
});

const siteSchema = z.object({
  SITE_KB_PORT: z.coerce.number().optional().default(3200),
});

const runnerSchema = z.object({
  SOUP_RUNNER_PORT: z.coerce.number().optional().default(3000),
  REDIS_URL: z.string().optional().default('redis://localhost:6379'),
  DATABASE_URL: z.string().optional().default('file:./dev.db'),
  JOBS_PER_MIN: z.coerce.number().optional().default(10),
  EPOCH_MINUTES: z.coerce.number().optional().default(120),
  FAIL_PENALTY: z.coerce.number().optional().default(3),
  BROWSER_STEP_COST: z.coerce.number().optional().default(1),
  SOUP_BOOTSTRAP: z
    .union([z.literal('1'), z.literal('0')])
    .optional()
    .default('0')
    .transform((v) => v === '1'),
  MCP_KNOWLEDGE_SERVER: z.string().optional().default(''),
  MCP_BEARER_TOKEN: z.string().optional().default(''),
});

export type CommonConfig = z.infer<typeof commonSchema>;
export type BrowserConfig = z.infer<typeof browserSchema> & CommonConfig;
export type SiteConfig = z.infer<typeof siteSchema> & CommonConfig;
export type RunnerConfig = z.infer<typeof runnerSchema> & CommonConfig;

function readEnvObject<T extends z.ZodTypeAny>(schema: T) {
  return schema.parse(process.env) as z.infer<T>;
}

export function loadBrowserConfig(): BrowserConfig {
  const common = readEnvObject(commonSchema);
  const app = readEnvObject(browserSchema);
  return { ...common, ...app };
}

export function loadSiteConfig(): SiteConfig {
  const common = readEnvObject(commonSchema);
  const app = readEnvObject(siteSchema);
  return { ...common, ...app };
}

export function loadRunnerConfig(): RunnerConfig {
  const common = readEnvObject(commonSchema);
  const app = readEnvObject(runnerSchema);
  return { ...common, ...app };
}
