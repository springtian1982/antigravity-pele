import {
  buildInteractiveThemeCss,
  normalizeThemeMode,
  type ThemeMode,
} from './palette.js';
import { slugify } from './platform.js';
import type { RenderDiagramOutput } from './renderer.js';

declare const __CARD_RUNTIME_CODE__: string | undefined;

export type CardHeightOption = 'auto' | 'compact' | number;

export interface BuildCardOptions {
  rendered: RenderDiagramOutput;
  code: string;
  title?: string;
  theme?: ThemeMode;
  standalonePage?: boolean;
  height?: CardHeightOption;
  maxHeight?: number;
  sourceHash?: string;
  runtimeJsOverride?: string;
}

export function normalizeCardHeight(value: unknown): CardHeightOption {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(4000, Math.max(120, Math.round(value)));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === 'auto') return 'auto';
    if (trimmed === 'compact') return 'compact';
    const numeric = Number(trimmed.replace(/px$/i, ''));
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.min(4000, Math.max(120, Math.round(numeric)));
    }
  }
  return 'auto';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeScriptJson(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

function getRuntimeScript(override?: string): string {
  if (override) return override;
  if (typeof __CARD_RUNTIME_CODE__ === 'string' && __CARD_RUNTIME_CODE__.length > 0) {
    return __CARD_RUNTIME_CODE__;
  }
  return '';
}

/**
 * Builds a self-contained, CSP-compliant HTML card with a 40px sticky header
 * toolbar (view toggles, zoom controls, adaptive height toggle, copy button, SVG &
 * 2x PNG export) and automatic Flexoki Light/Dark adaptation.
 */
export function buildCardHtml(options: BuildCardOptions): string {
  const theme = normalizeThemeMode(options.theme);
  const title = options.title?.trim() || 'Mermaid Diagram';
  const slug = slugify(title);
  const standalone = Boolean(options.standalonePage);
  const normalizedHeight = normalizeCardHeight(options.height);
  const effectiveMaxHeight =
    typeof options.maxHeight === 'number' && Number.isFinite(options.maxHeight)
      ? Math.min(4000, Math.max(200, Math.round(options.maxHeight)))
      : standalone
        ? 2400
        : 1400;

  const estStageWidth = standalone ? 960 : 620;
  const estWidthScale = Math.min(
    1,
    Math.max(0.2, (estStageWidth - 24) / Math.max(1, options.rendered.width))
  );
  const estNaturalHeight = Math.ceil(options.rendered.height * estWidthScale + 28);

  let heightMode: 'auto' | 'compact' | 'fixed';
  let fixedHeight: number | undefined;
  let canvasHeight: number;

  if (typeof normalizedHeight === 'number') {
    heightMode = 'fixed';
    fixedHeight = normalizedHeight;
    canvasHeight = normalizedHeight;
  } else if (normalizedHeight === 'compact') {
    heightMode = 'compact';
    canvasHeight = Math.min(416, Math.max(140, estNaturalHeight));
  } else {
    heightMode = 'auto';
    canvasHeight = Math.min(effectiveMaxHeight, Math.max(120, estNaturalHeight));
  }

  const metaJson = escapeScriptJson({
    title,
    slug,
    diagramType: options.rendered.type,
    mermaidType: options.rendered.mermaidType,
    width: options.rendered.width,
    height: options.rendered.height,
    theme,
    heightMode,
    ...(fixedHeight !== undefined ? { fixedHeight } : {}),
    maxHeight: effectiveMaxHeight,
    sourceHash: options.sourceHash ?? '',
  });

  const runtimeJs = getRuntimeScript(options.runtimeJsOverride);
  const themeCss = buildInteractiveThemeCss('#pele-card');
  const bodyClass = standalone ? 'pele-body is-standalone' : 'pele-body is-inline';
  const sel = (val: ThemeMode) => (theme === val ? ' selected' : '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <style>
    ${standalone ? ':root { color-scheme: light dark; }' : ''}
    ${themeCss}
    * { box-sizing: border-box; }
    .pele-body {
      margin: 0;
      padding: ${standalone ? '20px' : '4px'};
      background: ${standalone ? 'var(--pele-surface, #f2f0e5)' : 'transparent'};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      color: var(--pele-fg);
      -webkit-font-smoothing: antialiased;
    }
    ${standalone ? `.pele-body.is-standalone:has(#pele-card[data-theme-mode^="gov"]) {
      background: #f0f6ff;
    }
    .pele-body.is-standalone:has(#pele-card[data-resolved-theme="dark"]),
    .pele-body.is-standalone:has(#pele-card[data-theme-mode="flexoki-dark"]) {
      background: #1c1b1a;
    }
    .pele-body.is-standalone:has(#pele-card[data-theme-mode^="gov"][data-resolved-theme="dark"]),
    .pele-body.is-standalone:has(#pele-card[data-theme-mode="gov-dark"]) {
      background: #0b1526;
    }` : ''}
    .pele-card {
      ${standalone ? 'max-width: 1120px; margin: 0 auto;' : ''}
      background: var(--pele-bg);
      color: var(--pele-fg);
      accent-color: var(--pele-accent);
      border: 1px solid var(--pele-border);
      border-radius: 10px;
      box-shadow: 0 1px 3px rgba(16, 15, 15, 0.08);
    }
    .pele-card:fullscreen {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      max-width: none;
      margin: 0;
      border-radius: 0;
      border: none;
    }
    .pele-card:fullscreen .pele-workspace {
      flex: 1;
      min-height: 0;
      border-radius: 0;
    }
    .pele-header {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 40px;
      padding: 4px 10px;
      background: var(--pele-surface);
      border-bottom: 1px solid var(--pele-border);
      border-radius: 9px 9px 0 0;
      flex-wrap: wrap;
    }
    .pele-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .pele-title {
      font-weight: 600;
      font-size: 13px;
      color: var(--pele-fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }
    .pele-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 7px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 999px;
      background: var(--pele-surface-alt);
      color: var(--pele-accent);
      border: 1px solid var(--pele-border);
      white-space: nowrap;
    }
    .pele-card[data-resolved-theme="dark"] .pele-badge {
      color: var(--pele-series-1, var(--pele-accent));
    }
    .pele-controls {
      display: flex;
      align-items: center;
      gap: 6px;
      position: relative;
    }
    [role="toolbar"] {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    [role="group"] {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    [role="separator"] {
      width: 1px;
      height: 16px;
      background: var(--pele-border);
      margin: 0 2px;
    }
    .pele-btn {
      appearance: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-inline-size: 26px;
      min-block-size: 26px;
      padding: 2px 7px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.2;
      color: var(--pele-fg);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
    }
    @media (hover: hover) {
      .pele-btn:hover {
        background: var(--pele-surface-alt);
        border-color: var(--pele-border);
      }
    }
    .pele-btn:focus-visible {
      outline: 2px solid var(--pele-accent);
      outline-offset: 1px;
    }
    .pele-btn[aria-pressed="true"] {
      background: var(--pele-accent);
      color: var(--pele-fg-on-dark);
      border-color: var(--pele-accent);
    }
    .pele-btn[data-copied] {
      color: var(--pele-series-3, #66800b);
      border-color: var(--pele-series-3, #66800b);
    }
    .pele-btn[data-failed] {
      color: var(--pele-critical, #af3029);
      border-color: var(--pele-critical, #af3029);
    }
    .pele-select {
      min-block-size: 26px;
      padding: 2px 6px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.2;
      color: var(--pele-fg);
      background: var(--pele-bg);
      border: 1px solid var(--pele-border);
      border-radius: 6px;
      cursor: pointer;
    }
    @media (hover: hover) {
      .pele-select:hover {
        background: var(--pele-surface-alt);
      }
    }
    .pele-select:focus-visible {
      outline: 2px solid var(--pele-accent);
      outline-offset: 1px;
    }
    .tip {
      font-size: 12px;
      color: var(--pele-muted);
      opacity: 0;
      transition: opacity 0.15s ease;
      pointer-events: none;
      white-space: nowrap;
    }
    .tip:not(:empty) {
      opacity: 1;
    }
    .pele-workspace {
      display: grid;
      grid-template-columns: 1fr;
      min-height: 120px;
      height: ${canvasHeight}px;
      border-radius: 0 0 9px 9px;
      overflow: hidden;
      background: var(--pele-bg);
    }
    .pele-card[data-view-mode="split"] .pele-workspace {
      grid-template-columns: 1.35fr 1fr;
    }
    .pele-card[data-view-mode="diagram"] .pele-code-pane {
      display: none;
    }
    .pele-card[data-view-mode="code"] .pele-stage {
      display: none;
    }
    .pele-stage {
      position: relative;
      overflow: hidden;
      cursor: grab;
      touch-action: none;
      user-select: none;
      background: var(--pele-bg);
    }
    .pele-stage.is-dragging {
      cursor: grabbing;
    }
    .pele-pan-layer {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
      will-change: transform;
    }
    .pele-pan-layer svg.pele {
      display: block;
      max-width: none !important;
      height: auto;
    }
    .pele-code-pane {
      margin: 0;
      padding: 12px 14px;
      overflow: auto;
      background: var(--pele-surface);
      border-left: 1px solid var(--pele-border);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      color: var(--pele-fg);
      white-space: pre;
    }
    .pele-card[data-view-mode="code"] .pele-code-pane {
      border-left: none;
    }
  </style>
</head>
<body class="${bodyClass}">
  <div id="pele-card" class="pele-card" data-view-mode="diagram" data-theme-mode="${theme}">
    <header class="pele-header">
      <div class="pele-title-wrap">
        <span class="pele-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <span class="pele-badge">${escapeHtml(options.rendered.type)}</span>
      </div>
      <div class="pele-controls">
        <div id="pele-toolbar" role="toolbar" focusgroup="toolbar wrap" aria-label="Diagram controls">
          <div role="group" aria-label="View mode">
            <button type="button" class="pele-btn" data-view="diagram" aria-pressed="true">视图</button>
            <button type="button" class="pele-btn" data-view="code" aria-pressed="false">源码</button>
            <button type="button" class="pele-btn" data-view="split" aria-pressed="false">分栏</button>
          </div>
          <span role="separator" aria-orientation="vertical"></span>
          <div role="group" aria-label="Theme">
            <select id="pele-theme-select" class="pele-select" aria-label="配色风格" title="切换配色风格">
              <optgroup label="默认暖墨 (Flexoki)">
                <option value="flexoki"${sel('flexoki')}>默认暖墨 (自动)</option>
                <option value="flexoki-light"${sel('flexoki-light')}>默认暖墨 (浅色)</option>
                <option value="flexoki-dark"${sel('flexoki-dark')}>默认暖墨 (深色)</option>
              </optgroup>
              <optgroup label="政务清爽 (Gov)">
                <option value="gov-light"${sel('gov-light')}>政务清爽 (浅色)</option>
                <option value="gov"${sel('gov')}>政务清爽 (自动)</option>
                <option value="gov-dark"${sel('gov-dark')}>政务清爽 (深色)</option>
              </optgroup>
              <option value="host"${sel('host')}>跟随宿主 (Host)</option>
            </select>
          </div>
          <span role="separator" aria-orientation="vertical"></span>
          <div role="group" aria-label="Zoom">
            <button type="button" id="pele-zoom-out" class="pele-btn" aria-label="Zoom out" title="Zoom out">-</button>
            <button type="button" id="pele-zoom-reset" class="pele-btn" title="Reset zoom"><span id="pele-zoom-label">100%</span></button>
            <button type="button" id="pele-zoom-in" class="pele-btn" aria-label="Zoom in" title="Zoom in">+</button>
          </div>
          <span role="separator" aria-orientation="vertical"></span>
          <div role="group" aria-label="Height mode">
            <button type="button" id="pele-height-toggle" class="pele-btn" aria-pressed="${heightMode === 'auto' ? 'true' : 'false'}" title="Toggle adaptive height">自适应</button>
            <button type="button" id="pele-fullscreen-toggle" class="pele-btn" aria-pressed="false" title="Toggle fullscreen view">全屏</button>
          </div>
          <span role="separator" aria-orientation="vertical"></span>
          <div role="group" aria-label="Export and copy">
            <button type="button" class="pele-btn copy-button" command="--copy" commandfor="pele-source-code" title="Copy Mermaid source">复制</button>
            <button type="button" id="pele-export-svg" class="pele-btn" title="Download SVG">SVG</button>
            <button type="button" id="pele-export-png" class="pele-btn" title="Download 2x PNG">PNG</button>
          </div>
        </div>
        <span id="pele-status" class="tip" role="status"></span>
      </div>
    </header>
    <div id="pele-workspace" class="pele-workspace">
      <div id="pele-stage" class="pele-stage">
        <div id="pele-pan-layer" class="pele-pan-layer">${options.rendered.svg}</div>
      </div>
      <pre class="pele-code-pane"><code id="pele-source-code">${escapeHtml(options.code)}</code></pre>
    </div>
  </div>
  <script type="application/json" id="pele-card-meta">${metaJson}</script>
  <script>${runtimeJs}</script>
</body>
</html>`;
}
