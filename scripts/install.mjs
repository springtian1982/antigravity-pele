import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const pluginName = 'antigravity-pele';
const pluginDest = path.join(os.homedir(), '.gemini', 'config', 'plugins', pluginName);

const COPY_FILES = [
  'plugin.json',
  'mcp_config.json',
  'package.json',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
];

const COPY_DIRS = [
  'assets',
  'rules',
  'skills',
  'sidecars',
  'dist',
  'bin',
];

function copyFileAtomic(src, dst, mode) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const tmp = `${dst}.pele-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    fs.copyFileSync(src, tmp);
    if (mode !== undefined) {
      fs.chmodSync(tmp, mode);
    }
    fs.renameSync(tmp, dst);
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
    } catch {
      // Ignore temp cleanup failure
    }
  }
}

function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
    return;
  }
  copyFileAtomic(src, dst, stat.mode & 0o777);
}

function uninstall() {
  if (fs.existsSync(pluginDest)) {
    fs.rmSync(pluginDest, { recursive: true, force: true });
    console.log(`Removed plugin directory: ${pluginDest}`);
  }
  const localBin = path.join(os.homedir(), '.local', 'bin');
  for (const name of ['agy-pele', 'agy-pele.cmd', 'agy-pele.ps1']) {
    const p = path.join(localBin, name);
    if (fs.existsSync(p) || fs.lstatSync(p, { throwIfNoEntry: false })) {
      fs.rmSync(p, { force: true });
      console.log(`Removed CLI launcher: ${p}`);
    }
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    const npmBin = path.join(process.env.APPDATA, 'npm');
    for (const name of ['agy-pele.cmd', 'agy-pele.ps1']) {
      const p = path.join(npmBin, name);
      if (fs.existsSync(p)) {
        fs.rmSync(p, { force: true });
        console.log(`Removed Windows npm launcher: ${p}`);
      }
    }
  }
}

function install() {
  if (!fs.existsSync(path.join(repoRoot, 'dist', 'cli.cjs'))) {
    throw new Error('Missing dist/cli.cjs — run "npm run build" first.');
  }

  // Update in place without deleting pluginDest so running MCP/sidecar processes keep a valid cwd inode.
  fs.mkdirSync(pluginDest, { recursive: true });

  for (const file of COPY_FILES) {
    const src = path.join(repoRoot, file);
    if (fs.existsSync(src)) {
      copyFileAtomic(src, path.join(pluginDest, file));
    }
  }

  for (const dir of COPY_DIRS) {
    const src = path.join(repoRoot, dir);
    if (fs.existsSync(src)) {
      copyRecursive(src, path.join(pluginDest, dir));
    }
  }

  const localBin = path.join(os.homedir(), '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });

  if (process.platform === 'win32') {
    const installedCli = path.join(pluginDest, 'dist', 'cli.cjs');
    const cmdContent = [
      '@echo off',
      'setlocal',
      `set "CLI_ENTRY=${installedCli}"`,
      'where node >nul 2>nul && (node "%CLI_ENTRY%" %* & exit /b %ERRORLEVEL%)',
      'where agy-node >nul 2>nul && (agy-node "%CLI_ENTRY%" %* & exit /b %ERRORLEVEL%)',
      'if exist "%APPDATA%\\Antigravity\\bin\\agy-node.exe" ("%APPDATA%\\Antigravity\\bin\\agy-node.exe" "%CLI_ENTRY%" %* & exit /b %ERRORLEVEL%)',
      'if exist "%LOCALAPPDATA%\\Programs\\Antigravity\\bin\\agy-node.exe" ("%LOCALAPPDATA%\\Programs\\Antigravity\\bin\\agy-node.exe" "%CLI_ENTRY%" %* & exit /b %ERRORLEVEL%)',
      'echo agy-pele: neither node nor agy-node.exe found. 1>&2',
      'exit /b 127',
      '',
    ].join('\r\n');
    const ps1Content = [
      '$ErrorActionPreference = "Stop"',
      `$CliEntry = "${installedCli.replace(/"/g, '`"')}"`,
      '$NodeCmd = Get-Command node -ErrorAction SilentlyContinue',
      'if (-not $NodeCmd) { $NodeCmd = Get-Command agy-node -ErrorAction SilentlyContinue }',
      'if ($NodeCmd) { & $NodeCmd.Source $CliEntry @args; exit $LASTEXITCODE }',
      '$Fallbacks = @((Join-Path $env:APPDATA "Antigravity\\bin\\agy-node.exe"), (Join-Path $env:LOCALAPPDATA "Programs\\Antigravity\\bin\\agy-node.exe"))',
      'foreach ($F in $Fallbacks) { if ($F -and (Test-Path $F)) { & $F $CliEntry @args; exit $LASTEXITCODE } }',
      'Write-Error "agy-pele: neither node nor agy-node.exe found."',
      'exit 127',
      '',
    ].join('\r\n');

    fs.writeFileSync(path.join(localBin, 'agy-pele.cmd'), cmdContent, 'utf8');
    fs.writeFileSync(path.join(localBin, 'agy-pele.ps1'), ps1Content, 'utf8');
    if (process.env.APPDATA) {
      const npmBin = path.join(process.env.APPDATA, 'npm');
      if (fs.existsSync(npmBin)) {
        fs.writeFileSync(path.join(npmBin, 'agy-pele.cmd'), cmdContent, 'utf8');
        fs.writeFileSync(path.join(npmBin, 'agy-pele.ps1'), ps1Content, 'utf8');
      }
    }
    console.log(`Installed plugin to ${pluginDest}`);
    console.log(`Installed Windows CLI wrappers to ${localBin}`);
  } else {
    const installedShim = path.join(pluginDest, 'bin', 'agy-pele');
    const installedCli = path.join(pluginDest, 'dist', 'cli.cjs');
    fs.chmodSync(installedShim, 0o755);
    fs.chmodSync(installedCli, 0o755);

    const targetLink = path.join(localBin, 'agy-pele');
    fs.rmSync(targetLink, { force: true });
    fs.symlinkSync(installedShim, targetLink);
    console.log(`Installed plugin to ${pluginDest}`);
    console.log(`Linked CLI launcher: ${targetLink} -> ${installedShim}`);
  }
}

if (process.argv.includes('--uninstall')) {
  uninstall();
} else {
  install();
}
