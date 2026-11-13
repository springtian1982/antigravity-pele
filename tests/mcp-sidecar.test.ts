import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import test from 'node:test';
import { extractMermaidBlocks } from '../src/core/markdown.js';
import { startStandalonePreviewServer } from '../src/sidecar/server.js';

const repoRoot = path.resolve(__dirname, '..');
const mcpPath = path.join(repoRoot, 'dist', 'mcp.cjs');

test('MCP stdio server handles initialize, tools/list, and all 4 Pele tools', async () => {
  const tmpAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'pele-mcp-appdata-'));
  const convId = '11111111-2222-3333-4444-555555555555';
  const brainDir = path.join(tmpAppData, 'brain', convId);
  fs.mkdirSync(brainDir, { recursive: true });

  const child = spawn(process.execPath, [mcpPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ANTIGRAVITY_APP_DATA_DIR: tmpAppData },
  });

  const pending = new Map<number, (msg: Record<string, unknown>) => void>();
  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const id = parsed.id as number | undefined;
    if (id !== undefined && pending.has(id)) {
      const resolve = pending.get(id)!;
      pending.delete(id);
      resolve(parsed);
    }
  });

  const rpc = (id: number, method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((resolve) => {
      pending.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });

  try {
    const initRes = await rpc(1, 'initialize', { protocolVersion: '2024-11-05' });
    assert.ok((initRes.result as { serverInfo: { name: string } }).serverInfo.name === 'antigravity-pele');

    const listRes = await rpc(2, 'tools/list');
    const toolNames = ((listRes.result as { tools: Array<{ name: string }> }).tools).map((t) => t.name);
    assert.deepEqual(toolNames, [
      'pele_render_card',
      'pele_render_artifact_svg',
      'pele_check_markdown',
      'pele_open_in_studio',
    ]);

    const cardRes = await rpc(3, 'tools/call', {
      name: 'pele_render_card',
      arguments: {
        title: 'MCP Swimlane',
        code: 'swimlane-beta LR\n  subgraph User\n    A[Ask] --> B[View]\n  end\n  subgraph Agent\n    A --> C[Pele]\n    C --> B\n  end',
      },
      _meta: { 'antigravity.google/conversation_id': convId },
    });
    const cardPayload = JSON.parse(
      ((cardRes.result as { content: Array<{ text: string }> }).content[0]).text
    ) as {
      ok: boolean;
      outputPath: string;
      embedTag: string;
      diagramType: string;
      isTallDiagram: boolean;
      fullHeightLink: string;
    };
    assert.equal(cardPayload.ok, true);
    assert.equal(cardPayload.diagramType, 'swimlane');
    assert.ok(cardPayload.embedTag.startsWith('<agent-embed src="file:///'));
    assert.ok(cardPayload.fullHeightLink.includes('file:///'));
    assert.ok(fs.existsSync(cardPayload.outputPath));

    const tallCardRes = await rpc(4, 'tools/call', {
      name: 'pele_render_card',
      arguments: {
        title: 'Tall Flowchart',
        code: [
          'flowchart TD',
          '  N1 --> N2',
          '  N2 --> N3',
          '  N3 --> N4',
          '  N4 --> N5',
          '  N5 --> N6',
          '  N6 --> N7',
          '  N7 --> N8',
          '  N8 --> N9',
          '  N9 --> N10',
        ].join('\n'),
      },
      _meta: { 'antigravity.google/conversation_id': convId },
    });
    const tallPayload = JSON.parse(
      ((tallCardRes.result as { content: Array<{ text: string }> }).content[0]).text
    ) as {
      ok: boolean;
      outputPath: string;
      isTallDiagram: boolean;
      fullHeightLink: string;
    };
    assert.equal(tallPayload.ok, true);
    assert.equal(tallPayload.isTallDiagram, true);
    assert.ok(tallPayload.fullHeightLink.startsWith('[全高卡片视图](file:///'));
    const tallHtml = fs.readFileSync(tallPayload.outputPath, 'utf8');
    assert.ok(tallHtml.includes('id="pele-height-toggle"'));
    assert.ok(tallHtml.includes('id="pele-fullscreen-toggle"'));

    // Trigger worker mtime update to verify hot-reload path works without restarting process
    const workerPath = path.join(repoRoot, 'dist', 'mcp-worker.cjs');
    const now = new Date();
    fs.utimesSync(workerPath, now, new Date(now.getTime() + 1000));

    const svgRes = await rpc(5, 'tools/call', {
      name: 'pele_render_artifact_svg',
      arguments: {
        title: 'Artifact Mindmap',
        code: 'mindmap\n  root((Pele))\n    Fast\n    Adaptive',
      },
      _meta: { 'antigravity.google/conversation_id': convId },
    });
    const svgPayload = JSON.parse(
      ((svgRes.result as { content: Array<{ text: string }> }).content[0]).text
    ) as { ok: boolean; outputPath: string; markdownImage: string };
    assert.equal(svgPayload.ok, true);
    assert.ok(svgPayload.markdownImage.startsWith('![Artifact Mindmap]('));
    assert.ok(fs.existsSync(svgPayload.outputPath));
  } finally {
    rl.close();
    child.kill();
    fs.rmSync(tmpAppData, { recursive: true, force: true });
  }
});

