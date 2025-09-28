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

  // Multi-Provider LLM Configuration
  LLM_PROVIDER: z.enum(['vertex', 'ollama', 'auto', '']).optional().default('vertex'),
  OLLAMA_URL: z.string().url().optional().default('http://localhost:11434'),
  DEFAULT_MODEL: z.string().optional().default('gemini-1.5-flash'),

  // Component-specific LLM configurations (format: "provider:model:temperature:maxTokens")
  LLM_CONFIG_NAME_GENERATOR: z.string().optional(),
  LLM_CONFIG_JOB_GENERATOR: z.string().optional(),
  LLM_CONFIG_RESULT_GRADER: z.string().optional(),
  LLM_CONFIG_AGENT: z.string().optional(),
  LLM_CONFIG_CODE_GENERATOR: z.string().optional(),
  LLM_CONFIG_SWARM_SYNTHESIZER: z.string().optional(),
  LLM_CONFIG_TOOL_BUILDER: z.string().optional(),

  // Legacy Configuration (maintained for backward compatibility)
  OPENAI_API_KEY: z.string().optional().default(''),
  GOOGLE_CLOUD_PROJECT: z.string().optional().default(''),
  GOOGLE_CLOUD_LOCATION: z.string().optional().default('us-central1'),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(''),
  GOOGLE_CLOUD_CREDENTIALS: z.string().optional().default(''),
  LLM_MAX_TOKENS_PER_HOUR: z.coerce.number().optional().default(100000),
  LLM_MAX_TOKENS_PER_AGENT: z.coerce.number().optional().default(1000),

  // Vertex AI Model Configuration (backward compatibility)
  VERTEX_AI_MODEL: z.string().optional().default('gemini-1.5-flash'),
  VERTEX_AI_TEMPERATURE: z.coerce.number().optional().default(0.7),

  // Token limits for different components (undefined = no limit)
  VERTEX_AI_MAX_OUTPUT_TOKENS: z
    .string()
    .optional()
    .transform((val) => (val === '' || val === undefined ? undefined : Number(val))), // General default
  VERTEX_AI_MAX_OUTPUT_TOKENS_JOB_GENERATOR: z
    .string()
    .optional()
    .transform((val) => (val === '' || val === undefined ? undefined : Number(val))),
  VERTEX_AI_MAX_OUTPUT_TOKENS_TOOL_BUILDER: z
    .string()
    .optional()
    .transform((val) => (val === '' || val === undefined ? undefined : Number(val))),
  VERTEX_AI_MAX_OUTPUT_TOKENS_CODE_GENERATOR: z
    .string()
    .optional()
    .transform((val) => (val === '' || val === undefined ? undefined : Number(val))),
  VERTEX_AI_MAX_OUTPUT_TOKENS_NAME_GENERATOR: z
    .string()
    .optional()
    .transform((val) => (val === '' || val === undefined ? undefined : Number(val))),
  VERTEX_AI_MAX_OUTPUT_TOKENS_LLM_GRADER: z
    .string()
    .optional()
    .transform((val) => (val === '' || val === undefined ? undefined : Number(val))),
  VERTEX_AI_MAX_OUTPUT_TOKENS_AGENT: z
    .string()
    .optional()
    .transform((val) => (val === '' || val === undefined ? undefined : Number(val))),

  // Local LLM configuration
  LOCAL_LLM_ENABLED: z.string().optional().default('0'),
  LOCAL_MODEL_PATH: z.string().optional().default('granite3.1-dense:8b'),
  LOCAL_LLM_ENDPOINT: z.string().optional().default('http://localhost:11434/api/generate'),
  LOCAL_LLM_MAX_TOKENS_PER_HOUR: z.coerce.number().optional().default(200000),
  LOCAL_LLM_MAX_TOKENS_PER_AGENT: z.coerce.number().optional().default(2000),
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

  // Swarm configuration
  SWARM_COUNT: z.coerce.number().optional().default(5), // Number of swarms to create
  AGENTS_PER_SWARM: z.coerce.number().optional().default(3), // Number of agents per swarm
  MCP_KNOWLEDGE_SERVER: z.string().optional().default(''),
  MCP_BEARER_TOKEN: z.string().optional().default(''),

  // Model preloading configuration
  PRELOAD_MODELS: z
    .union([z.literal('1'), z.literal('0'), z.literal('true'), z.literal('false')])
    .optional()
    .default('1')
    .transform((v) => v === '1' || v === 'true'),
  PRELOAD_TIMEOUT_SECONDS: z.coerce.number().optional().default(90), // Timeout per model
  PRELOAD_RETRY_ATTEMPTS: z.coerce.number().optional().default(2),
});

export type CommonConfig = z.infer<typeof commonSchema>;
export type RunnerConfig = z.infer<typeof runnerSchema> & CommonConfig;

function readEnvObject<T extends z.ZodTypeAny>(schema: T) {
  return schema.parse(process.env) as z.infer<T>;
}

export function loadRunnerConfig(): RunnerConfig {
  const common = readEnvObject(commonSchema);
  const app = readEnvObject(runnerSchema);
  return { ...common, ...app };
}

// Helper to get the token limit for a specific component
export type TokenLimitComponent =
  | 'job_generator'
  | 'tool_builder'
  | 'code_generator'
  | 'name_generator'
  | 'llm_grader'
  | 'agent'
  | 'swarm_synthesizer'
  | 'result_grader';

export function getVertexTokenLimit(
  component: TokenLimitComponent,
  config?: CommonConfig
): number | undefined {
  const cfg = config || readEnvObject(commonSchema);

  const componentEnvMap: Record<TokenLimitComponent, keyof CommonConfig> = {
    job_generator: 'VERTEX_AI_MAX_OUTPUT_TOKENS_JOB_GENERATOR',
    tool_builder: 'VERTEX_AI_MAX_OUTPUT_TOKENS_TOOL_BUILDER',
    code_generator: 'VERTEX_AI_MAX_OUTPUT_TOKENS_CODE_GENERATOR',
    name_generator: 'VERTEX_AI_MAX_OUTPUT_TOKENS_NAME_GENERATOR',
    llm_grader: 'VERTEX_AI_MAX_OUTPUT_TOKENS_LLM_GRADER',
    result_grader: 'VERTEX_AI_MAX_OUTPUT_TOKENS_LLM_GRADER', // Alias for llm_grader
    agent: 'VERTEX_AI_MAX_OUTPUT_TOKENS_AGENT',
    swarm_synthesizer: 'VERTEX_AI_MAX_OUTPUT_TOKENS_AGENT', // Use agent tokens for swarm synthesizer
  };

  const componentKey = componentEnvMap[component];
  const componentLimit = cfg[componentKey] as number | undefined;

  // If component-specific limit exists, use it; otherwise fall back to general limit
  // If neither exist, return undefined (no limit)
  return componentLimit ?? cfg.VERTEX_AI_MAX_OUTPUT_TOKENS;
}
