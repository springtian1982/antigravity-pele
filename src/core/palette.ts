export type ThemeMode =
  | 'flexoki'
  | 'flexoki-light'
  | 'flexoki-dark'
  | 'gov'
  | 'gov-light'
  | 'gov-dark'
  | 'host';

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

export const GOV_LIGHT: Record<string, string> = {
  '--pele-bg': '#ffffff',
  '--pele-fg': '#0f2744',
  '--pele-muted': '#415a77',
  '--pele-line': '#1e4e8c',
  '--pele-surface': '#f0f6ff',
  '--pele-surface-alt': '#e0ecff',
  '--pele-border': '#6488b8',
  '--pele-accent': '#0f5ec7',
  '--pele-critical': '#c92a2a',
  '--pele-error': '#c92a2a',
  '--pele-fg-on-dark': '#ffffff',
  '--pele-fg-on-light': '#0f2744',
  '--pele-radius': '4px',
  '--pele-series-1': '#0f5ec7',
  '--pele-series-2': '#0d9488',
  '--pele-series-3': '#15803d',
  '--pele-series-4': '#0284c7',
  '--pele-series-5': '#b45309',
  '--pele-series-6': '#c92a2a',
  '--pele-series-7': '#4338ca',
  '--pele-series-8': '#0f766e',
};

export const GOV_DARK: Record<string, string> = {
  '--pele-bg': '#0b1526',
  '--pele-fg': '#e6f0ff',
  '--pele-muted': '#94afd3',
  '--pele-line': '#7cb3ff',
  '--pele-surface': '#13233d',
  '--pele-surface-alt': '#1c3257',
  '--pele-border': '#4772ad',
  '--pele-accent': '#2f7de1',
  '--pele-critical': '#f87171',
  '--pele-error': '#f87171',
  '--pele-fg-on-dark': '#ffffff',
  '--pele-fg-on-light': '#0f2744',
  '--pele-radius': '4px',
  '--pele-series-1': '#529bff',
  '--pele-series-2': '#2dd4bf',
  '--pele-series-3': '#4ade80',
  '--pele-series-4': '#38bdf8',
  '--pele-series-5': '#fbbf24',
  '--pele-series-6': '#f87171',
  '--pele-series-7': '#818cf8',
  '--pele-series-8': '#34d399',
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
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'flexoki-light' || normalized === 'light') return 'flexoki-light';
  if (normalized === 'flexoki-dark' || normalized === 'dark') return 'flexoki-dark';
  if (normalized === 'gov' || normalized === 'government' || normalized === 'gov-auto' || normalized === 'civic') {
    return 'gov';
  }
  if (normalized === 'gov-light' || normalized === 'government-light' || normalized === 'civic-light') {
    return 'gov-light';
  }
  if (normalized === 'gov-dark' || normalized === 'government-dark' || normalized === 'civic-dark') {
    return 'gov-dark';
  }
  if (normalized === 'host') return 'host';
  return 'flexoki';
}

export function getFixedSchemeForTheme(mode?: string): 'light' | 'dark' | null {
  const normalized = mode?.trim().toLowerCase();
  if (normalized === 'flexoki-light' || normalized === 'gov-light' || normalized === 'light') {
    return 'light';
  }
  if (normalized === 'flexoki-dark' || normalized === 'gov-dark' || normalized === 'dark') {
    return 'dark';
  }
  return null;
}

function formatDeclBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
}

function formatSeriesDeclBlock(vars: Record<string, string>, indent = '    '): string {
  return Array.from({ length: 8 }, (_, idx) => {
    const key = `--pele-series-${idx + 1}`;
    return `${indent}${key}: ${vars[key]};`;
  }).join('\n');
}