test('Sidecar preview server enforces token auth, root containment, and hash-checked save', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pele-sidecar-test-'));
  const outsideFile = path.join(os.tmpdir(), `pele-outside-${Date.now()}.md`);
  fs.writeFileSync(outsideFile, '# Outside\n\n```mermaid\nflowchart LR\n  A --> B\n```\n', 'utf8');

  const mdFile = path.join(tmpDir, 'README.md');
  fs.writeFileSync(mdFile, '# Demo\n\n```mermaid\nflowchart LR\n  A --> B\n```\n', 'utf8');

  const server = await startStandalonePreviewServer({
    targetPath: tmpDir,
    port: 0,
    watch: false,
    assetsDir: path.join(repoRoot, 'sidecars', 'pele_studio'),
  });

  try {
    const htmlRes = await fetch(server.url);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes('Pele Studio'));

    const uiRes = await fetch(`${server.url}ui.js`);
    assert.equal(uiRes.status, 200);
    assert.ok((await uiRes.text()).length > 10000);

    const stateRes = await fetch(`${server.url}api/state`);
    assert.equal(stateRes.status, 200);
    const state = (await stateRes.json()) as {
      items: Array<{ id: string; filePath: string; blockIndex: number; sourceHash: string }>;
    };
    const item = state.items.find((i) => i.filePath === mdFile);
    assert.ok(item);

    // 1. Missing token -> 401
    const unauth = await fetch(`${server.url}api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'markdown-block',
        filePath: mdFile,
        blockIndex: item.blockIndex,
        expectedHash: item.sourceHash,
        newCode: 'flowchart LR\n  A --> C',
      }),
    });
    assert.equal(unauth.status, 401);

    // 2. Outside root -> 403
    const outsideRes = await fetch(`${server.url}api/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sidecar-token': server.token,
      },
      body: JSON.stringify({
        kind: 'markdown-block',
        filePath: outsideFile,
        blockIndex: 0,
        expectedHash: '0000',
        newCode: 'flowchart LR\n  A --> C',
      }),
    });
    assert.equal(outsideRes.status, 403);

    // 3. Valid token & hash -> 200
    const okSave = await fetch(`${server.url}api/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sidecar-token': server.token,
      },
      body: JSON.stringify({
        kind: 'markdown-block',
        filePath: mdFile,
        blockIndex: item.blockIndex,
        expectedHash: item.sourceHash,
        newCode: 'flowchart LR\n  A --> UpdatedNode',
      }),
    });
    assert.equal(okSave.status, 200);
    const updatedMd = fs.readFileSync(mdFile, 'utf8');
    assert.ok(updatedMd.includes('UpdatedNode'));
    assert.equal(extractMermaidBlocks(updatedMd).blocks.length, 1);

    // 4. Stale hash -> 409
    const staleSave = await fetch(`${server.url}api/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sidecar-token': server.token,
      },
      body: JSON.stringify({
        kind: 'markdown-block',
        filePath: mdFile,
        blockIndex: item.blockIndex,
        expectedHash: item.sourceHash,
        newCode: 'flowchart LR\n  A --> Stale',
      }),
    });
    assert.equal(staleSave.status, 409);
  } finally {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(outsideFile, { force: true });
  }
});
