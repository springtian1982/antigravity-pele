import fs from 'node:fs';
import path from 'node:path';
import { buildCardHtml, normalizeCardHeight, type CardHeightOption } from '../core/card.js';
import { checkDiagramPaths } from '../core/checker.js';
import { extractMermaidBlocks, hashCode, writeFileAtomic } from '../core/markdown.js';
import { normalizeThemeMode } from '../core/palette.js';
import { openInDefaultBrowser, resolveAppDataDir, slugify } from '../core/platform.js';
import { renderDiagram } from '../core/renderer.js';
import { upgradeCardArtifacts } from '../core/upgrader.js';
import { startStandalonePreviewServer } from '../sidecar/server.js';

const VERSION = '0.1.0';

function printHelp(): void {
  process.stdout.write(`agy-pele v${VERSION} — Cross-platform Mermaid 12.1 & Pele renderer

Usage:
  agy-pele render [input.mmd | -] [-o <out.svg|out.html>] [-f svg|html] [--theme <mode>] [--title <str>] [--height auto|compact|<px>] [--max-height <px>]
  agy-pele check <paths...> [--strict-mermaid] [--json]
  agy-pele extract <file.md> -o <out-dir> [-f svg|html] [--theme <mode>] [--height auto|compact|<px>] [--max-height <px>] [--json]
  agy-pele upgrade-cards [paths...] [--dry-run] [--json]
  agy-pele preview [target] [--port <num>] [--no-open] [--no-watch]
  agy-pele --help | --version

Themes:
  flexoki (default, light/dark auto) | flexoki-light | flexoki-dark | host
`);
}

function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function takeFlagValue(args: string[], i: number, flag: string): string {
  const next = args[i + 1];
  if (next === undefined || next.startsWith('-') && next !== '-') {
    throw new Error(`Missing value for ${flag}`);
  }
  return next;
}

async function handleRender(args: string[]): Promise<number> {
  let inputPath: string | undefined;
  let outputPath: string | undefined;
  let format: 'svg' | 'html' | undefined;
  let themeRaw: string | undefined;
  let title: string | undefined;
  let heightOpt: CardHeightOption = 'auto';
  let maxHeight: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--output') {
      outputPath = takeFlagValue(args, i, arg);
      i++;
    } else if (arg === '-f' || arg === '--format') {
      const v = takeFlagValue(args, i, arg).toLowerCase();
      if (v !== 'svg' && v !== 'html') throw new Error(`Unsupported format: ${v}`);
      format = v;
      i++;
    } else if (arg === '--theme') {
      themeRaw = takeFlagValue(args, i, arg);
      i++;
    } else if (arg === '--title') {
      title = takeFlagValue(args, i, arg);
      i++;
    } else if (arg === '--height') {
      heightOpt = normalizeCardHeight(takeFlagValue(args, i, arg));
      i++;
    } else if (arg === '--max-height') {
      const n = Number(takeFlagValue(args, i, arg));
      if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid --max-height value');
      maxHeight = n;
      i++;
    } else if (arg === '-' || !arg.startsWith('-')) {
      inputPath = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  let source: string;
  if (!inputPath || inputPath === '-') {
    if (process.stdin.isTTY && !inputPath) {
      throw new Error('Provide an input file or pipe Mermaid source via stdin.');
    }
    source = await readAllStdin();
  } else {
    source = fs.readFileSync(path.resolve(inputPath), 'utf8');
  }

  const resolvedFormat: 'svg' | 'html' =
    format ?? (outputPath && outputPath.toLowerCase().endsWith('.html') ? 'html' : 'svg');
  const theme = normalizeThemeMode(themeRaw);
  const rendered = renderDiagram(source, {
    theme,
    standaloneSvg: resolvedFormat === 'svg',
  });

  const payload =
    resolvedFormat === 'html'
      ? buildCardHtml({
          rendered,
          code: source.replace(/\r\n/g, '\n'),
          title: title || (inputPath && inputPath !== '-' ? path.basename(inputPath, path.extname(inputPath)) : 'Mermaid Diagram'),
          theme,
          standalonePage: true,
          height: heightOpt,
          maxHeight,
          sourceHash: hashCode(source),
        })
      : rendered.themedSvg;

  if (outputPath) {
    writeFileAtomic(path.resolve(outputPath), payload);
  } else {
    process.stdout.write(payload);
    if (!payload.endsWith('\n')) process.stdout.write('\n');
  }
  return 0;
}

