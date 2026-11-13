import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, '.test-dist');

async function buildTests() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const cardRuntimeCode = fs.readFileSync(path.join(rootDir, 'dist', 'card-runtime.js'), 'utf8');
  const testFiles = fs
    .readdirSync(path.join(rootDir, 'tests'))
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => path.join(rootDir, 'tests', f));

  if (testFiles.length === 0) return;

  await esbuild.build({
    entryPoints: testFiles,
    bundle: true,
    outdir: outDir,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outExtension: { '.js': '.cjs' },
    define: {
      __CARD_RUNTIME_CODE__: JSON.stringify(cardRuntimeCode),
    },
    logOverride: { 'empty-import-meta': 'silent' },
  });
}

buildTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
