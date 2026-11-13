import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCardHtml, normalizeCardHeight } from '../core/card.js';
import { checkDiagramPaths } from '../core/checker.js';
import { extractMermaidBlocks, hashCode, writeFileAtomic } from '../core/markdown.js';
import { normalizeThemeMode } from '../core/palette.js';
import {
  isValidConversationId,
  resolveBrainDir,
  slugify,
  toFileUri,
} from '../core/platform.js';
import { renderDiagram } from '../core/renderer.js';
import { upsertStudioItem } from '../core/studio-store.js';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const STUDIO_PILL = '[Pele Studio](sidecar://antigravity-pele/pele_studio/)';

export const TOOLS: ToolDef[] = [
  {
    name: 'pele_render_card',
    description:
      'Render any of the 33 Mermaid 12.1 & Pele extended diagram types into a persistent-header Flexoki HTML card artifact and return an inline <agent-embed> tag.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Mermaid or Pele extended diagram source code.',
        },
        title: {
          type: 'string',
          description: 'Human-readable diagram title shown in the card header.',
        },
        outputPath: {
          type: 'string',
          description:
            'Optional absolute target .html artifact path. Defaults to the active conversation artifact directory.',
        },
        theme: {
          type: 'string',
          enum: ['flexoki', 'flexoki-light', 'flexoki-dark', 'host'],
          description: 'Color palette preset (default: flexoki).',
        },
        height: {
          type: 'string',
          description:
            'Card container height: "auto" (default, adapts to diagram height so portrait/vertical charts use full height), "compact" (<= 416px), or a pixel height string such as "680".',
        },
        maxHeight: {
          type: 'number',
          description: 'Maximum stage height in pixels when height is "auto" (default: 1400).',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'pele_render_artifact_svg',
    description:
      'Render a Mermaid or Pele extended diagram into a standalone Flexoki Light/Dark adaptive .svg file for embedding inside session .md artifacts.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Mermaid or Pele extended diagram source code.',
        },
        title: {
          type: 'string',
          description: 'Caption/alt text and filename slug for the SVG artifact.',
        },
        outputPath: {
          type: 'string',
          description:
            'Optional absolute target .svg path. Defaults to the active conversation artifact directory.',
        },
        theme: {
          type: 'string',
          enum: ['flexoki', 'flexoki-light', 'flexoki-dark', 'host'],
          description: 'Color palette preset (default: flexoki).',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'pele_check_markdown',
    description:
      'Validate all Mermaid fenced blocks in one or more .md / .mmd files or directories with exact file line/column diagnostics.',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'File or directory paths to scan.',
        },
        strictMermaid: {
          type: 'boolean',
          description:
            'When true, flag Pele-exclusive extended diagram types (e.g. swimlane-beta, agentflow-beta) as warnings for GitHub compatibility.',
        },
      },
      required: ['paths'],
    },
  },
  {
    name: 'pele_open_in_studio',
    description:
      'Load a Markdown/Mermaid file or draft Mermaid source into Pele Studio (sidecar AUX_PANE) and return a clickable sidecar:// pill link.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to an existing .md or .mmd file to focus in Pele Studio.',
        },
        code: {
          type: 'string',
          description: 'Optional Mermaid draft source when opening without a file.',
        },
        title: {
          type: 'string',
          description: 'Optional display title for the focused item.',
        },
      },
    },
  },
];

export function extractConversationId(params: Record<string, unknown> | undefined): string | undefined {
  if (!params) return process.env.ANTIGRAVITY_CONVERSATION_ID?.trim() || undefined;
  const meta =
    typeof params._meta === 'object' && params._meta !== null
      ? (params._meta as Record<string, unknown>)
      : undefined;
  const fromMeta = meta?.['antigravity.google/conversation_id'];
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();

  const args =
    typeof params.arguments === 'object' && params.arguments !== null
      ? (params.arguments as Record<string, unknown>)
      : undefined;
  const fromArgs = args?.conversationId ?? args?.conversation_id;
  if (typeof fromArgs === 'string' && fromArgs.trim()) return fromArgs.trim();

  return process.env.ANTIGRAVITY_CONVERSATION_ID?.trim() || undefined;
}

function resolveDefaultArtifactPath(
  convId: string | undefined,
  title: string,
  hash6: string,
  ext: 'html' | 'svg'
): string {
  const filename = `pele-${slugify(title)}-${hash6}.${ext}`;
  if (isValidConversationId(convId)) {
    return path.join(resolveBrainDir(convId), filename);
  }
  return path.join(os.tmpdir(), 'antigravity-pele', filename);
}