function buildAutoThemeCss(
  selector: string,
  lightVars: Record<string, string>,
  darkVars: Record<string, string>
): string {
  return [
    `${selector} {\n${formatDeclBlock(lightVars)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  ${selector}:not([data-resolved-theme="light"]) {\n${formatDeclBlock(darkVars)}\n  }\n}`,
    `:root.dark ${selector}:not([data-resolved-theme="light"]),\n${selector}[data-resolved-theme="dark"] {\n${formatDeclBlock(darkVars)}\n}`,
    `:root.light ${selector}:not([data-resolved-theme="dark"]),\n${selector}[data-resolved-theme="light"] {\n${formatDeclBlock(lightVars)}\n}`,
  ].join('\n');
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
  if (mode === 'gov-light') {
    return `${selector} {\n${formatDeclBlock(GOV_LIGHT)}\n}`;
  }
  if (mode === 'gov-dark') {
    return `${selector} {\n${formatDeclBlock(GOV_DARK)}\n}`;
  }
  if (mode === 'gov') {
    return buildAutoThemeCss(selector, GOV_LIGHT, GOV_DARK);
  }
  if (mode === 'host') {
    return [
      `${selector} {\n${formatDeclBlock(HOST_BRIDGE_VARS)}\n}`,
      `@media (prefers-color-scheme: dark) {\n  ${selector} {\n${formatSeriesDeclBlock(FLEXOKI_DARK)}\n  }\n}`,
    ].join('\n');
  }

  return buildAutoThemeCss(selector, FLEXOKI_LIGHT, FLEXOKI_DARK);
}

/**
 * Generates multi-theme CSS rules scoped to `selector[data-theme-mode="..."]`
 * so interactive HTML cards and Pele Studio can switch between Flexoki,
 * Government Clean, and Host palettes dynamically on the client without FOUC.
 */
export function buildInteractiveThemeCss(selector: string): string {
  return [
    `${selector} {\n  color-scheme: light dark;\n${formatDeclBlock(FLEXOKI_LIGHT)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  ${selector}:not([data-theme-mode]):not([data-resolved-theme="light"]),\n  ${selector}[data-theme-mode="flexoki"]:not([data-resolved-theme="light"]) {\n${formatDeclBlock(FLEXOKI_DARK)}\n  }\n}`,
    `:root.dark ${selector}:not([data-theme-mode]):not([data-resolved-theme="light"]),\n:root.dark ${selector}[data-theme-mode="flexoki"]:not([data-resolved-theme="light"]),\n${selector}[data-theme-mode="flexoki"][data-resolved-theme="dark"] {\n${formatDeclBlock(FLEXOKI_DARK)}\n}`,
    `:root.light ${selector}:not([data-theme-mode]):not([data-resolved-theme="dark"]),\n:root.light ${selector}[data-theme-mode="flexoki"]:not([data-resolved-theme="dark"]),\n${selector}[data-theme-mode="flexoki"][data-resolved-theme="light"] {\n${formatDeclBlock(FLEXOKI_LIGHT)}\n}`,
    `${selector}[data-theme-mode="flexoki-light"] {\n  color-scheme: light;\n${formatDeclBlock(FLEXOKI_LIGHT)}\n}`,
    `${selector}[data-theme-mode="flexoki-dark"] {\n  color-scheme: dark;\n${formatDeclBlock(FLEXOKI_DARK)}\n}`,
    `${selector}[data-theme-mode="gov"] {\n  color-scheme: light dark;\n${formatDeclBlock(GOV_LIGHT)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  ${selector}[data-theme-mode="gov"]:not([data-resolved-theme="light"]) {\n${formatDeclBlock(GOV_DARK)}\n  }\n}`,
    `:root.dark ${selector}[data-theme-mode="gov"]:not([data-resolved-theme="light"]),\n${selector}[data-theme-mode="gov"][data-resolved-theme="dark"] {\n${formatDeclBlock(GOV_DARK)}\n}`,
    `:root.light ${selector}[data-theme-mode="gov"]:not([data-resolved-theme="dark"]),\n${selector}[data-theme-mode="gov"][data-resolved-theme="light"] {\n${formatDeclBlock(GOV_LIGHT)}\n}`,
    `${selector}[data-theme-mode="gov-light"] {\n  color-scheme: light;\n${formatDeclBlock(GOV_LIGHT)}\n}`,
    `${selector}[data-theme-mode="gov-dark"] {\n  color-scheme: dark;\n${formatDeclBlock(GOV_DARK)}\n}`,
    `${selector}[data-theme-mode="host"] {\n  color-scheme: light dark;\n${formatDeclBlock(HOST_BRIDGE_VARS)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  ${selector}[data-theme-mode="host"]:not([data-resolved-theme="light"]) {\n${formatSeriesDeclBlock(FLEXOKI_DARK)}\n  }\n}`,
    `:root.dark ${selector}[data-theme-mode="host"]:not([data-resolved-theme="light"]),\n${selector}[data-theme-mode="host"][data-resolved-theme="dark"] {\n${formatSeriesDeclBlock(FLEXOKI_DARK, '  ')}\n}`,
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
