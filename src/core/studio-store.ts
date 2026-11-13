import fs from 'node:fs';
import path from 'node:path';
import { hashCode, writeFileAtomic } from './markdown.js';
import { isValidConversationId, resolveBrainDir, resolveSidecarDataDir } from './platform.js';

export interface StudioItemRecord {
  id: string;
  kind: 'card-artifact' | 'svg-artifact' | 'markdown-block' | 'mmd-file' | 'draft';
  title: string;
  filePath?: string;
  blockIndex?: number;
  code: string;
  diagramType?: string;
  sourceHash: string;
  updatedAt: string;
}

export interface StudioStoreFile {
  focusedId?: string;
  items: StudioItemRecord[];
}

export function getConversationStorePath(convId?: string): string | null {
  if (!isValidConversationId(convId)) return null;
  const brainDir = resolveBrainDir(convId);
  return path.join(brainDir, 'scratch', 'pele_studio', 'items.json');
}

export function getGlobalFocusPath(): string {
  return path.join(resolveSidecarDataDir(), 'focus.json');
}

export function readStudioStore(storePath: string | null): StudioStoreFile {
  if (!storePath) return { items: [] };
  try {
    if (!fs.existsSync(storePath)) return { items: [] };
    const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as Partial<StudioStoreFile>;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      focusedId: typeof parsed.focusedId === 'string' ? parsed.focusedId : undefined,
      items,
    };
  } catch {
    return { items: [] };
  }
}

export function upsertStudioItem(
  convId: string | undefined,
  item: Omit<StudioItemRecord, 'sourceHash' | 'updatedAt'> & { sourceHash?: string },
  focus = true
): StudioItemRecord {
  const fullItem: StudioItemRecord = {
    ...item,
    sourceHash: item.sourceHash || hashCode(item.code),
    updatedAt: new Date().toISOString(),
  };

  const convStorePath = getConversationStorePath(convId);
  const targets = [convStorePath, getGlobalFocusPath()].filter(
    (p): p is string => Boolean(p)
  );

  for (const target of targets) {
    const store = readStudioStore(target);
    const filtered = store.items.filter((existing) => existing.id !== fullItem.id);
    filtered.unshift(fullItem);
    const next: StudioStoreFile = {
      focusedId: focus ? fullItem.id : store.focusedId,
      items: filtered.slice(0, 50),
    };
    writeFileAtomic(target, JSON.stringify(next, null, 2));
  }

  return fullItem;
}
