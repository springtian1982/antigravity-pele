import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildCardHtml } from '../src/core/card.js';
import {
  extractMermaidBlocks,
  HashConflictError,
  replaceMermaidBlockInFile,
} from '../src/core/markdown.js';
import { FLEXOKI_DARK, FLEXOKI_LIGHT } from '../src/core/palette.js';
import { windowsOrPosixPathToFileUri } from '../src/core/platform.js';
import { renderDiagram, validateDiagram } from '../src/core/renderer.js';

test('renders standard Mermaid and Pele-exclusive extended diagrams with Flexoki theme', () => {
  const gantt = renderDiagram(
    `gantt\n  title Release\n  section Build\n  Core :a1, 2026-11-01, 2d`,
    { standaloneSvg: true }
  );
  assert.equal(gantt.type, 'gantt');
  assert.equal(gantt.isNativeSupported, false);
  assert.equal(gantt.isPeleExclusive, false);
  assert.ok(gantt.themedSvg.includes(FLEXOKI_LIGHT['--pele-bg']));
  assert.ok(gantt.themedSvg.includes(FLEXOKI_DARK['--pele-bg']));

  const swimlane = renderDiagram(
    `swimlane-beta LR\n  subgraph User\n    A[Start] --> B[End]\n  end\n  subgraph Agent\n    A --> C[Render]\n    C --> B\n  end`
  );
  assert.equal(swimlane.type, 'swimlane');
  assert.equal(swimlane.isPeleExclusive, true);
  assert.ok(swimlane.svg.includes('<svg'));

  const venn = renderDiagram(
    `venn-beta\n  set A["Mermaid"]\n  set B["Pele"]\n  union A,B["Shared"]`
  );
  assert.equal(venn.type, 'venn');
  assert.equal(venn.isPeleExclusive, true);
});

