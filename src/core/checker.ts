import fs from 'node:fs';
import path from 'node:path';
import { extractMermaidBlocks } from './markdown.js';
import { validateDiagram, type DiagramDiagnostic } from './renderer.js';

export interface CheckSummary {
  ok: boolean;
  filesScanned: number;
  blocksChecked: number;
  errorCount: number;
  warningCount: number;
  diagnostics: DiagramDiagnostic[];
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.test-dist',
  '.next',
  '.turbo',
  'coverage',
]);

function collectTargetFiles(inputs: string[]): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  function addFile(filePath: string): void {
    const abs = path.resolve(filePath);
    if (seen.has(abs)) return;
    seen.add(abs);
    files.push(abs);
  }

  function walkDir(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.agents') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walkDir(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.md' || ext === '.markdown' || ext === '.mmd' || ext === '.mermaid') {
          addFile(full);
        }
      }
    }
  }

  for (const raw of inputs) {
    const abs = path.resolve(raw);
    if (!fs.existsSync(abs)) {
      throw new Error(`Path not found: ${raw}`);
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      walkDir(abs);
    } else if (stat.isFile()) {
      addFile(abs);
    }
  }

  return files;
}

export function checkDiagramPaths(
  inputs: string[],
  options: { strictMermaid?: boolean } = {}
): CheckSummary {
  const files = collectTargetFiles(inputs);
  const diagnostics: DiagramDiagnostic[] = [];
  let blocksChecked = 0;

  for (const filePath of files) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.mmd' || ext === '.mermaid') {
      blocksChecked += 1;
      const res = validateDiagram(raw, {
        strictMermaid: options.strictMermaid,
        lineOffset: 1,
        filePath,
      });
      diagnostics.push(...res.diagnostics);
      continue;
    }

    const { blocks } = extractMermaidBlocks(raw);
    for (const block of blocks) {
      blocksChecked += 1;
      const res = validateDiagram(block.code, {
        strictMermaid: options.strictMermaid,
        lineOffset: block.codeStartLine,
        filePath,
      });
      diagnostics.push(...res.diagnostics);
    }
  }

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const ok = errorCount === 0 && (!options.strictMermaid || warningCount === 0);

  return {
    ok,
    filesScanned: files.length,
    blocksChecked,
    errorCount,
    warningCount,
    diagnostics,
  };
}
