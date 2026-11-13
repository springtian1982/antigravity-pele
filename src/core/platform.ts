import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CONV_ID_RE = /^[0-9a-fA-F_-]{6,64}$/;

/**
 * Pure helper allowing deterministic tests on any OS for both POSIX and Windows
 * paths -> RFC-8089 `file:///` URIs.
 */
export function windowsOrPosixPathToFileUri(
  rawPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === 'win32') {
    const normalized = rawPath.replace(/\\/g, '/');
    const prefixed = /^[A-Za-z]:\//.test(normalized)
      ? `/${normalized}`
      : normalized.startsWith('/')
        ? normalized
        : `/${normalized}`;
    return encodeURI(`file://${prefixed}`).replace(/#/g, '%23').replace(/\?/g, '%3F');
  }
  return pathToFileURL(path.resolve(rawPath)).href;
}

export function toFileUri(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).href;
}

export function fromFileUri(uriOrPath: string): string {
  if (uriOrPath.startsWith('file://')) {
    return fileURLToPath(uriOrPath);
  }
  return path.resolve(uriOrPath);
}

export function isValidConversationId(convId: string | undefined): convId is string {
  return typeof convId === 'string' && CONV_ID_RE.test(convId.trim());
}

export function resolveAppDataDir(convId?: string): string {
  const fromEnv = process.env.ANTIGRAVITY_APP_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;

  const geminiRoot = path.join(os.homedir(), '.gemini');
  const candidate = path.join(geminiRoot, 'antigravity');
  if (convId && isValidConversationId(convId)) {
    const brainPath = path.join(candidate, 'brain', convId.trim());
    if (fs.existsSync(brainPath)) return candidate;
  }
  return candidate;
}

export function resolveBrainDir(convId: string): string {
  if (!isValidConversationId(convId)) {
    throw new Error(`Invalid conversationId: ${String(convId)}`);
  }
  return path.join(resolveAppDataDir(convId), 'brain', convId.trim());
}

export function resolveSidecarDataDir(): string {
  const fromEnv = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  return path.join(resolveAppDataDir(), 'sidecar_data', 'antigravity-pele', 'pele_studio');
}

function realpathOrNearestParent(targetPath: string): string {
  const abs = path.resolve(targetPath);
  try {
    return fs.realpathSync(abs);
  } catch {
    const parent = path.dirname(abs);
    if (parent === abs) return abs;
    return path.join(realpathOrNearestParent(parent), path.basename(abs));
  }
}

export function isPathInsideAllowedRoots(
  candidatePath: string,
  allowedRoots: string[]
): boolean {
  if (!candidatePath || allowedRoots.length === 0) return false;
  const resolvedTarget = realpathOrNearestParent(candidatePath);
  for (const root of allowedRoots) {
    if (!root) continue;
    let resolvedRoot: string;
    try {
      resolvedRoot = fs.realpathSync(path.resolve(root));
    } catch {
      resolvedRoot = path.resolve(root);
    }
    const rel = path.relative(resolvedRoot, resolvedTarget);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return true;
    }
  }
  return false;
}

export function slugify(text: string): string {
  const cleaned = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'diagram';
}

export function openInDefaultBrowser(url: string): void {
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/c', 'start', '', url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', () => {});
      child.unref();
      return;
    }
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(cmd, [url], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Ignore headless browser-launch failures
  }
}