export function textResult(data: unknown, isError = false): Record<string, unknown> {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  convId?: string
): Record<string, unknown> {
  if (name === 'pele_render_card') {
    const code = typeof args.code === 'string' ? args.code : '';
    if (!code.trim()) {
      return textResult({ ok: false, error: 'code must be a non-empty string' }, true);
    }
    const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : 'Mermaid Diagram';
    const theme = normalizeThemeMode(typeof args.theme === 'string' ? args.theme : undefined);
    const height = normalizeCardHeight(args.height);
    const maxHeight =
      typeof args.maxHeight === 'number' && Number.isFinite(args.maxHeight) ? args.maxHeight : undefined;
    const rendered = renderDiagram(code, { theme });
    const sourceHash = hashCode(code);
    const targetPath =
      typeof args.outputPath === 'string' && args.outputPath.trim()
        ? path.resolve(args.outputPath.trim())
        : resolveDefaultArtifactPath(convId, title, sourceHash.slice(0, 6), 'html');

    const html = buildCardHtml({
      rendered,
      code: code.replace(/\r\n/g, '\n'),
      title,
      theme,
      height,
      maxHeight,
      sourceHash,
    });
    writeFileAtomic(targetPath, html);

    upsertStudioItem(convId, {
      id: `card:${targetPath}`,
      kind: 'card-artifact',
      title,
      filePath: targetPath,
      code: code.replace(/\r\n/g, '\n'),
      diagramType: rendered.type,
      sourceHash,
    });

    const estWidthScale = Math.min(1, Math.max(0.2, 596 / Math.max(1, rendered.width)));
    const estimatedCardHeight = Math.ceil(rendered.height * estWidthScale + 68);
    const isTallDiagram = height === 'auto' && estimatedCardHeight > 480;

    const fileUri = toFileUri(targetPath);
    return textResult({
      ok: true,
      diagramType: rendered.type,
      mermaidType: rendered.mermaidType,
      isNativeSupported: rendered.isNativeSupported,
      isPeleExclusive: rendered.isPeleExclusive,
      width: rendered.width,
      height: rendered.height,
      heightMode: typeof height === 'number' ? 'fixed' : height,
      estimatedCardHeight,
      isTallDiagram,
      outputPath: targetPath,
      fileUri,
      embedTag: `<agent-embed src="${fileUri}"></agent-embed>`,
      fullHeightLink: `[全高卡片视图](${fileUri})`,
      studioPill: STUDIO_PILL,
    });
  }

  if (name === 'pele_render_artifact_svg') {
    const code = typeof args.code === 'string' ? args.code : '';
    if (!code.trim()) {
      return textResult({ ok: false, error: 'code must be a non-empty string' }, true);
    }
    const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : 'Mermaid Diagram';
    const theme = normalizeThemeMode(typeof args.theme === 'string' ? args.theme : undefined);
    const rendered = renderDiagram(code, { theme, standaloneSvg: true });
    const sourceHash = hashCode(code);
    const targetPath =
      typeof args.outputPath === 'string' && args.outputPath.trim()
        ? path.resolve(args.outputPath.trim())
        : resolveDefaultArtifactPath(convId, title, sourceHash.slice(0, 6), 'svg');

    writeFileAtomic(targetPath, rendered.themedSvg);

    upsertStudioItem(convId, {
      id: `svg:${targetPath}`,
      kind: 'svg-artifact',
      title,
      filePath: targetPath,
      code: code.replace(/\r\n/g, '\n'),
      diagramType: rendered.type,
      sourceHash,
    });

    const posixPath = targetPath.replace(/\\/g, '/');
    return textResult({
      ok: true,
      diagramType: rendered.type,
      mermaidType: rendered.mermaidType,
      width: rendered.width,
      height: rendered.height,
      outputPath: targetPath,
      markdownImage: `![${title.replace(/[\[\]]/g, '')}](${posixPath})`,
      studioPill: STUDIO_PILL,
    });
  }

  if (name === 'pele_check_markdown') {
    const paths = Array.isArray(args.paths)
      ? args.paths.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
      : [];
    if (paths.length === 0) {
      return textResult({ ok: false, error: 'paths must be a non-empty array of strings' }, true);
    }
    const strictMermaid = Boolean(args.strictMermaid);
    const summary = checkDiagramPaths(paths, { strictMermaid });
    return textResult(summary, !summary.ok);
  }

  if (name === 'pele_open_in_studio') {
    const filePath = typeof args.filePath === 'string' && args.filePath.trim()
      ? path.resolve(args.filePath.trim())
      : undefined;
    const codeArg = typeof args.code === 'string' ? args.code : undefined;
    const titleArg = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : undefined;

    if (filePath) {
      if (!fs.existsSync(filePath)) {
        return textResult({ ok: false, error: `File not found: ${filePath}` }, true);
      }
      const raw = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.mmd' || ext === '.mermaid') {
        const item = upsertStudioItem(convId, {
          id: `workspace:mmd:${filePath}`,
          kind: 'mmd-file',
          title: titleArg || path.basename(filePath),
          filePath,
          code: raw.replace(/\r\n/g, '\n'),
        });
        return textResult({ ok: true, focusedId: item.id, studioPill: STUDIO_PILL });
      }
      const { blocks } = extractMermaidBlocks(raw);
      if (blocks.length === 0) {
        return textResult({ ok: false, error: `No Mermaid blocks found in ${filePath}` }, true);
      }
      const first = blocks[0];
      const item = upsertStudioItem(convId, {
        id: `workspace:md:${filePath}#${first.index}`,
        kind: 'markdown-block',
        title: titleArg || first.title,
        filePath,
        blockIndex: first.index,
        code: first.code,
        sourceHash: first.blockHash,
      });
      return textResult({
        ok: true,
        focusedId: item.id,
        blocksFound: blocks.length,
        studioPill: STUDIO_PILL,
      });
    }

    if (codeArg && codeArg.trim()) {
      const item = upsertStudioItem(convId, {
        id: `draft:${hashCode(codeArg)}`,
        kind: 'draft',
        title: titleArg || 'Session Draft',
        code: codeArg.replace(/\r\n/g, '\n'),
      });
      return textResult({ ok: true, focusedId: item.id, studioPill: STUDIO_PILL });
    }

    return textResult({ ok: true, studioPill: STUDIO_PILL });
  }

  throw new Error(`Unknown tool: ${name}`);
}
