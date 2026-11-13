import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function buildAll() {
  fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'sidecars', 'pele_studio', 'dist'), { recursive: true });

  // 1. Build inline card client runtime into memory (~7KB)
  const cardRuntimeRes = await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'card', 'runtime.ts')],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify: true,
  });
  const cardRuntimeCode = cardRuntimeRes.outputFiles[0].text;
  fs.writeFileSync(path.join(rootDir, 'dist', 'card-runtime.js'), cardRuntimeCode, 'utf8');

  const commonDefine = {
    __CARD_RUNTIME_CODE__: JSON.stringify(cardRuntimeCode),
  };

  // 2. CLI bundle
  const cliOut = path.join(rootDir, 'dist', 'cli.cjs');
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'cli', 'index.ts')],
    bundle: true,
    outfile: cliOut,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
    define: commonDefine,
    logOverride: { 'empty-import-meta': 'silent' },
  });
  fs.chmodSync(cliOut, 0o755);

  const binShim = path.join(rootDir, 'bin', 'agy-pele');
  if (fs.existsSync(binShim)) fs.chmodSync(binShim, 0o755);

  // 3. MCP server bundle
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'mcp', 'index.ts')],
    bundle: true,
    outfile: path.join(rootDir, 'dist', 'mcp.cjs'),
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    define: commonDefine,
  });

  // 4. Sidecar backend bundle (ESM, external sidecar_sdk)
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'sidecar', 'server.ts')],
    bundle: true,
    outfile: path.join(rootDir, 'sidecars', 'pele_studio', 'dist', 'server.mjs'),
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: ['sidecar_sdk'],
    banner: {
      js: 'import { createRequire as __peleCreateRequire } from "node:module"; const require = __peleCreateRequire(import.meta.url);',
    },
    define: commonDefine,
  });

  // 5. Sidecar UI frontend bundle (browser IIFE including full pele engine)
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'sidecar', 'ui-client.ts')],
    bundle: true,
    outfile: path.join(rootDir, 'sidecars', 'pele_studio', 'dist', 'ui.js'),
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    minify: true,
  });

  console.log('Built antigravity-pele artifacts successfully.');
}

buildAll().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