function handleCheck(args: string[]): number {
  let strictMermaid = false;
  let json = false;
  const targets: string[] = [];

  for (const arg of args) {
    if (arg === '--strict-mermaid') strictMermaid = true;
    else if (arg === '--json') json = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else targets.push(arg);
  }

  if (targets.length === 0) targets.push('.');

  const summary = checkDiagramPaths(targets, { strictMermaid });
  if (json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    for (const d of summary.diagnostics) {
      const loc = `${d.filePath ?? '<input>'}:${d.line}:${d.column}`;
      process.stdout.write(`${loc}: ${d.severity} [${d.code}] ${d.message}\n`);
      if (d.snippet) {
        process.stdout.write(`  ${d.snippet.replace(/\n/g, '\n  ')}\n`);
      }
    }
    process.stdout.write(
      `Checked ${summary.blocksChecked} diagram(s) across ${summary.filesScanned} file(s): ${summary.errorCount} error(s), ${summary.warningCount} warning(s).\n`
    );
  }
  return summary.ok ? 0 : 1;
}

function handleExtract(args: string[]): number {
  let inputFile: string | undefined;
  let outDir = './pele-diagrams';
  let format: 'svg' | 'html' = 'svg';
  let themeRaw: string | undefined;
  let heightOpt: CardHeightOption = 'auto';
  let maxHeight: number | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--out-dir') {
      outDir = takeFlagValue(args, i, arg);
      i++;
    } else if (arg === '-f' || arg === '--format') {
      const v = takeFlagValue(args, i, arg).toLowerCase();
      if (v !== 'svg' && v !== 'html') throw new Error(`Unsupported format: ${v}`);
      format = v;
      i++;
    } else if (arg === '--theme') {
      themeRaw = takeFlagValue(args, i, arg);
      i++;
    } else if (arg === '--height') {
      heightOpt = normalizeCardHeight(takeFlagValue(args, i, arg));
      i++;
    } else if (arg === '--max-height') {
      const n = Number(takeFlagValue(args, i, arg));
      if (!Number.isFinite(n) || n <= 0) throw new Error('Invalid --max-height value');
      maxHeight = n;
      i++;
    } else if (arg === '--json') {
      json = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      inputFile = arg;
    }
  }

  if (!inputFile) throw new Error('extract requires an input Markdown file path.');
  const absInput = path.resolve(inputFile);
  const raw = fs.readFileSync(absInput, 'utf8');
  const { blocks } = extractMermaidBlocks(raw);
  const absOutDir = path.resolve(outDir);
  fs.mkdirSync(absOutDir, { recursive: true });

  const theme = normalizeThemeMode(themeRaw);
  const manifest: Array<{
    index: number;
    title: string;
    diagramType: string;
    width: number;
    height: number;
    codeStartLine: number;
    file: string;
    outputPath: string;
  }> = [];

  for (const block of blocks) {
    const rendered = renderDiagram(block.code, {
      theme,
      standaloneSvg: format === 'svg',
    });
    const num = String(block.index + 1).padStart(2, '0');
    const filename = `${num}-${rendered.type}-${slugify(block.title)}.${format}`;
    const outPath = path.join(absOutDir, filename);
    const content =
      format === 'html'
        ? buildCardHtml({
            rendered,
            code: block.code,
            title: block.title,
            theme,
            standalonePage: true,
            height: heightOpt,
            maxHeight,
            sourceHash: block.blockHash,
          })
        : rendered.themedSvg;
    writeFileAtomic(outPath, content);
    manifest.push({
      index: block.index,
      title: block.title,
      diagramType: rendered.type,
      width: rendered.width,
      height: rendered.height,
      codeStartLine: block.codeStartLine,
      file: filename,
      outputPath: outPath,
    });
  }

  const manifestPath = path.join(absOutDir, 'manifest.json');
  writeFileAtomic(manifestPath, JSON.stringify({ source: absInput, format, count: manifest.length, items: manifest }, null, 2));

  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: true, outDir: absOutDir, manifestPath, items: manifest }, null, 2)}\n`);
  } else {
    process.stdout.write(`Extracted ${manifest.length} diagram(s) to ${absOutDir}\n`);
    for (const item of manifest) {
      process.stdout.write(`  - ${item.file} (${item.diagramType}, line ${item.codeStartLine})\n`);
    }
  }
  return 0;
}

async function handlePreview(args: string[]): Promise<number> {
  let targetPath = process.cwd();
  let port = 0;
  let open = true;
  let watch = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      port = parseInt(takeFlagValue(args, i, arg), 10);
      if (!Number.isFinite(port) || port < 0) throw new Error('Invalid port');
      i++;
    } else if (arg === '--no-open') {
      open = false;
    } else if (arg === '--watch') {
      watch = true;
    } else if (arg === '--no-watch') {
      watch = false;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      targetPath = arg;
    }
  }

  const handle = await startStandalonePreviewServer({ targetPath, port, watch });
  process.stdout.write(`Pele Studio listening at ${handle.url}\n`);
  if (open) openInDefaultBrowser(handle.url);

  await new Promise<void>((resolve) => {
    const shutdown = () => {
      void handle.close().then(resolve);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
  return 0;
}

function handleUpgradeCards(args: string[]): number {
  let dryRun = false;
  let json = false;
  const explicitTargets: string[] = [];

  for (const arg of args) {
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--json') json = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else explicitTargets.push(arg);
  }

  let targets: string[];
  if (explicitTargets.length > 0) {
    for (const t of explicitTargets) {
      if (!fs.existsSync(path.resolve(t))) {
        throw new Error(`Path not found: ${t}`);
      }
    }
    targets = explicitTargets;
  } else {
    const defaultBrainDir = path.join(resolveAppDataDir(), 'brain');
    targets = fs.existsSync(defaultBrainDir) ? [defaultBrainDir] : [];
  }

  const summary = upgradeCardArtifacts(targets, { dryRun });
  if (json) {
    process.stdout.write(`${JSON.stringify({ ...summary, dryRun }, null, 2)}\n`);
  } else {
    const verb = dryRun ? 'Would upgrade' : 'Upgraded';
    process.stdout.write(
      `${verb} ${summary.cardsUpgraded} of ${summary.cardsFound} Pele card artifact(s) (${summary.cardsUnchanged} already up to date).\n`
    );
    for (const item of summary.items) {
      if (item.changed) {
        process.stdout.write(`  - ${item.filePath} (${item.diagramType}, height=${item.heightMode})\n`);
      }
    }
    for (const err of summary.errors) {
      process.stderr.write(`  ! ${err.filePath}: ${err.error}\n`);
    }
  }
  return summary.ok ? 0 : 1;
}

export async function runCli(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    printHelp();
    return 0;
  }
  if (cmd === '-v' || cmd === '--version' || cmd === 'version') {
    process.stdout.write(`agy-pele ${VERSION}\n`);
    return 0;
  }
  if (cmd === 'render') return handleRender(rest);
  if (cmd === 'check') return handleCheck(rest);
  if (cmd === 'extract') return handleExtract(rest);
  if (cmd === 'upgrade-cards') return handleUpgradeCards(rest);
  if (cmd === 'preview') return handlePreview(rest);

  throw new Error(`Unknown command: ${cmd}. Run "agy-pele --help" for usage.`);
}

runCli(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`agy-pele error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
