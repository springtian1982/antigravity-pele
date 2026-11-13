import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const OWN_LICENSE_BANNER =
  '/*! antigravity-pele | SPDX-License-Identifier: MIT | Copyright (c) 2026 springtian <springtian@gmail.com> */';

const BUNDLE_LICENSE_BANNER = [
  '/*!',
  ' * antigravity-pele (https://github.com/springtian1982/antigravity-pele)',
  ' * SPDX-License-Identifier: MIT',
  ' * Copyright (c) 2026 springtian <springtian@gmail.com>',
  ' * Bundles pele v1.13.0 — Copyright (c) 2026 kepano (MIT) & Lucide Icons (ISC).',
  ' * See LICENSE and THIRD_PARTY_NOTICES.md for full license texts.',
  ' */',
].join('\n');

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
    legalComments: 'inline',
    banner: { js: OWN_LICENSE_BANNER },
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
    legalComments: 'inline',
    banner: { js: `#!/usr/bin/env node\n${BUNDLE_LICENSE_BANNER}` },
    define: commonDefine,
    logOverride: { 'empty-import-meta': 'silent' },
  });
  fs.chmodSync(cliOut, 0o755);

  const binShim = path.join(rootDir, 'bin', 'agy-pele');
  if (fs.existsSync(binShim)) fs.chmodSync(binShim, 0o755);

  // 3. MCP hot-reloading router + worker bundle
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'mcp', 'index.ts')],
    bundle: true,
    outfile: path.join(rootDir, 'dist', 'mcp.cjs'),
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    legalComments: 'inline',
    banner: { js: OWN_LICENSE_BANNER },
  });

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src', 'mcp', 'worker.ts')],
    bundle: true,
    outfile: path.join(rootDir, 'dist', 'mcp-worker.cjs'),
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    legalComments: 'inline',
    banner: { js: BUNDLE_LICENSE_BANNER },
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
    legalComments: 'inline',
    banner: {
      js: `${BUNDLE_LICENSE_BANNER}\nimport { createRequire as __peleCreateRequire } from "node:module"; const require = __peleCreateRequire(import.meta.url);`,
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
    legalComments: 'inline',
    banner: { js: BUNDLE_LICENSE_BANNER },
  });

  console.log('Built antigravity-pele artifacts successfully.');
}

buildAll().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
