import {
  detectType,
  parse,
  PeleError,
  render,
  type DiagramType,
  type MermaidType,
} from 'pele';
import { injectStandaloneSvgTheme, type ThemeMode } from './palette.js';

export const ANTIGRAVITY_NATIVE_TYPES: ReadonlySet<DiagramType> = new Set([
  'flowchart',
  'sequence',
  'class',
  'state',
  'er',
  'xychart',
]);

export const PELE_EXCLUSIVE_TYPES: ReadonlySet<DiagramType> = new Set([
  'agentflow',
  'usecase',
  'railroad',
  'treeView',
  'venn',
  'cynefin',
  'wardley',
  'swimlane',
  'ishikawa',
  'eventmodeling',
]);

export interface RenderDiagramOptions {
  theme?: ThemeMode;
  standaloneSvg?: boolean;
  idPrefix?: string;
  padding?: number;
  responsive?: boolean;
}

export interface RenderDiagramOutput {
  svg: string;
  themedSvg: string;
  width: number;
  height: number;
  type: DiagramType;
  mermaidType: MermaidType;
  isNativeSupported: boolean;
  isPeleExclusive: boolean;
}

export interface DiagramDiagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  filePath?: string;
  line: number;
  column: number;
  snippet: string;
  diagramType: DiagramType | null;
  mermaidType: MermaidType | string | null;
}

export interface ValidateDiagramOptions {
  strictMermaid?: boolean;
  lineOffset?: number;
  filePath?: string;
}

export function normalizeLineEndings(source: string): string {
  return source.replace(/\r\n/g, '\n');
}

export function renderDiagram(
  source: string,
  options: RenderDiagramOptions = {}
): RenderDiagramOutput {
  const normalized = normalizeLineEndings(source);
  const detected = detectType(normalized);
  const res = render(normalized, {
    responsive: options.responsive ?? true,
    padding: options.padding ?? 16,
    idPrefix: options.idPrefix,
  });
  const effectiveType = detected ?? res.type;
  const theme = options.theme ?? 'flexoki';
  const themedSvg = injectStandaloneSvgTheme(res.svg, theme);
  return {
    svg: res.svg,
    themedSvg: options.standaloneSvg ? themedSvg : res.svg,
    width: res.width,
    height: res.height,
    type: effectiveType,
    mermaidType: res.mermaidType,
    isNativeSupported: ANTIGRAVITY_NATIVE_TYPES.has(effectiveType),
    isPeleExclusive: PELE_EXCLUSIVE_TYPES.has(effectiveType),
  };
}

export function validateDiagram(
  source: string,
  options: ValidateDiagramOptions = {}
): {
  valid: boolean;
  diagramType: DiagramType | null;
  mermaidType: MermaidType | string | null;
  diagnostics: DiagramDiagnostic[];
} {
  const normalized = normalizeLineEndings(source);
  const lineOffset = options.lineOffset ?? 1;
  const detected = detectType(normalized);

  try {
    const model = parse(normalized);
    const effectiveType = detected ?? model.type;
    const diagnostics: DiagramDiagnostic[] = [];
    if (options.strictMermaid && PELE_EXCLUSIVE_TYPES.has(effectiveType)) {
      diagnostics.push({
        severity: 'warning',
        code: 'pele-exclusive-diagram',
        message: `Diagram type "${effectiveType}" (${model.mermaidType}) is a Pele extension and is not supported by standard GitHub/Mermaid 12.1 renderers.`,
        filePath: options.filePath,
        line: lineOffset,
        column: 1,
        snippet: normalized.split('\n')[0] ?? '',
        diagramType: effectiveType,
        mermaidType: model.mermaidType,
      });
    }
    return {
      valid: true,
      diagramType: effectiveType,
      mermaidType: model.mermaidType,
      diagnostics,
    };
  } catch (err) {
    if (err instanceof PeleError) {
      const relativeLine = err.line > 0 ? err.line : 1;
      return {
        valid: false,
        diagramType: (err.type as DiagramType | null) ?? detected,
        mermaidType: err.mermaidType,
        diagnostics: [
          {
            severity: 'error',
            code: err.code || 'syntax',
            message: err.message,
            filePath: options.filePath,
            line: lineOffset + relativeLine - 1,
            column: err.column > 0 ? err.column : 1,
            snippet: err.snippet || '',
            diagramType: (err.type as DiagramType | null) ?? detected,
            mermaidType: err.mermaidType,
          },
        ],
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      diagramType: detected,
      mermaidType: null,
      diagnostics: [
        {
          severity: 'error',
          code: 'syntax',
          message,
          filePath: options.filePath,
          line: lineOffset,
          column: 1,
          snippet: '',
          diagramType: detected,
          mermaidType: null,
        },
      ],
    };
  }
}