test('extracts CRLF & LF Markdown blocks with exact file line offsets and atomic hash-checked writeback', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pele-core-test-'));
  try {
    const mdPath = path.join(tmpDir, 'crlf-doc.md');
    const crlfDoc = [
      '# Title',
      '',
      'Intro text',
      '',
      '## First Chart',
      '',
      '```mermaid',
      'flowchart LR',
      '  A --> B',
      '```',
      '',
      '## Second Chart',
      '',
      '```mermaid',
      'flowchart TD',
      '  X --> Y',
      '  Y --> --> Z',
      '```',
      '',
    ].join('\r\n');

    fs.writeFileSync(mdPath, crlfDoc, 'utf8');
    const parsed = extractMermaidBlocks(crlfDoc);
    assert.equal(parsed.eol, '\r\n');
    assert.equal(parsed.blocks.length, 2);
    assert.equal(parsed.blocks[0].title, 'First Chart');
    assert.equal(parsed.blocks[0].codeStartLine, 8);
    assert.equal(parsed.blocks[1].title, 'Second Chart');
    assert.equal(parsed.blocks[1].codeStartLine, 15);

    const diag = validateDiagram(parsed.blocks[1].code, {
      lineOffset: parsed.blocks[1].codeStartLine,
      filePath: mdPath,
    });
    assert.equal(diag.valid, false);
    assert.equal(diag.diagnostics[0].severity, 'error');
    // Line 3 of block 2 -> 15 + 3 - 1 = 17
    assert.equal(diag.diagnostics[0].line, 17);

    // Replace block 2 safely with valid code and verify CRLF preserved
    const res = replaceMermaidBlockInFile(
      mdPath,
      1,
      parsed.blocks[1].blockHash,
      'flowchart TD\n  X --> Y\n  Y --> Z'
    );
    const updatedRaw = fs.readFileSync(mdPath, 'utf8');
    assert.ok(updatedRaw.includes('\r\n'));
    assert.ok(updatedRaw.includes('Y --> Z'));

    // Stale hash must throw HashConflictError
    assert.throws(
      () =>
        replaceMermaidBlockInFile(
          mdPath,
          1,
          parsed.blocks[1].blockHash,
          'flowchart TD\n  A --> B'
        ),
      (err) => err instanceof HashConflictError
    );
    assert.ok(res.updatedHash.length === 16);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('converts Windows and POSIX paths to compliant RFC-8089 file:/// URIs', () => {
  assert.equal(
    windowsOrPosixPathToFileUri('C:\\Users\\demo\\pele card.html', 'win32'),
    'file:///C:/Users/demo/pele%20card.html'
  );
  assert.equal(
    windowsOrPosixPathToFileUri('/home/demo/card.html', 'linux'),
    'file:///home/demo/card.html'
  );
});

test('builds accessible sticky-header card HTML with adaptive height by default, compact, and fixed modes', () => {
  const tallCode = [
    'flowchart TD',
    '  A --> B',
    '  B --> C',
    '  C --> D',
    '  D --> E',
    '  E --> F',
    '  F --> G',
    '  G --> H',
    '  H --> I',
  ].join('\n');
  const rendered = renderDiagram(tallCode);
  const autoHtml = buildCardHtml({
    rendered,
    code: tallCode,
    title: 'Tall Flow',
    theme: 'flexoki',
  });

  assert.ok(autoHtml.includes('<meta name="color-scheme" content="light dark">'));
  assert.ok(autoHtml.includes('role="toolbar" focusgroup="toolbar wrap"'));
  assert.ok(autoHtml.includes('command="--copy" commandfor="pele-source-code"'));
  assert.ok(autoHtml.includes('<span id="pele-status" class="tip" role="status"></span>'));
  assert.ok(autoHtml.includes('id="pele-height-toggle"'));
  assert.ok(autoHtml.includes('aria-pressed="true" title="Toggle adaptive height"'));
  assert.ok(!/100vh/.test(autoHtml));
  assert.ok(!/font-size:\s*(?:[0-9]|10|11)px/.test(autoHtml));

  const autoHeightMatch = /\.pele-workspace\s*\{[^}]*height:\s*(\d+)px;/s.exec(autoHtml);
  assert.ok(autoHeightMatch);
  const autoCanvasHeight = Number(autoHeightMatch[1]);
  assert.ok(autoCanvasHeight > 420, `Expected default auto canvasHeight > 420, got ${autoCanvasHeight}`);

  const compactHtml = buildCardHtml({
    rendered,
    code: tallCode,
    title: 'Tall Flow Compact',
    theme: 'flexoki',
    height: 'compact',
  });
  assert.ok(compactHtml.includes('id="pele-height-toggle" class="pele-btn" aria-pressed="false"'));
  const compactHeightMatch = /\.pele-workspace\s*\{[^}]*height:\s*(\d+)px;/s.exec(compactHtml);
  assert.ok(compactHeightMatch);
  const compactCanvasHeight = Number(compactHeightMatch[1]);
  assert.ok(compactCanvasHeight <= 420, `Expected compact canvasHeight <= 420, got ${compactCanvasHeight}`);

  const fixedHtml = buildCardHtml({
    rendered,
    code: tallCode,
    title: 'Tall Flow Fixed',
    theme: 'flexoki',
    height: 640,
  });
  const fixedHeightMatch = /\.pele-workspace\s*\{[^}]*height:\s*(\d+)px;/s.exec(fixedHtml);
  assert.ok(fixedHeightMatch);
  assert.equal(Number(fixedHeightMatch[1]), 640);
});

test('prebuilt distribution bundles preserve SPDX MIT and upstream copyright headers', () => {
  const repoRoot = path.resolve(process.cwd());

  const cardRuntime = fs.readFileSync(path.join(repoRoot, 'dist', 'card-runtime.js'), 'utf8');
  assert.ok(cardRuntime.includes('SPDX-License-Identifier: MIT'));
  assert.ok(cardRuntime.includes('springtian@gmail.com'));

  const peleBundles = [
    path.join(repoRoot, 'dist', 'cli.cjs'),
    path.join(repoRoot, 'dist', 'mcp.cjs'),
    path.join(repoRoot, 'sidecars', 'pele_studio', 'dist', 'server.mjs'),
    path.join(repoRoot, 'sidecars', 'pele_studio', 'dist', 'ui.js'),
  ];

  for (const filePath of peleBundles) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (filePath.endsWith(`${path.sep}cli.cjs`)) {
      assert.ok(content.startsWith('#!/usr/bin/env node\n'), 'dist/cli.cjs must preserve shebang on line 1');
    }
    assert.ok(content.includes('SPDX-License-Identifier: MIT'), `${filePath} missing SPDX header`);
    assert.ok(content.includes('springtian <springtian@gmail.com>'), `${filePath} missing author notice`);
    assert.ok(content.includes('kepano'), `${filePath} missing upstream pele copyright notice`);
    assert.ok(content.includes('Lucide Icons'), `${filePath} missing upstream Lucide notice`);
  }
});
