// Debug script to test model detection logic
const { loadRunnerConfig } = require('./packages/common/dist/src/config.js');

async function debugModelDetection() {
  console.log('🔍 Debugging Model Detection...\n');

  // Load config
  const cfg = loadRunnerConfig();
  console.log('Config loaded:');
  console.log('  DEFAULT_MODEL:', cfg.DEFAULT_MODEL);
  console.log('  OLLAMA_URL:', cfg.OLLAMA_URL);
  console.log('  PRELOAD_MODELS:', cfg.PRELOAD_MODELS);

  console.log('\n📋 Environment variables:');
  console.log('  LLM_MODEL:', process.env.LLM_MODEL);
  console.log('  OLLAMA_MODEL:', process.env.OLLAMA_MODEL);
  console.log('  GRADER_MODEL:', process.env.GRADER_MODEL);

  console.log('\n🔧 Component-specific configs:');
  const llmConfigs = [
    'LLM_CONFIG_NAME_GENERATOR',
    'LLM_CONFIG_JOB_GENERATOR',
    'LLM_CONFIG_RESULT_GRADER',
    'LLM_CONFIG_AGENT',
    'LLM_CONFIG_CODE_GENERATOR',
    'LLM_CONFIG_SWARM_SYNTHESIZER',
    'LLM_CONFIG_TOOL_BUILDER',
  ];

  const models = new Set();

  for (const configKey of llmConfigs) {
    const configValue = process.env[configKey];
    console.log(`  ${configKey}:`, configValue || '(not set)');

    if (configValue && configValue.trim()) {
      const parts = configValue.split(':');
      if (parts.length >= 2 && parts[0] === 'ollama') {
        let modelName;
        if (parts.length === 2) {
          modelName = parts[1]; // ollama:model
        } else if (parts.length === 3) {
          modelName = parts[1]; // ollama:model:temp
        } else if (parts.length === 4) {
          modelName = parts[1]; // ollama:model:temp:tokens
        } else {
          // Handle complex model names like "gpt-oss:120b" in "ollama:gpt-oss:120b:0.9:"
          const lastPart = parts[parts.length - 1];
          const secondLastPart = parts[parts.length - 2];

          if (lastPart === '' && !isNaN(parseFloat(secondLastPart))) {
            // Format: "ollama:model:name:temp:" - join from index 1 to length-2
            modelName = parts.slice(1, -2).join(':');
          } else if (!isNaN(parseFloat(lastPart)) && !isNaN(parseFloat(secondLastPart))) {
            // Format: "ollama:model:name:temp:tokens" - join from index 1 to length-2
            modelName = parts.slice(1, -2).join(':');
          } else {
            // Format: "ollama:model:name:temp" - join from index 1 to length-1
            modelName = parts.slice(1, -1).join(':');
          }
        }

        models.add(modelName);
        console.log(`    → Found Ollama model: ${modelName} (from "${configValue}")`);
      }
    }
  }

  // Add default models
  const defaultModel = process.env.LLM_MODEL || process.env.OLLAMA_MODEL || cfg.DEFAULT_MODEL;
  if (defaultModel) {
    models.add(defaultModel);
    console.log(`  DEFAULT MODEL: ${defaultModel}`);
  }

  const graderModel = process.env.GRADER_MODEL;
  if (graderModel && graderModel !== defaultModel) {
    models.add(graderModel);
    console.log(`  GRADER MODEL: ${graderModel}`);
  }

  console.log(`\n🎯 Total models detected: ${models.size}`);
  console.log('  Models:', Array.from(models).join(', ') || '(none)');

  // Apply filtering
  const ollamaModels = Array.from(models).filter((model) => {
    return (
      !model.includes('gemini') &&
      !model.includes('gpt-4') &&
      !model.includes('gpt-3.5') &&
      !model.includes('claude') &&
      !model.startsWith('text-') &&
      !model.startsWith('davinci') &&
      !model.startsWith('curie') &&
      !model.startsWith('babbage') &&
      !model.startsWith('ada')
    );
  });

  console.log(`\n✅ Ollama models to preload: ${ollamaModels.length}`);
  console.log('  Models:', ollamaModels.join(', ') || '(none)');

  if (ollamaModels.length === 0) {
    console.log(
      '\n❌ No models to preload! This explains why you see "No models to preload" in the logs.'
    );
    console.log('\n💡 To fix this, set one of these environment variables:');
    console.log('  - LLM_MODEL=gpt-oss:120b');
    console.log('  - OLLAMA_MODEL=gpt-oss:120b');
    console.log('  - LLM_CONFIG_NAME_GENERATOR=ollama:gpt-oss:120b:0.9');
    console.log('  - DEFAULT_MODEL=gpt-oss:120b (and ensure LLM_PROVIDER=ollama)');
  }
}

debugModelDetection().catch(console.error);
