import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// Load environment variables once (idempotent)
dotenvConfig();

const commonSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),
  LLM_PROVIDER: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
});

const browserSchema = z.object({
  BROWSER_GATEWAY_PORT: z.coerce.number().optional().default(3100),
  ALLOWED_HOSTS: z
    .string()
    .optional()
    .default('localhost,127.0.0.1')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    ),
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
