import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface MermaidBlock {
  index: number;
  title: string;
  code: string;
  indent: string;
  fenceStartLine: number;
  codeStartLine: number;
  fenceEndLine: number;
  codeStartOffset: number;
  codeEndOffset: number;
  blockHash: string;
}

export interface ExtractedMarkdown {
  eol: '\r\n' | '\n';
  blocks: MermaidBlock[];
}

export class HashConflictError extends Error {
  readonly code = 'HASH_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'HashConflictError';
  }
}

export function hashCode(code: string): string {
  const normalized = code.replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

interface RawLine {
  text: string;
  startOffset: number;
  endOffset: number;
  eolLength: number;
}

function splitLinesWithOffsets(raw: string): RawLine[] {
  const lines: RawLine[] = [];
  let pos = 0;
  while (pos <= raw.length) {
    const lfIdx = raw.indexOf('\n', pos);
    if (lfIdx === -1) {
      lines.push({
        text: raw.slice(pos),
        startOffset: pos,
        endOffset: raw.length,
        eolLength: 0,
      });
      break;
    }
    const hasCr = lfIdx > pos && raw.charCodeAt(lfIdx - 1) === 13;
    const textEnd = hasCr ? lfIdx - 1 : lfIdx;
    lines.push({
      text: raw.slice(pos, textEnd),
      startOffset: pos,
      endOffset: textEnd,
      eolLength: hasCr ? 2 : 1,
    });
    pos = lfIdx + 1;
    if (pos === raw.length) {
      // Trailing newline ends the file; don't emit a phantom empty trailing line unless needed.
      break;
    }
  }
  return lines;
}

function extractTitleHint(info: string | undefined, code: string, lastHeading: string | undefined, index: number): string {
  if (info && info.trim()) {
    const cleaned = info.trim().replace(/^["']|["']$/g, '');
    if (cleaned) return cleaned;
  }
  // Check Mermaid frontmatter or `title ...` directive
  const fmMatch = /^---\n[\s\S]*?title:\s*["']?([^\n"']+)["']?[\s\S]*?\n---/m.exec(code);
  if (fmMatch?.[1]?.trim()) return fmMatch[1].trim();
  const titleLine = /^\s*title\s+([^\r\n]+)/m.exec(code);
  if (titleLine?.[1]?.trim()) return titleLine[1].trim();
  if (lastHeading) return lastHeading;
  return `Diagram ${index + 1}`;
}

/**
 * Scans Markdown text for fenced ```mermaid or ~~~mermaid blocks while tracking
 * exact 1-based line numbers and byte/UTF-16 offsets across LF and CRLF files.
 */
export function extractMermaidBlocks(markdownContent: string): ExtractedMarkdown {
  const eol: '\r\n' | '\n' = markdownContent.includes('\r\n') ? '\r\n' : '\n';
  const lines = splitLinesWithOffsets(markdownContent);
  const blocks: MermaidBlock[] = [];

  const openFenceRe = /^([ \t]*)(`{3,}|~{3,})[ \t]*([^\r\n]*)$/;
  const headingRe = /^#{1,6}\s+(.+?)\s*#*$/;

  let inOtherFence = false;
  let otherFenceChar = '';
  let otherFenceLen = 0;

  let inMermaid = false;
  let mIndent = '';
  let mFenceChar = '';
  let mFenceLen = 0;
  let mInfo = '';
  let mFenceStartLine = 0;
  let mCodeStartLine = 0;
  let mCodeStartOffset = 0;
  let mCodeLines: string[] = [];
  let lastHeading: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (inOtherFence) {
      const trimmed = line.text.trimStart();
      if (
        trimmed.startsWith(otherFenceChar.repeat(otherFenceLen)) &&
        trimmed.slice(otherFenceLen).replace(new RegExp(`^${otherFenceChar}+`), '').trim() === ''
      ) {
        inOtherFence = false;
      }
      continue;
    }

    if (inMermaid) {
      const trimmed = line.text.trimStart();
      const closeRe = new RegExp(`^${mFenceChar}{${mFenceLen},}[ \\t]*$`);
      if (closeRe.test(trimmed)) {
        const prevLine = lines[i - 1];
        const codeEndOffset =
          mCodeLines.length === 0
            ? mCodeStartOffset
            : prevLine.endOffset;
        const code = mCodeLines.join('\n');
        const index = blocks.length;
        blocks.push({
          index,
          title: extractTitleHint(mInfo, code, lastHeading, index),
          code,
          indent: mIndent,
          fenceStartLine: mFenceStartLine,
          codeStartLine: mCodeStartLine,
          fenceEndLine: lineNum,
          codeStartOffset: mCodeStartOffset,
          codeEndOffset,
          blockHash: hashCode(code),
        });
        inMermaid = false;
        mCodeLines = [];
      } else {
        const unindented =
          mIndent && line.text.startsWith(mIndent)
            ? line.text.slice(mIndent.length)
            : line.text;
        mCodeLines.push(unindented);
      }
      continue;
    }

    const headingMatch = headingRe.exec(line.text);
    if (headingMatch) {
      lastHeading = headingMatch[1].trim();
      continue;
    }

    const openMatch = openFenceRe.exec(line.text);
    if (openMatch) {
      const indent = openMatch[1];
      const fence = openMatch[2];
      const infoRaw = openMatch[3].trim();
      const fenceChar = fence[0];
      const fenceLen = fence.length;
      const langToken = infoRaw.split(/\s+/)[0]?.toLowerCase() ?? '';

      if (langToken === 'mermaid') {
        inMermaid = true;
        mIndent = indent;
        mFenceChar = fenceChar;
        mFenceLen = fenceLen;
        mInfo = infoRaw.slice('mermaid'.length).trim();
        mFenceStartLine = lineNum;
        mCodeStartLine = lineNum + 1;
        mCodeStartOffset = line.endOffset + line.eolLength;
        mCodeLines = [];
      } else {
        inOtherFence = true;
        otherFenceChar = fenceChar;
        otherFenceLen = fenceLen;
      }
    }
  }

  return { eol, blocks };
}

export function writeFileAtomic(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.pele-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } finally {
    try {
      if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Safely replaces a single fenced Mermaid block in a Markdown file after verifying
 * that the target block's content hash matches `expectedHash`. Preserves file EOL.
 */
export function replaceMermaidBlockInFile(
  filePath: string,
  blockIndex: number,
  expectedHash: string,
  newCode: string
): { updatedHash: string; codeStartLine: number; fenceEndLine: number } {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { eol, blocks } = extractMermaidBlocks(raw);
  const block = blocks[blockIndex];
  if (!block) {
    throw new Error(`Mermaid block #${blockIndex} not found in ${filePath}`);
  }
  if (block.blockHash !== expectedHash) {
    throw new HashConflictError(
      `Block #${blockIndex} in ${filePath} changed on disk (expected ${expectedHash}, found ${block.blockHash}).`
    );
  }

  const normalizedNew = newCode.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  const indentedBody = normalizedNew
    .split('\n')
    .map((line) => (line.length > 0 && block.indent ? `${block.indent}${line}` : line))
    .join(eol);

  const before = raw.slice(0, block.codeStartOffset);
  const after = raw.slice(block.codeEndOffset);
  const replacement = block.codeEndOffset === block.codeStartOffset && indentedBody.length > 0
    ? `${indentedBody}${eol}`
    : indentedBody;
  const updatedRaw = `${before}${replacement}${after}`;

  writeFileAtomic(filePath, updatedRaw);

  const reParsed = extractMermaidBlocks(updatedRaw).blocks[blockIndex];
  return {
    updatedHash: reParsed?.blockHash ?? hashCode(normalizedNew),
    codeStartLine: reParsed?.codeStartLine ?? block.codeStartLine,
    fenceEndLine: reParsed?.fenceEndLine ?? block.fenceEndLine,
  };
}
