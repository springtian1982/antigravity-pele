import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface WorkerExports {
  TOOLS: unknown[];
  handleToolCall: (
    name: string,
    args: Record<string, unknown>,
    convId?: string
  ) => Record<string, unknown>;
  extractConversationId: (params: Record<string, unknown> | undefined) => string | undefined;
  textResult: (data: unknown, isError?: boolean) => Record<string, unknown>;
}

const localRequire = createRequire(
  typeof __filename === 'string'
    ? __filename
    : path.join(process.cwd(), 'dist', 'mcp.cjs')
);

let cachedWorker: WorkerExports | null = null;
let cachedWorkerPath = '';
let cachedMtimeMs = -1;
let watchedPath: string | null = null;

function resolveWorkerPath(): string {
  const localDir =
    typeof __dirname === 'string' ? __dirname : path.join(process.cwd(), 'dist');
  const primary = path.join(localDir, 'mcp-worker.cjs');
  if (fs.existsSync(primary)) {
    return primary;
  }
  return path.join(
    os.homedir(),
    '.gemini',
    'config',
    'plugins',
    'antigravity-pele',
    'dist',
    'mcp-worker.cjs'
  );
}

function loadWorker(): WorkerExports {
  const workerPath = resolveWorkerPath();
  const stat = fs.statSync(workerPath);
  if (!cachedWorker || workerPath !== cachedWorkerPath || stat.mtimeMs !== cachedMtimeMs) {
    const resolved = localRequire.resolve(workerPath);
    if (localRequire.cache && localRequire.cache[resolved]) {
      delete localRequire.cache[resolved];
    }
    const mod = localRequire(resolved) as WorkerExports;
    cachedWorker = mod;
    cachedWorkerPath = workerPath;
    cachedMtimeMs = stat.mtimeMs;
  }
  return cachedWorker;
}

function sendResponse(obj: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function startWatchingWorker(): void {
  const workerPath = resolveWorkerPath();
  if (watchedPath === workerPath) return;
  if (watchedPath) {
    fs.unwatchFile(watchedPath);
  }
  watchedPath = workerPath;
  fs.watchFile(workerPath, { interval: 1500, persistent: false }, (curr, prev) => {
    if (curr.mtimeMs > 0 && curr.mtimeMs !== prev.mtimeMs) {
      cachedMtimeMs = -1;
      sendResponse({
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
      });
    }
  });
}

function handleRpcLine(line: string): void {
  let req: JsonRpcRequest;
  try {
    req = JSON.parse(line) as JsonRpcRequest;
  } catch {
    return;
  }
  if (!req || typeof req !== 'object') return;

  const id = req.id ?? null;
  const method = typeof req.method === 'string' ? req.method : '';
  const params =
    typeof req.params === 'object' && req.params !== null ? req.params : {};

  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return;
  }

  if (method === 'initialize') {
    const requestedVersion =
      typeof params.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05';
    sendResponse({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: requestedVersion,
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'antigravity-pele', version: '0.1.0' },
      },
    });
    startWatchingWorker();
    return;
  }

  if (method === 'ping') {
    sendResponse({ jsonrpc: '2.0', id, result: {} });
    return;
  }

  if (method === 'tools/list') {
    try {
      const worker = loadWorker();
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: { tools: worker.TOOLS },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: `Failed to load Pele worker: ${message}` },
      });
    }
    return;
  }

  if (method === 'tools/call') {
    const toolName = typeof params.name === 'string' ? params.name : '';
    const args =
      typeof params.arguments === 'object' && params.arguments !== null
        ? (params.arguments as Record<string, unknown>)
        : {};
    let worker: WorkerExports;
    try {
      worker = loadWorker();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify({ ok: false, error: message }) }],
          isError: true,
        },
      });
      return;
    }

    const convId = worker.extractConversationId(params);
    try {
      const result = worker.handleToolCall(toolName, args, convId);
      sendResponse({ jsonrpc: '2.0', id, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: worker.textResult({ ok: false, error: message }, true),
      });
    }
    return;
  }

  if (id !== null) {
    sendResponse({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  handleRpcLine(trimmed);
});

rl.on('close', () => {
  if (watchedPath) {
    fs.unwatchFile(watchedPath);
    watchedPath = null;
  }
});
