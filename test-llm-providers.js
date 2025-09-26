#!/usr/bin/env node

/**
 * Test script to verify both Vertex AI and Ollama providers work correctly
 * Usage: node test-llm-providers.js
 */

const {
  createLLMProvider,
  testProviderConfiguration,
} = require('./packages/agents/dist/src/llm/index.js');

async function testProvider(componentType, providerOverride = undefined) {
  console.log(`\n=== Testing ${componentType} component ===`);

  // Override provider if specified
  const originalProvider = process.env.LLM_PROVIDER;
  if (providerOverride) {
    process.env.LLM_PROVIDER = providerOverride;
    console.log(`Testing with provider: ${providerOverride}`);
  }

  try {
    const result = await testProviderConfiguration(componentType);

    if (result.success) {
      console.log(`✅ ${componentType} test PASSED`);
      console.log(`   Provider: ${result.provider}`);
      console.log(`   Model: ${result.model}`);
    } else {
      console.log(`❌ ${componentType} test FAILED`);
      console.log(`   Error: ${result.error}`);
    }
  } catch (error) {
    console.log(`❌ ${componentType} test FAILED with exception`);
    console.log(`   Error: ${error.message}`);
  }

  // Restore original provider
  if (providerOverride && originalProvider !== undefined) {
    process.env.LLM_PROVIDER = originalProvider;
  }
}

async function testConfiguration(configString, componentType) {
  console.log(`\n=== Testing component-specific configuration ===`);
  console.log(`Config: ${configString}`);

  const configKey = `LLM_CONFIG_${componentType.toUpperCase()}`;
  const originalConfig = process.env[configKey];

  try {
    process.env[configKey] = configString;

    const provider = createLLMProvider(componentType);
    console.log(`✅ Provider created successfully`);
    console.log(`   Provider: ${provider.getProvider()}`);
    console.log(`   Model: ${provider.getModel()}`);

    // Test a simple invocation
    const response = await provider.invoke('Hello, this is a test message.');
    console.log(`✅ Provider invocation successful`);
    console.log(`   Response length: ${response.content.length} characters`);
  } catch (error) {
    console.log(`❌ Configuration test FAILED`);
    console.log(`   Error: ${error.message}`);
  }

  // Restore original config
  if (originalConfig !== undefined) {
    process.env[configKey] = originalConfig;
  } else {
    delete process.env[configKey];
  }
}

async function main() {
  console.log('🔄 Starting LLM Provider System Tests');
  console.log('=====================================');

  // Test different component types with default configuration
  const components = ['name_generator', 'job_generator', 'result_grader', 'agent'];

  console.log('\n📋 Testing default provider configuration for different components:');
  for (const component of components) {
    await testProvider(component);
  }

  // Test specific provider configurations if environment allows
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    console.log('\n📋 Testing Vertex AI provider explicitly:');
    await testProvider('agent', 'vertex');
  } else {
    console.log('\n⚠️ Skipping Vertex AI test (GOOGLE_CLOUD_PROJECT not set)');
  }

  // Note: Ollama testing requires a running Ollama instance
  console.log('\n⚠️ Skipping Ollama test (requires running Ollama instance)');
  console.log('   To test Ollama: Start Ollama locally and set LLM_PROVIDER=ollama');

  // Test component-specific configurations
  if (process.env.GOOGLE_CLOUD_PROJECT) {
    console.log('\n📋 Testing component-specific configurations:');
    await testConfiguration('vertex:gemini-1.5-flash:0.9:1000', 'name_generator');
  }

  console.log('\n✨ Test suite completed');
}

main().catch(console.error);
