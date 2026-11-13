export type ThemeMode = 'flexoki' | 'flexoki-light' | 'flexoki-dark' | 'host';

export const FLEXOKI_LIGHT: Record<string, string> = {
  '--pele-bg': '#fffcf0',
  '--pele-fg': '#100f0f',
  '--pele-muted': '#6f6e69',
  '--pele-line': '#100f0f',
  '--pele-surface': '#f2f0e5',
  '--pele-surface-alt': '#e6e4d9',
  '--pele-border': '#cecdc3',
  '--pele-accent': '#205ea6',
  '--pele-critical': '#af3029',
  '--pele-error': '#af3029',
  '--pele-fg-on-dark': '#fffcf0',
  '--pele-fg-on-light': '#100f0f',
  '--pele-radius': '6px',
  '--pele-series-1': '#205ea6',
  '--pele-series-2': '#24837b',
  '--pele-series-3': '#66800b',
  '--pele-series-4': '#ad8301',
  '--pele-series-5': '#bc5215',
  '--pele-series-6': '#af3029',
  '--pele-series-7': '#5e409d',
  '--pele-series-8': '#a02f6f',
};

export const FLEXOKI_DARK: Record<string, string> = {
  '--pele-bg': '#100f0f',
  '--pele-fg': '#cecdc3',
  '--pele-muted': '#878580',
  '--pele-line': '#cecdc3',
  '--pele-surface': '#1c1b1a',
  '--pele-surface-alt': '#282726',
  '--pele-border': '#403e3c',
  '--pele-accent': '#4385be',
  '--pele-critical': '#d14d41',
  '--pele-error': '#d14d41',
  '--pele-fg-on-dark': '#fffcf0',
  '--pele-fg-on-light': '#100f0f',
  '--pele-radius': '6px',
  '--pele-series-1': '#4385be',
  '--pele-series-2': '#3aa99f',
  '--pele-series-3': '#879a39',
  '--pele-series-4': '#d0a215',
  '--pele-series-5': '#da702c',
  '--pele-series-6': '#d14d41',
  '--pele-series-7': '#8b7ec8',
  '--pele-series-8': '#ce5d97',
};

export const HOST_BRIDGE_VARS: Record<string, string> = {
  '--pele-bg': 'var(--card, #fffcf0)',
  '--pele-fg': 'var(--foreground, #100f0f)',
  '--pele-muted': 'var(--muted-foreground, #6f6e69)',
  '--pele-line': 'var(--foreground, #100f0f)',
  '--pele-surface': 'var(--secondary, #f2f0e5)',
  '--pele-surface-alt': 'var(--background, #e6e4d9)',
  '--pele-border': 'var(--border, #cecdc3)',
  '--pele-accent': 'var(--primary, #205ea6)',
  '--pele-critical': 'var(--destructive, #af3029)',
  '--pele-error': 'var(--destructive, #af3029)',
  '--pele-fg-on-dark': '#fffcf0',
  '--pele-fg-on-light': '#100f0f',
  '--pele-radius': '6px',
  '--pele-series-1': '#205ea6',
  '--pele-series-2': '#24837b',
  '--pele-series-3': '#66800b',
  '--pele-series-4': '#ad8301',
  '--pele-series-5': '#bc5215',
  '--pele-series-6': '#af3029',
  '--pele-series-7': '#5e409d',
  '--pele-series-8': '#a02f6f',
};

export function normalizeThemeMode(raw?: string): ThemeMode {
  if (raw === 'flexoki-light' || raw === 'light') return 'flexoki-light';
  if (raw === 'flexoki-dark' || raw === 'dark') return 'flexoki-dark';
  if (raw === 'host') return 'host';
  return 'flexoki';
}

function formatDeclBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
}

/**
 * Generates CSS variable rules scoped to `selector` without touching `:root`
 * host tokens. Supports automatic system/host switching plus explicit
 * `data-resolved-theme="light|dark"` overrides.
 */
export function buildThemeCss(selector: string, mode: ThemeMode = 'flexoki'): string {
  if (mode === 'flexoki-light') {
    return `${selector} {\n${formatDeclBlock(FLEXOKI_LIGHT)}\n}`;
  }
  if (mode === 'flexoki-dark') {
    return `${selector} {\n${formatDeclBlock(FLEXOKI_DARK)}\n}`;
  }
  if (mode === 'host') {
    return [
      `${selector} {\n${formatDeclBlock(HOST_BRIDGE_VARS)}\n}`,
      `@media (prefers-color-scheme: dark) {\n  ${selector} {\n    --pele-series-1: ${FLEXOKI_DARK['--pele-series-1']};\n    --pele-series-2: ${FLEXOKI_DARK['--pele-series-2']};\n    --pele-series-3: ${FLEXOKI_DARK['--pele-series-3']};\n    --pele-series-4: ${FLEXOKI_DARK['--pele-series-4']};\n    --pele-series-5: ${FLEXOKI_DARK['--pele-series-5']};\n    --pele-series-6: ${FLEXOKI_DARK['--pele-series-6']};\n    --pele-series-7: ${FLEXOKI_DARK['--pele-series-7']};\n    --pele-series-8: ${FLEXOKI_DARK['--pele-series-8']};\n  }\n}`,
    ].join('\n');
  }

  // 'flexoki' (auto): Light default + dark media query + explicit host class / attribute hooks.
  return [
    `${selector} {\n${formatDeclBlock(FLEXOKI_LIGHT)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  ${selector}:not([data-resolved-theme="light"]) {\n${formatDeclBlock(FLEXOKI_DARK)}\n  }\n}`,
    `:root.dark ${selector}:not([data-resolved-theme="light"]),\n${selector}[data-resolved-theme="dark"] {\n${formatDeclBlock(FLEXOKI_DARK)}\n}`,
    `:root.light ${selector}:not([data-resolved-theme="dark"]),\n${selector}[data-resolved-theme="light"] {\n${formatDeclBlock(FLEXOKI_LIGHT)}\n}`,
  ].join('\n');
}

/**
 * Injects an adaptive Flexoki `<style>` block directly into a standalone SVG
 * document so it renders with rounded background and crisp contrast in both
 * light and dark Markdown artifact viewers.
 */
export function injectStandaloneSvgTheme(svg: string, mode: ThemeMode = 'flexoki'): string {
  const css = [
    buildThemeCss('svg.pele', mode),
    'svg.pele { background-color: var(--pele-bg); border-radius: 8px; }',
  ].join('\n');
  const styleTag = `<style>${css}</style>`;
  const openTagEnd = svg.indexOf('>');
  if (openTagEnd === -1) return svg;
  return `${svg.slice(0, openTagEnd + 1)}${styleTag}${svg.slice(openTagEnd + 1)}`;
}
