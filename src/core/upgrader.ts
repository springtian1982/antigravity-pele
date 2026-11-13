import fs from 'node:fs';
import path from 'node:path';
import { buildCardHtml, normalizeCardHeight, type CardHeightOption } from './card.js';
import { hashCode, writeFileAtomic } from './markdown.js';
import { normalizeThemeMode, type ThemeMode } from './palette.js';
import { renderDiagram } from './renderer.js';

export interface ParsedCardHtml {
  title: string;
  code: string;
  theme: ThemeMode;
  standalonePage: boolean;
  height: CardHeightOption;
  heightMode?: 'auto' | 'compact' | 'fixed';
  fixedHeight?: number;
  maxHeight?: number;
  sourceHash: string;
  diagramType?: string;
}

export interface UpgradedCardRecord {
  filePath: string;
  title: string;
  diagramType: string;
  heightMode: 'auto' | 'compact' | 'fixed';
  changed: boolean;
}

export interface UpgradeCardsSummary {
  ok: boolean;
  filesScanned: number;
  cardsFound: number;
  cardsUpgraded: number;
  cardsUnchanged: number;
  errors: Array<{ filePath: string; error: string }>;
  items: UpgradedCardRecord[];
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.test-dist',
  '.system_generated',
  'browser_sandbox',
]);

export function parseCardHtml(
  html: string,
  fallbackTitle = 'Mermaid Diagram'
): ParsedCardHtml | null {
  if (!html.includes('id="pele-card-meta"') || !html.includes('id="pele-source-code"')) {
    return null;
  }

  const metaMatch = /<script\s+type="application\/json"\s+id="pele-card-meta">([\s\S]*?)<\/script>/i.exec(html);
  const codeMatch = /<code\s+id="pele-source-code">([\s\S]*?)<\/code>/i.exec(html);
  if (!metaMatch || !codeMatch) return null;

  try {
    const meta = JSON.parse(metaMatch[1]) as {
      title?: string;
      diagramType?: string;
      theme?: string;
      heightMode?: 'auto' | 'compact' | 'fixed';
      fixedHeight?: number;
      maxHeight?: number;
      sourceHash?: string;
    };

    const decodedCode = codeMatch[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\r\n/g, '\n');

    const height: CardHeightOption =
      meta.heightMode === 'fixed' && typeof meta.fixedHeight === 'number'
        ? normalizeCardHeight(meta.fixedHeight)
        : meta.heightMode === 'compact'
          ? 'compact'
          : 'auto';

    return {
      title: meta.title?.trim() || fallbackTitle,
      code: decodedCode,
      theme: normalizeThemeMode(meta.theme),
      standalonePage: /<body[^>]*\bis-standalone\b/i.test(html),
      height,
      heightMode: meta.heightMode,
      fixedHeight: meta.fixedHeight,
      maxHeight:
        typeof meta.maxHeight === 'number' && Number.isFinite(meta.maxHeight)
          ? meta.maxHeight
          : undefined,
      sourceHash: meta.sourceHash || hashCode(decodedCode),
      diagramType: meta.diagramType,
    };
  } catch {
    return null;
  }
}

function collectHtmlFiles(targets: string[], maxDepth = 4): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  function visit(entryPath: string, depth: number): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(entryPath);
    } catch {
      return;
    }

    if (stat.isFile()) {
      if (path.extname(entryPath).toLowerCase() === '.html' && stat.size <= 10 * 1024 * 1024) {
        const resolved = path.resolve(entryPath);
        if (!seen.has(resolved)) {
          seen.add(resolved);
          results.push(resolved);
        }
      }
      return;
    }

    if (!stat.isDirectory() || depth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(entryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(entryPath, entry.name);
      if (entry.isDirectory()) {
        visit(full, depth + 1);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.html') {
        visit(full, depth + 1);
      }
    }
  }

  for (const rawTarget of targets) {
    visit(path.resolve(rawTarget), 0);
  }

  return results.sort();
}

/**
 * Losslessly upgrades existing `pele-*.html` card artifacts in-place using their
 * embedded `<script id="pele-card-meta">` and `<code id="pele-source-code">`
 * payloads so historical session cards gain the latest toolbar controls, CSS,
 * adaptive height (`heightMode: "auto"`), and client runtime without changing
 * their `file:///` paths.
 */
export function upgradeCardArtifacts(
  targets: string[],
  options: { dryRun?: boolean; runtimeJsOverride?: string } = {}
): UpgradeCardsSummary {
  const htmlFiles = collectHtmlFiles(targets);
  const items: UpgradedCardRecord[] = [];
  const errors: Array<{ filePath: string; error: string }> = [];
  let cardsFound = 0;
  let cardsUpgraded = 0;
  let cardsUnchanged = 0;

  for (const filePath of htmlFiles) {
    let currentHtml: string;
    try {
      currentHtml = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      errors.push({
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const parsed = parseCardHtml(currentHtml, path.basename(filePath, '.html'));
    if (!parsed) continue;

    cardsFound++;
    try {
      const rendered = renderDiagram(parsed.code, { theme: parsed.theme });
      const nextHtml = buildCardHtml({
        rendered,
        code: parsed.code,
        title: parsed.title,
        theme: parsed.theme,
        standalonePage: parsed.standalonePage,
        height: parsed.height,
        maxHeight: parsed.maxHeight,
        sourceHash: parsed.sourceHash,
        runtimeJsOverride: options.runtimeJsOverride,
      });

      const changed = nextHtml !== currentHtml;
      if (changed) {
        if (!options.dryRun) {
          writeFileAtomic(filePath, nextHtml);
        }
        cardsUpgraded++;
      } else {
        cardsUnchanged++;
      }

      items.push({
        filePath,
        title: parsed.title,
        diagramType: rendered.type,
        heightMode: typeof parsed.height === 'number' ? 'fixed' : parsed.height,
        changed,
      });
    } catch (err) {
      errors.push({
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: errors.length === 0,
    filesScanned: htmlFiles.length,
    cardsFound,
    cardsUpgraded,
    cardsUnchanged,
    errors,
    items,
  };
}
