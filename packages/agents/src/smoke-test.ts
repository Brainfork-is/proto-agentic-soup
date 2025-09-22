/**
 * Offline smoke test for dynamic tool loading and execution.
 * - Copies a generated tool from backup into src/generated-tools
 * - Loads it via dynamicToolLoader
 * - Executes it with sample inputs and prints result
 *
 * This test avoids any LLM calls.
 */

import path from 'path';
import fs from 'fs-extra';
function log(message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] ${message}`, ...args);
}

function logError(message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();

  console.error(`[${timestamp}] ${message}`, ...args);
}

async function copyFromBackup(): Promise<{ manifestPath: string; manifest: any } | null> {
  const backupRoot = path.resolve(
    process.cwd(),
    'backups',
    'reset-20250904-160233',
    'generated-tools'
  );
  const srcCode = path.join(backupRoot, 'code');
  const srcManifests = path.join(backupRoot, 'manifests');
  const destRoot = path.join(__dirname, 'generated-tools');
  const destCode = path.join(destRoot, 'code');
  const destManifests = path.join(destRoot, 'manifests');

  await fs.ensureDir(destCode);
  await fs.ensureDir(destManifests);

  const manifestFiles = (await fs.pathExists(srcManifests)) ? await fs.readdir(srcManifests) : [];
  if (manifestFiles.length === 0) {
    log('[SMOKE] No manifests found in backup. Skipping copy.');
    return null;
  }

  // Pick one manifest to test
  const pick = manifestFiles[0];
  const manifestSrcPath = path.join(srcManifests, pick);
  const manifest = await fs.readJson(manifestSrcPath);

  // Copy manifest
  const manifestDestPath = path.join(destManifests, pick);
  await fs.copy(manifestSrcPath, manifestDestPath);

  // Copy corresponding code file from backup by filename
  const codeFileName = path.basename(manifest.filePath);
  const codeSrcPath = path.join(srcCode, codeFileName);
  if (await fs.pathExists(codeSrcPath)) {
    const codeDestPath = path.join(destCode, codeFileName);
    await fs.copy(codeSrcPath, codeDestPath);
    log(`[SMOKE] Copied code -> ${codeDestPath}`);
  } else {
    log(`[SMOKE] Code file missing in backup: ${codeSrcPath}`);
  }

  log(`[SMOKE] Copied manifest -> ${manifestDestPath}`);
  return { manifestPath: manifestDestPath, manifest };
}

async function run(): Promise<void> {
  log('[SMOKE] Starting offline dynamic tool smoke test...');

  const copied = await copyFromBackup();
  if (!copied) {
    log('[SMOKE] Nothing to test. Exiting.');
    return;
  }

  const { manifest } = copied;
  const toolName: string = manifest.toolName;
  const codeFileNameLocal = path.basename(manifest.filePath);
  const codeSrcPath = path.join(__dirname, 'generated-tools', 'code', codeFileNameLocal);

  // Read code and transform to CommonJS for import
  const toCommonJS = (src: string): string => {
    let out = src;
    out = out.replace(/\bexport\s+const\s+(\w+)\s*=/g, 'const $1 =');
    out = out.replace(/\bexport\s+let\s+(\w+)\s*=/g, 'let $1 =');
    out = out.replace(/\bexport\s+var\s+(\w+)\s*=/g, 'var $1 =');
    out = out.replace(/\bexport\s+default\s+/g, 'module.exports = ');
    out = out.replace(/\bexport\s*\{[^}]*\};?/g, '');
    return out;
  };

  const rawCode = await fs.readFile(codeSrcPath, 'utf-8');
  const cjsCode = toCommonJS(rawCode);

  const tempDir = path.join(__dirname, 'generated-tools', 'smoke');
  await fs.ensureDir(tempDir);
  const tempFile = path.join(tempDir, `smoke_${toolName}_${Date.now()}.js`);

  const moduleCode = `\n${cjsCode}\n\nif (typeof ${toolName} !== 'undefined') { module.exports = ${toolName}; }`;
  await fs.writeFile(tempFile, moduleCode);
  log(`[SMOKE] Wrote temp module: ${tempFile}`);

  // Load CJS module via createRequire
  const { createRequire } = await import('module');
  const req = createRequire(__filename);

  const toolModule = req(tempFile);
  const toolInstance = (toolModule as any).default || toolModule;
  if (!toolInstance || typeof toolInstance.invoke !== 'function') {
    logError('[SMOKE] Loaded module missing invoke method');
    return;
  }

  // Prepare sample inputs by tool type
  let params: any = {};
  if (toolName.includes('interest')) {
    params = { principal: 1000, rate: 0.05, time: 2 };
  } else if (toolName.includes('email') || toolName.includes('validate')) {
    params = { emailAddresses: ['alice@google.com', 'bob@example.com', 'carol@google.com'] };
  } else if (toolName.includes('currency')) {
    params = { jpyAmount: 10000, exchangeRate: 0.0067, commissionRate: 0.02 };
  } else {
    // Generic fallback param
    params = { data: [1, 2, 3] };
  }

  log(`[SMOKE] Executing tool ${toolName} with params: ${JSON.stringify(params)}`);
  const result = await toolInstance.invoke(params);
  log(`[SMOKE] Raw result: ${result}`);

  try {
    const parsed = JSON.parse(result);
    log(`[SMOKE] Parsed result: success=${parsed.success}, keys=${Object.keys(parsed).join(',')}`);
  } catch (e) {
    logError('[SMOKE] Failed to parse tool result as JSON:', e);
  }

  log('[SMOKE] Completed offline smoke test.');
}

run().catch((err) => {
  logError('[SMOKE] Unhandled error:', err);
  process.exit(1);
});
