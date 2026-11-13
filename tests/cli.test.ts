import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'dist', 'cli.cjs');
const posixShim = path.join(repoRoot, 'bin', 'agy-pele');

test('agy-pele render reads stdin pipe and outputs themed SVG and HTML', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pele-cli-render-'));
  try {
    const svg = execFileSync(process.execPath, [cliPath, 'render', '-'], {
      input: 'flowchart LR\n  A[CLI] --> B[SVG]',
      encoding: 'utf8',
    });
    assert.ok(svg.includes('<svg'));
    assert.ok(svg.includes('--pele-bg'));

    const htmlOut = path.join(tmpDir, 'out.html');
    execFileSync(posixShim, ['render', '-', '-f', 'html', '-o', htmlOut, '--title', 'CLI Card', '--height', 'compact'], {
      input: 'mindmap\n  root((Pele))\n    Fast',
      encoding: 'utf8',
    });
    const html = fs.readFileSync(htmlOut, 'utf8');
    assert.ok(html.includes('CLI Card'));
    assert.ok(html.includes('<svg'));
    assert.ok(html.includes('"heightMode":"compact"'));

    const autoOut = path.join(tmpDir, 'auto.html');
    execFileSync(process.execPath, [cliPath, 'render', '-', '-f', 'html', '-o', autoOut, '--title', 'Vertical Auto'], {
      input: 'flowchart TD\n  A --> B\n  B --> C\n  C --> D\n  D --> E\n  E --> F\n  F --> G\n  G --> H',
      encoding: 'utf8',
    });
    const autoHtml = fs.readFileSync(autoOut, 'utf8');
    assert.ok(autoHtml.includes('"heightMode":"auto"'));
    const hMatch = /\.pele-workspace\s*\{[^}]*height:\s*(\d+)px;/s.exec(autoHtml);
    assert.ok(hMatch && Number(hMatch[1]) > 420);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agy-pele check detects syntax errors with exact line numbers and enforces --strict-mermaid', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pele-cli-check-'));
  try {
    const validMd = path.join(tmpDir, 'valid.md');
    fs.writeFileSync(
      validMd,
      '# Valid\n\n```mermaid\nflowchart LR\n  A --> B\n```\n',
      'utf8'
    );
    const okOut = execFileSync(process.execPath, [cliPath, 'check', validMd, '--json'], {
      encoding: 'utf8',
    });
    const okJson = JSON.parse(okOut) as { ok: boolean; blocksChecked: number };
    assert.equal(okJson.ok, true);
    assert.equal(okJson.blocksChecked, 1);

    const extMd = path.join(tmpDir, 'extended.md');
    fs.writeFileSync(
      extMd,
      '# Swimlane\n\n```mermaid\nswimlane-beta LR\n  subgraph User\n    A --> B\n  end\n```\n',
      'utf8'
    );
    // Allowed without --strict-mermaid
    execFileSync(process.execPath, [cliPath, 'check', extMd], { encoding: 'utf8' });

    // Fails with --strict-mermaid
    let strictFailed = false;
    try {
      execFileSync(process.execPath, [cliPath, 'check', extMd, '--strict-mermaid', '--json'], {
        encoding: 'utf8',
      });
    } catch (err) {
      strictFailed = true;
      const e = err as { status?: number; stdout?: string };
      assert.equal(e.status, 1);
      const parsed = JSON.parse(e.stdout || '{}') as {
        warningCount: number;
        diagnostics: Array<{ code: string }>;
      };
      assert.equal(parsed.warningCount, 1);
      assert.equal(parsed.diagnostics[0].code, 'pele-exclusive-diagram');
    }
    assert.equal(strictFailed, true);

    const badMd = path.join(tmpDir, 'bad.md');
    fs.writeFileSync(
      badMd,
      '# Broken\n\nText\n\n```mermaid\nflowchart TD\n  A --> --> B\n```\n',
      'utf8'
    );
    let syntaxFailed = false;
    try {
      execFileSync(process.execPath, [cliPath, 'check', badMd, '--json'], {
        encoding: 'utf8',
      });
    } catch (err) {
      syntaxFailed = true;
      const e = err as { status?: number; stdout?: string };
      assert.equal(e.status, 1);
      const parsed = JSON.parse(e.stdout || '{}') as {
        errorCount: number;
        diagnostics: Array<{ line: number }>;
      };
      assert.equal(parsed.errorCount, 1);
      assert.equal(parsed.diagnostics[0].line, 7);
    }
    assert.equal(syntaxFailed, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('agy-pele extract writes numbered SVG files and manifest.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pele-cli-extract-'));
  try {
    const docPath = path.join(tmpDir, 'design.md');
    const outDir = path.join(tmpDir, 'diagrams');
    fs.writeFileSync(
      docPath,
      [
        '# Architecture',
        '',
        '## Flow',
        '```mermaid',
        'flowchart LR',
        '  A --> B',
        '```',
        '',
        '## Roadmap',
        '```mermaid',
        'gantt',
        '  title Phase 1',
        '  section Core',
        '  Init :a1, 2026-11-01, 2d',
        '```',
      ].join('\n'),
      'utf8'
    );

    execFileSync(process.execPath, [cliPath, 'extract', docPath, '-o', outDir], {
      encoding: 'utf8',
    });

    const manifest = JSON.parse(
      fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8')
    ) as { count: number; items: Array<{ file: string; diagramType: string }> };
    assert.equal(manifest.count, 2);
    assert.equal(manifest.items[0].diagramType, 'flowchart');
    assert.equal(manifest.items[1].diagramType, 'gantt');
    assert.ok(fs.existsSync(path.join(outDir, manifest.items[0].file)));
    assert.ok(fs.existsSync(path.join(outDir, manifest.items[1].file)));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
