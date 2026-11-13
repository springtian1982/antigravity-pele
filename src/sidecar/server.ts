import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCardHtml, normalizeCardHeight } from '../core/card.js';
import {
  extractMermaidBlocks,
  HashConflictError,
  hashCode,
  replaceMermaidBlockInFile,
  writeFileAtomic,
} from '../core/markdown.js';
import { normalizeThemeMode } from '../core/palette.js';
import {
  fromFileUri,
  isPathInsideAllowedRoots,
  isValidConversationId,
  resolveAppDataDir,
  resolveBrainDir,
  toFileUri,
} from '../core/platform.js';
import { renderDiagram } from '../core/renderer.js';
import {
  getConversationStorePath,
  getGlobalFocusPath,
  readStudioStore,
  type StudioItemRecord,
} from '../core/studio-store.js';

export interface StudioTreeItem {
  id: string;
  source: 'conversation' | 'workspace';
  kind: 'card-artifact' | 'svg-artifact' | 'markdown-block' | 'mmd-file' | 'draft';
  title: string;
  filePath?: string;
  blockIndex?: number;
  code: string;
  sourceHash: string;
  diagramType?: string;
  subtitle?: string;
  canSave: boolean;
}

export interface StandaloneServerOptions {
  targetPath?: string;
  port?: number;
  watch?: boolean;
  assetsDir?: string;
}

export interface StandaloneServerHandle {
  url: string;
  port: number;
  token: string;
  close: () => Promise<void>;
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

function resolveAssetsDir(explicit?: string): string {
  if (explicit && fs.existsSync(path.join(explicit, 'index.html'))) {
    return explicit;
  }
  const here =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '..'),
    path.resolve(here, '..', 'sidecars', 'pele_studio'),
    path.resolve(here, '..', '..', 'sidecars', 'pele_studio'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  throw new Error(`Could not locate pele_studio UI assets from ${here}`);
}

function walkDiagramFiles(rootPath: string, maxFiles = 200, maxDepth = 5): string[] {
  const results: string[] = [];
  if (!rootPath || !fs.existsSync(rootPath)) return results;

  const stat = fs.statSync(rootPath);
  if (stat.isFile()) {
    const ext = path.extname(rootPath).toLowerCase();
    if (ext === '.md' || ext === '.markdown' || ext === '.mmd' || ext === '.mermaid') {
      return [path.resolve(rootPath)];
    }
    return results;
  }

  function visit(dir: string, depth: number): void {
    if (depth > maxDepth || results.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (entry.name.startsWith('.') && entry.name !== '.agents') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.md' || ext === '.markdown' || ext === '.mmd' || ext === '.mermaid') {
          results.push(full);
        }
      }
    }
  }

  visit(path.resolve(rootPath), 0);
  return results;
}

interface ParsedCardArtifact extends StudioItemRecord {
  heightMode?: 'auto' | 'compact' | 'fixed';
  fixedHeight?: number;
  maxHeight?: number;
}

function parseCardArtifact(filePath: string): ParsedCardArtifact | null {
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    const metaMatch = /<script\s+type="application\/json"\s+id="pele-card-meta">([\s\S]*?)<\/script>/i.exec(html);
    const codeMatch = /<code\s+id="pele-source-code">([\s\S]*?)<\/code>/i.exec(html);
    if (!metaMatch || !codeMatch) return null;

    const meta = JSON.parse(metaMatch[1]) as {
      title?: string;
      diagramType?: string;
      sourceHash?: string;
      heightMode?: 'auto' | 'compact' | 'fixed';
      fixedHeight?: number;
      maxHeight?: number;
    };
    const decodedCode = codeMatch[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');

    return {
      id: `card:${filePath}`,
      kind: 'card-artifact',
      title: meta.title || path.basename(filePath, '.html'),
      filePath,
      code: decodedCode,
      diagramType: meta.diagramType,
      sourceHash: meta.sourceHash || hashCode(decodedCode),
      updatedAt: fs.statSync(filePath).mtime.toISOString(),
      heightMode: meta.heightMode,
      fixedHeight: meta.fixedHeight,
      maxHeight: meta.maxHeight,
    };
  } catch {
    return null;
  }
}

function collectMarkdownItems(
  filePath: string,
  source: 'conversation' | 'workspace',
  displayBase?: string
): StudioTreeItem[] {
  const rel = displayBase ? path.relative(displayBase, filePath) || path.basename(filePath) : path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (ext === '.mmd' || ext === '.mermaid') {
      const normalized = raw.replace(/\r\n/g, '\n');
      return [
        {
          id: `${source}:mmd:${filePath}`,
          source,
          kind: 'mmd-file',
          title: path.basename(filePath),
          filePath,
          code: normalized,
          sourceHash: hashCode(normalized),
          subtitle: rel,
          canSave: true,
        },
      ];
    }

    const { blocks } = extractMermaidBlocks(raw);
    return blocks.map((b) => ({
      id: `${source}:md:${filePath}#${b.index}`,
      source,
      kind: 'markdown-block' as const,
      title: b.title,
      filePath,
      blockIndex: b.index,
      code: b.code,
      sourceHash: b.blockHash,
      subtitle: `${rel}:${b.codeStartLine}`,
      canSave: true,
    }));
  } catch {
    return [];
  }
}

function buildStateSnapshot(params: {
  convId?: string;
  workspaceRoots: string[];
  clientEtag?: string;
  watchBump: number;
}): {
  unchanged?: boolean;
  etag: string;
  focusedId?: string;
  items: StudioTreeItem[];
} {
  const items: StudioTreeItem[] = [];
  const seenCardPaths = new Set<string>();
  let focusedId: string | undefined;

  // 1. Conversation store & brain artifacts
  const convStorePath = getConversationStorePath(params.convId);
  const convStore = readStudioStore(convStorePath);
  const globalStore = readStudioStore(getGlobalFocusPath());
  focusedId = convStore.focusedId || globalStore.focusedId;

  for (const rec of [...convStore.items, ...globalStore.items]) {
    if (rec.filePath) {
      if (seenCardPaths.has(`${rec.kind}:${rec.filePath}:${rec.blockIndex ?? ''}`)) continue;
      seenCardPaths.add(`${rec.kind}:${rec.filePath}:${rec.blockIndex ?? ''}`);
    }
    if (rec.kind === 'card-artifact' && rec.filePath && fs.existsSync(rec.filePath)) {
      const parsed = parseCardArtifact(rec.filePath);
      if (parsed) {
        items.push({
          id: rec.id,
          source: 'conversation',
          kind: 'card-artifact',
          title: parsed.title,
          filePath: rec.filePath,
          code: parsed.code,
          sourceHash: parsed.sourceHash,
          diagramType: parsed.diagramType,
          subtitle: path.basename(rec.filePath),
          canSave: true,
        });
        continue;
      }
    }
    items.push({
      id: rec.id,
      source: 'conversation',
      kind: rec.kind,
      title: rec.title,
      filePath: rec.filePath,
      blockIndex: rec.blockIndex,
      code: rec.code,
      sourceHash: rec.sourceHash,
      diagramType: rec.diagramType,
      subtitle: rec.filePath ? path.basename(rec.filePath) : 'Session Draft',
      canSave: Boolean(rec.filePath && (rec.kind === 'markdown-block' || rec.kind === 'mmd-file' || rec.kind === 'card-artifact')),
    });
  }

  if (params.convId && isValidConversationId(params.convId)) {
    const brainDir = resolveBrainDir(params.convId);
    if (fs.existsSync(brainDir)) {
      for (const entry of fs.readdirSync(brainDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const full = path.join(brainDir, entry.name);
        if (entry.name.endsWith('.html') && entry.name.startsWith('pele-')) {
          if (seenCardPaths.has(`card-artifact:${full}:`)) continue;
          const parsed = parseCardArtifact(full);
          if (parsed) {
            seenCardPaths.add(`card-artifact:${full}:`);
            items.push({
              id: parsed.id,
              source: 'conversation',
              kind: 'card-artifact',
              title: parsed.title,
              filePath: full,
              code: parsed.code,
              sourceHash: parsed.sourceHash,
              diagramType: parsed.diagramType,
              subtitle: entry.name,
              canSave: true,
            });
          }
        } else if (entry.name.endsWith('.md')) {
          items.push(...collectMarkdownItems(full, 'conversation', brainDir));
        }
      }
    }
  }

  // 2. Workspace files
  for (const root of params.workspaceRoots) {
    const baseForRel = fs.existsSync(root) && fs.statSync(root).isFile() ? path.dirname(root) : root;
    const files = walkDiagramFiles(root);
    for (const file of files) {
      items.push(...collectMarkdownItems(file, 'workspace', baseForRel));
    }
  }

  const digestSource = JSON.stringify({
    watchBump: params.watchBump,
    focusedId,
    items: items.map((i) => [i.id, i.sourceHash, i.title]),
  });
  const etag = crypto.createHash('sha1').update(digestSource).digest('hex').slice(0, 16);
  if (params.clientEtag && params.clientEtag === etag) {
    return { unchanged: true, etag, items: [] };
  }
  return { etag, focusedId, items };
}

function handleSaveRequest(
  body: {
    kind?: string;
    filePath?: string;
    blockIndex?: number;
    expectedHash?: string;
    newCode?: string;
    title?: string;
    theme?: string;
  },
  allowedRoots: string[]
): { status: number; payload: Record<string, unknown> } {
  const filePath = typeof body.filePath === 'string' ? body.filePath : '';
  const newCode = typeof body.newCode === 'string' ? body.newCode : '';
  const expectedHash = typeof body.expectedHash === 'string' ? body.expectedHash : '';

  if (!filePath || !newCode.trim()) {
    return { status: 400, payload: { error: 'filePath and non-empty newCode are required.' } };
  }
  if (!isPathInsideAllowedRoots(filePath, allowedRoots)) {
    return { status: 403, payload: { error: 'Target path is outside allowed workspace or brain directories.' } };
  }
  if (!fs.existsSync(filePath)) {
    return { status: 404, payload: { error: `File not found: ${filePath}` } };
  }

  // Validate syntax before modifying file on disk
  try {
    renderDiagram(newCode);
  } catch (err) {
    return {
      status: 400,
      payload: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  try {
    if (body.kind === 'markdown-block') {
      const idx = typeof body.blockIndex === 'number' ? body.blockIndex : 0;
      const res = replaceMermaidBlockInFile(filePath, idx, expectedHash, newCode);
      return {
        status: 200,
        payload: {
          ok: true,
          updatedHash: res.updatedHash,
          codeStartLine: res.codeStartLine,
          fenceEndLine: res.fenceEndLine,
        },
      };
    }

    if (body.kind === 'mmd-file') {
      const currentRaw = fs.readFileSync(filePath, 'utf8');
      const eol = currentRaw.includes('\r\n') ? '\r\n' : '\n';
      const currentHash = hashCode(currentRaw);
      if (expectedHash && currentHash !== expectedHash) {
        throw new HashConflictError(`File changed on disk (expected ${expectedHash}, found ${currentHash}).`);
      }
      const normalized = newCode.replace(/\r\n/g, '\n');
      const output = eol === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized;
      writeFileAtomic(filePath, output);
      return {
        status: 200,
        payload: { ok: true, updatedHash: hashCode(normalized) },
      };
    }

    if (body.kind === 'card-artifact') {
      const existing = parseCardArtifact(filePath);
      if (!existing) {
        return { status: 400, payload: { error: 'Target HTML file is not a valid Pele card artifact.' } };
      }
      if (expectedHash && existing.sourceHash !== expectedHash) {
        throw new HashConflictError(
          `Card artifact changed on disk (expected ${expectedHash}, found ${existing.sourceHash}).`
        );
      }
      const theme = normalizeThemeMode(body.theme);
      const rendered = renderDiagram(newCode, { theme });
      const updatedHash = hashCode(newCode);
      const preservedHeight =
        existing.heightMode === 'fixed' && existing.fixedHeight
          ? existing.fixedHeight
          : normalizeCardHeight(existing.heightMode);
      const html = buildCardHtml({
        rendered,
        code: newCode.replace(/\r\n/g, '\n'),
        title: body.title || existing.title,
        theme,
        height: preservedHeight,
        maxHeight: existing.maxHeight,
        sourceHash: updatedHash,
      });
      writeFileAtomic(filePath, html);
      return {
        status: 200,
        payload: { ok: true, updatedHash },
      };
    }

    return { status: 400, payload: { error: `Unsupported save kind: ${String(body.kind)}` } };
  } catch (err) {
    if (err instanceof HashConflictError) {
      return { status: 409, payload: { error: err.message, code: 'HASH_CONFLICT' } };
    }
    return {
      status: 500,
      payload: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

function collectAllowedRoots(workspaceRoots: string[], convId?: string): string[] {
  const roots = [...workspaceRoots];
  const appData = resolveAppDataDir(convId);
  roots.push(path.join(appData, 'brain'));
  if (convId && isValidConversationId(convId)) {
    roots.push(resolveBrainDir(convId));
  }
  return roots;
}

function parseWorkspaceQuery(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return fromFileUri(entry);
      } catch {
        return path.resolve(entry);
      }
    });
}

export async function startStandalonePreviewServer(
  options: StandaloneServerOptions = {}
): Promise<StandaloneServerHandle> {
  const assetsDir = resolveAssetsDir(options.assetsDir);
  const token = crypto.randomBytes(24).toString('hex');
  const targetAbs = options.targetPath ? path.resolve(options.targetPath) : process.cwd();
  const targetUri = toFileUri(targetAbs);
  let watchBump = 0;

  const watchers: fs.FSWatcher[] = [];
  if (options.watch !== false && fs.existsSync(targetAbs)) {
    let timer: NodeJS.Timeout | undefined;
    try {
      const watcher = fs.watch(
        targetAbs,
        { recursive: process.platform === 'win32' || process.platform === 'darwin' },
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            watchBump += 1;
          }, 120);
        }
      );
      watcher.on('error', () => {});
      watchers.push(watcher);
    } catch {
      // Non-fatal if fs.watch unsupported
    }
  }

  const preloadJs = `(function() {
  const TOKEN = ${JSON.stringify(token)};
  const INITIAL_URIS = [${JSON.stringify(targetUri)}];
  window.sidecar = {
    conversationId: '',
    fetch(url, init) {
      const opts = Object.assign({}, init || {});
      const headers = new Headers(opts.headers || {});
      headers.set('x-sidecar-token', TOKEN);
      opts.headers = headers;
      return window.fetch(url, opts);
    },
    onWorkspaceChange(cb) {
      if (typeof cb === 'function') cb(INITIAL_URIS.slice());
      return function() {};
    }
  };
})();`;

  const indexHtml = fs.readFileSync(path.join(assetsDir, 'index.html'), 'utf8');
  const stylesCss = fs.readFileSync(path.join(assetsDir, 'styles.css'), 'utf8');
  const uiJs = fs.readFileSync(path.join(assetsDir, 'dist', 'ui.js'), 'utf8');

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
      return;
    }
    if (req.method === 'GET' && pathname === '/preload.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(preloadJs);
      return;
    }
    if (req.method === 'GET' && pathname === '/styles.css') {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(stylesCss);
      return;
    }
    if (req.method === 'GET' && pathname === '/ui.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(uiJs);
      return;
    }
    if (req.method === 'GET' && pathname === '/api/state') {
      const convId = reqUrl.searchParams.get('conversationId') || undefined;
      const ws = parseWorkspaceQuery(reqUrl.searchParams.get('workspaces') || undefined);
      const workspaceRoots = ws.length > 0 ? ws : [targetAbs];
      const clientEtag = reqUrl.searchParams.get('etag') || undefined;
      const snapshot = buildStateSnapshot({
        convId,
        workspaceRoots,
        clientEtag,
        watchBump,
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(snapshot));
      return;
    }

    if (req.method === 'POST' && pathname === '/api/save') {
      const provided = req.headers['x-sidecar-token'] || reqUrl.searchParams.get('token');
      if (provided !== token) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      let rawBody = '';
      req.on('data', (chunk) => {
        rawBody += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = rawBody ? JSON.parse(rawBody) : {};
          const ws = Array.isArray(parsed.workspaces)
            ? parsed.workspaces.map((w: string) => fromFileUri(String(w)))
            : [targetAbs];
          const allowedRoots = collectAllowedRoots(ws, parsed.conversationId);
          const result = handleSaveRequest(parsed, allowedRoots);
          if (result.status === 200) watchBump += 1;
          res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result.payload));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    token,
    close: async () => {
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // Ignore
        }
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function runAntigravitySidecar(): Promise<void> {
  const sdkName = 'sidecar_sdk';
  const { SidecarApp, Response } = (await import(sdkName)) as {
    SidecarApp: new () => {
      config: { projectId?: string; conversationId?: string };
      page(path: string, handler: () => unknown): void;
      api(path: string, handler: (data: Record<string, unknown>) => unknown, method?: string): void;
      run(): Promise<void>;
    };
    Response: new (body: string | Buffer, opts?: { contentType?: string; status?: number }) => unknown;
  };

  const assetsDir = resolveAssetsDir();
  const app = new SidecarApp();
  let watchBump = 0;

  app.page('/', () => fs.readFileSync(path.join(assetsDir, 'index.html'), 'utf8'));
  app.api(
    '/styles.css',
    () =>
      new Response(fs.readFileSync(path.join(assetsDir, 'styles.css'), 'utf8'), {
        contentType: 'text/css; charset=utf-8',
      }),
    'GET'
  );
  app.api(
    '/ui.js',
    () =>
      new Response(fs.readFileSync(path.join(assetsDir, 'dist', 'ui.js'), 'utf8'), {
        contentType: 'application/javascript; charset=utf-8',
      }),
    'GET'
  );

  app.api(
    '/api/state',
    (data) => {
      const convId =
        (typeof data.conversationId === 'string' && data.conversationId) ||
        app.config.conversationId;
      const workspaceRoots = parseWorkspaceQuery(
        typeof data.workspaces === 'string' ? data.workspaces : undefined
      );
      const clientEtag = typeof data.etag === 'string' ? data.etag : undefined;
      return buildStateSnapshot({
        convId,
        workspaceRoots,
        clientEtag,
        watchBump,
      });
    },
    'GET'
  );

  app.api(
    '/api/save',
    (data) => {
      const convId =
        (typeof data.conversationId === 'string' && data.conversationId) ||
        app.config.conversationId;
      const ws = Array.isArray(data.workspaces)
        ? data.workspaces.map((w) => fromFileUri(String(w)))
        : [];
      const allowedRoots = collectAllowedRoots(ws, convId);
      const result = handleSaveRequest(
        {
          kind: typeof data.kind === 'string' ? data.kind : undefined,
          filePath: typeof data.filePath === 'string' ? data.filePath : undefined,
          blockIndex: typeof data.blockIndex === 'number' ? data.blockIndex : undefined,
          expectedHash: typeof data.expectedHash === 'string' ? data.expectedHash : undefined,
          newCode: typeof data.newCode === 'string' ? data.newCode : undefined,
          title: typeof data.title === 'string' ? data.title : undefined,
          theme: typeof data.theme === 'string' ? data.theme : undefined,
        },
        allowedRoots
      );
      if (result.status === 200) {
        watchBump += 1;
        return result.payload;
      }
      return new Response(JSON.stringify(result.payload), {
        status: result.status,
        contentType: 'application/json; charset=utf-8',
      });
    },
    'POST'
  );

  await app.run();
}

const isSidecarHost = Boolean(
  process.env.ANTIGRAVITY_SIDECAR_WEB_PORT && process.env.ANTIGRAVITY_LS_ADDRESS
);

if (isSidecarHost) {
  runAntigravitySidecar().catch((err) => {
    console.error('[pele_studio] Fatal sidecar startup error:', err);
    process.exitCode = 1;
  });
}
