#!/usr/bin/env node
/**
 * Claude Desktop 1M Context Patcher
 * ==================================
 *
 * Enables 1M context window for 3P gateway mode by patching the `tgA`
 * function in Claude Desktop's app.asar. The `tgA` function controls
 * whether the `[1m]` suffix is appended to model names. In 3P mode,
 * GrowthBook remote features suppress this — this patch removes the
 * remote check so `[1m]` is always added for locally-configured models.
 *
 * Safe: only modifies model name handling, does NOT touch GrowthBook
 * feature initialization.
 *
 * Usage:
 *   node patch.js              Interactive patch
 *   node patch.js --status     Check current state only
 *   node patch.js --dry-run    Show what would change without applying
 *   node patch.js --force      Skip confirmations
 *   node patch.js --restore    Restore from most recent backup
 *   node patch.js --list       List available backups
 *   node patch.js --asar <p>   Use custom asar path
 */

'use strict';

const PKG = require('./package.json');

// ANSI color codes
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m',
  bgRed: '\x1b[41m', bgGreen: '\x1b[42m',
};

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const BACKUP_DIR = path.join(os.homedir(), '.claude-1m-patch', 'backups');
const WORK_DIR = path.join(os.tmpdir(), 'claude-1m-patch-work');

// Target: tgA function — controls [1m] suffix injection
const TARGET_ORIGINAL = 'function tgA(A){return/\\[1m\\]/i.test(A)||!kLt().some(t=>A.includes(t))?A:`${A}[1m]`}';
const TARGET_PATCHED  = 'function tgA(A){return/\\[1m\\]/i.test(A)?A:`${A}[1m]`}';

// ============================================================
// Utilities
// ============================================================

function fail(msg) { console.error(`\n${C.bgRed} ERROR ${C.reset} ${C.red}${C.bold}${msg}${C.reset}\n`); process.exit(1); }
function info(label, msg) { console.log(`  ${C.cyan}${label}${C.reset} ${msg}`); }
function ok(msg) { console.log(`  ${C.green}✓${C.reset} ${msg}`); }
function warn(msg) { console.log(`  ${C.yellow}⚠${C.reset} ${msg}`); }
function section(title) { console.log(`\n ${C.bold}${C.blue}${title}${C.reset}`); }
function divider() { console.log(` ${C.dim}────────────────────────────────────────${C.reset}`); }

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function run(cmd, opts = {}) {
  const result = spawnSync(cmd, [], {
    shell: true, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8',
    windowsHide: true, maxBuffer: 500 * 1024 * 1024, ...opts,
  });
  if (opts.ignoreExitCode) return { stdout: result.stdout||'', stderr: result.stderr||'', status: result.status };
  if (result.error) throw new Error(`Command failed: ${cmd}\n${result.error.message}`);
  if (result.status !== 0) throw new Error(`Exit ${result.status}:\n${result.stderr||result.stdout}`);
  return { stdout: result.stdout||'', stderr: result.stderr||'', status: result.status };
}

// ============================================================
// Asar Detection & Operations
// ============================================================

function findAsar() {
  const results = [];

  // 1) Store installs
  const storeBase = 'C:\\Program Files\\WindowsApps';
  if (fs.existsSync(storeBase)) {
    let entries = [];
    try { entries = fs.readdirSync(storeBase).filter(d => /^Claude_\d/.test(d)).sort().reverse(); }
    catch (e) {
      for (const ver of ['1.13576.4','1.13576.3','1.13576','1.13575','1.13574','1.13573','1.13560']) {
        const d = `Claude_${ver}.0_x64__pzs8sxrjxfjjc`;
        const a = path.join(storeBase, d, 'app', 'resources', 'app.asar');
        if (fs.existsSync(a)) { entries.push(d); break; }
      }
    }
    for (const d of entries) {
      const a = path.join(storeBase, d, 'app', 'resources', 'app.asar');
      if (fs.existsSync(a)) results.push({ path: a, type: 'asar' });
    }
  }

  // 2) Non-Store installs
  for (const base of [process.env.LOCALAPPDATA, path.join(os.homedir(),'AppData','Local')]) {
    if (!base) continue;
    for (const appDir of ['Claude','Claude-3p','Claude-Desktop'].map(d => path.join(base,d))) {
      if (!fs.existsSync(appDir)) continue;
      let entries = [];
      try { entries = fs.readdirSync(appDir).filter(e => /^app-/.test(e)).sort().reverse(); } catch (e) { continue; }
      for (const e of entries) {
        const a = path.join(appDir, e, 'resources', 'app.asar');
        if (fs.existsSync(a)) results.push({ path: a, type: 'asar' });
      }
    }
  }

  // 3) Extracted directory fallback
  for (const dir of [
    path.join(process.env.TEMP||'C:\\tmp', 'claude-asar-test'),
    path.join(process.env.TEMP||'C:\\tmp', 'claude-asar-extracted'),
  ]) {
    if (fs.existsSync(path.join(dir, '.vite', 'build', 'index.js')))
      results.push({ path: dir, type: 'dir' });
  }

  return results.find(r => r.type === 'asar') || results[0] || null;
}

function detectAsar() {
  const asarArgIdx = process.argv.indexOf('--asar');
  if (asarArgIdx >= 0 && asarArgIdx + 1 < process.argv.length) {
    const custom = process.argv[asarArgIdx + 1];
    if (fs.existsSync(custom)) {
      if (fs.statSync(custom).isDirectory()) {
        if (!fs.existsSync(path.join(custom, '.vite', 'build', 'index.js')))
          fail(`Extracted directory missing .vite/build/index.js: ${custom}`);
        return { path: custom, type: 'dir' };
      }
      return { path: custom, type: 'asar' };
    }
    fail(`Custom path not found: ${custom}`);
  }
  return findAsar();
}

function getAsarVersion(asarPath) {
  const tmp = path.join(os.tmpdir(), 'ver-check-' + Date.now());
  try {
    extractAsar(asarPath, tmp);
    const p = path.join(tmp, 'package.json');
    if (!fs.existsSync(p)) return 'unknown';
    const v = JSON.parse(fs.readFileSync(p, 'utf8')).version || 'unknown';
    fs.rmSync(tmp, { recursive: true, force: true });
    return v;
  } catch (e) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e2) {}
    return 'unknown';
  }
}

function extractAsar(asarPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  info('extracting', `asar → ${path.basename(destDir)}`);
  run(`npx --yes @electron/asar extract "${asarPath}" "${destDir}"`, { timeout: 120000 });
  const idx = path.join(destDir, '.vite', 'build', 'index.js');
  if (!fs.existsSync(idx)) fail(`Extract failed: .vite/build/index.js not found`);
  ok('extracted asar');
}

function packAsar(srcDir, outPath) {
  info('packing', `→ ${path.basename(outPath)}`);
  run(`npx --yes @electron/asar pack "${srcDir}" "${outPath}"`, { timeout: 120000 });
  if (!fs.existsSync(outPath)) fail(`Repack failed: ${outPath}`);
  ok('repacked asar');
}

function installAsar(patchAsar, targetAsar, version) {
  info('installing', `→ ${targetAsar}`);
  createBackup(targetAsar, 'pre-patch-orig', version);
  try {
    run(`copy /Y "${patchAsar}" "${targetAsar}"`);
    ok('installed successfully');
    return true;
  } catch (e) {
    warn('direct copy failed — trying elevated PowerShell…');
    try {
      const ps = `Copy-Item -Path "${patchAsar}" -Destination "${targetAsar}" -Force -ErrorAction Stop`;
      const r = run(
        `powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command &{${ps}; Write-Output SUCCESS}' -Wait"`,
        { ignoreExitCode: true, timeout: 60000 }
      );
      if (r.stdout && r.stdout.includes('SUCCESS')) { ok('installed via elevated PowerShell'); return true; }
    } catch (e2) {}
    warn('elevated copy failed');
    divider();
    console.log(`\n ${C.bold}${C.yellow}Manual install required:${C.reset}`);
    console.log(`\n  1. Open PowerShell as Administrator`);
    console.log(`  2. Run:\n`);
    console.log(`     ${C.cyan}Copy-Item -Path "${patchAsar}" -Destination "${targetAsar}" -Force${C.reset}\n`);
    return false;
  }
}

// ============================================================
// Backup Management
// ============================================================

function createBackup(sourcePath, label, version) {
  if (!fs.existsSync(sourcePath)) return null;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stats = fs.statSync(sourcePath);
  const ver = version || 'unknown';
  const name = `app-asar-${ver}-${timestamp()}-${label}`;
  const dest = path.join(BACKUP_DIR, name);
  info('backup', `${name} (${(stats.size/1024/1024).toFixed(1)}MB)`);
  const content = fs.readFileSync(sourcePath);
  fs.writeFileSync(dest, content);
  ok('backup created');
  return dest;
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('app-asar-')).sort().reverse();
}

function restoreLatest() {
  const backups = listBackups();
  if (!backups.length) fail('No backups found');
  const orig = backups.filter(b => b.includes('orig'));
  const latest = (orig.length ? orig : backups)[0];
  const src = path.join(BACKUP_DIR, latest);
  if (!fs.existsSync(src)) fail(`Backup not found: ${src}`);
  console.log(`\n ${C.bold}Restoring from backup:${C.reset}`);
  info('backup', latest);
  const asar = detectAsar();
  if (!asar || asar.type !== 'asar') fail('Could not locate original app.asar');
  installAsar(src, asar.path, 'restore');
  divider();
  ok(`Restored from: ${latest}`);
  return true;
}

// ============================================================
// Patch Application
// ============================================================

function checkAndApplyPatch(code) {
  section('Analysis');

  // Check current state
  const origIdx = code.indexOf(TARGET_ORIGINAL);
  const patchedIdx = code.indexOf(TARGET_PATCHED);

  if (patchedIdx >= 0) {
    ok('tgA already patched — [1m] will always be added');
    return { patched: true, code: null };
  }

  if (origIdx < 0) {
    warn('tgA function not found in expected format');
    // Try to find tgA with flexible matching
    const flexRe = /function\s+tgA\s*\(\s*A\s*\)\s*\{/;
    const fm = code.match(flexRe);
    if (fm) {
      warn(`found tgA at offset ${fm.index} but in different format`);
      return { patched: false, code: null, offset: fm.index, flex: true };
    }
    return { patched: false, code: null, offset: -1, flex: false };
  }

  ok(`found tgA at offset ${origIdx} — applying patch…`);

  // Apply: remove the `||!kLt().some(t=>A.includes(t))` part
  const before = code.substring(0, origIdx);
  const after = code.substring(origIdx + TARGET_ORIGINAL.length);
  const patched = before + TARGET_PATCHED + after;

  section('Verification');
  if (patched.includes(TARGET_PATCHED) && !patched.includes('||!kLt()')) {
    ok('tgA patch applied: removed GrowthBook remote check');
  } else {
    warn('patch verification ambiguous — please check manually');
  }

  return { patched: false, code: patched };
}

// ============================================================
// Main Patch Flow
// ============================================================

function runPatchFlow(options) {
  const { dryRun, force } = options;

  section('Environment');
  info('host', `${os.hostname()} (${os.platform()})`);
  info('node', process.version);

  section('Locating target');
  const asar = detectAsar();
  if (!asar) fail(
    'Could not locate Claude Desktop app.asar.\n' +
    '  Use --asar <path> to specify manually.\n' +
    '  Expected:\n' +
    '    • C:\\Program Files\\WindowsApps\\Claude_*\\app\\resources\\app.asar\n' +
    '    • %LOCALAPPDATA%\\Claude\\app-*\\resources\\app.asar'
  );
  info('type', asar.type);
  info('path', asar.path);

  let version = 'unknown';
  if (asar.type === 'asar') version = getAsarVersion(asar.path);
  else {
    try { version = JSON.parse(fs.readFileSync(path.join(asar.path,'package.json'),'utf8')).version || 'unknown'; } catch(e) {}
  }
  info('version', version);
  divider();

  // Read index.js
  let code, indexJsPath;
  if (asar.type === 'asar') {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
    extractAsar(asar.path, WORK_DIR);
    indexJsPath = path.join(WORK_DIR, '.vite', 'build', 'index.js');
    code = fs.readFileSync(indexJsPath, 'utf8');
  } else {
    indexJsPath = path.join(asar.path, '.vite', 'build', 'index.js');
    code = fs.readFileSync(indexJsPath, 'utf8');
  }

  // Check and apply
  const result = checkAndApplyPatch(code);

  if (result.patched) {
    ok('Patch already applied — no action needed.');
    // Cleanup if we extracted
    if (asar.type === 'asar') try { fs.rmSync(WORK_DIR, { recursive: true, force: true }); } catch(e) {}
    return { status: 'already_patched', version };
  }

  if (result.offset < 0) {
    fail('Could not locate tgA function in index.js. This version may differ.');
  }

  if (result.flex) {
    fail(
      'tgA function found but in a different format than expected.\n' +
      '  Expected: function tgA(A){return/\\[1m\\]/...||!kLt()...}\n' +
      '  This version likely needs a different patch approach.'
    );
  }

  section('Patching');
  if (dryRun) {
    warn('DRY RUN — no changes applied');
    info('would patch', 'tgA() → remove GrowthBook remote check (||!kLt().some(...))');
    return { status: 'dry_run', version };
  }

  if (!force && process.stdin.isTTY) {
    warn(`Confirm patch on ${version}?`);
    console.log(`  ${C.dim}Use --force to skip this prompt${C.reset}`);
    return { status: 'cancelled', version };
  }

  // Write
  fs.writeFileSync(indexJsPath, result.code, 'utf8');
  ok('tgA patched in index.js');

  // Verify
  const checkCode = fs.readFileSync(indexJsPath, 'utf8');
  if (checkCode.includes(TARGET_PATCHED) && !checkCode.includes('||!kLt()')) {
    ok('verified: kLt remote check removed from tgA');
  } else {
    warn('verification: could not confirm patch — please check manually');
  }

  // Pack and install
  if (asar.type === 'asar') {
    section('Pack & Install');
    const patchedAsarPath = path.join(path.dirname(WORK_DIR), 'app-patched.asar');
    packAsar(WORK_DIR, patchedAsarPath);
    createBackup(asar.path, 'pre-patch', version);
    installAsar(patchedAsarPath, asar.path, version);
    try { fs.rmSync(WORK_DIR, { recursive: true, force: true }); } catch(e) {}
  } else {
    section('Result');
    ok(`Modified in-place: ${indexJsPath}`);
    warn('Working with extracted directory — no asar operations performed');
  }

  divider();
  ok(`tgA patch applied to ${version}`);
  return { status: 'patched', version };
}

// ============================================================
// CLI & Entry
// ============================================================

function printHeader() {
  console.log(`\n ${C.bold}${C.blue}╔══════════════════════════════════════════════════╗${C.reset}`);
  console.log(` ${C.bold}${C.blue}║${C.reset}   ${C.bold}Claude Desktop 1M Context Patcher${C.reset}         ${C.bold}${C.blue}║${C.reset}`);
  console.log(` ${C.bold}${C.blue}║${C.reset}   ${C.dim}v${PKG.version} (tgA patch)${C.reset}                    ${C.bold}${C.blue}║${C.reset}`);
  console.log(` ${C.bold}${C.blue}╚══════════════════════════════════════════════════╝${C.reset}\n`);
}

function printUsage() {
  console.log(` Usage:
   ${C.cyan}node patch.js${C.reset}               Interactive
   ${C.cyan}node patch.js --status${C.reset}       Check status
   ${C.cyan}node patch.js --dry-run${C.reset}      Preview
   ${C.cyan}node patch.js --force${C.reset}         Apply without prompts
   ${C.cyan}node patch.js --restore${C.reset}      Restore from backup
   ${C.cyan}node patch.js --list${C.reset}          List backups
   ${C.cyan}node patch.js --asar <path>${C.reset}  Target custom path\n`);
}

function printSummary(result) {
  divider();
  switch (result.status) {
    case 'patched':
      ok(`${C.bold}Patch applied successfully${C.reset}`);
      warn('Restart Claude Desktop for changes to take effect');
      console.log(`  Undo: ${C.cyan}node patch.js --restore${C.reset}`);
      break;
    case 'already_patched':
      ok(`${C.bold}Already patched${C.reset}`);
      break;
    case 'dry_run':
      ok(`${C.bold}Dry run complete${C.reset}`);
      console.log(`  Run ${C.cyan}node patch.js${C.reset} to apply`);
      break;
    case 'cancelled':
      warn(`${C.bold}Operation cancelled${C.reset}`);
      break;
    default:
      warn(`Result: ${result.status}`);
  }
  console.log('');
}

function main() {
  printHeader();
  const args = process.argv.slice(2);
  const flags = new Set(args.filter(a => a.startsWith('--') || a.startsWith('-')));

  const opts = {
    status: flags.has('--status') || flags.has('-s'),
    dryRun: flags.has('--dry-run') || flags.has('--dry'),
    force: flags.has('--force') || flags.has('-f'),
    restore: flags.has('--restore') || flags.has('-r'),
    list: flags.has('--list') || flags.has('-l'),
    verbose: flags.has('--verbose') || flags.has('-v'),
  };

  try {
    if (opts.list) {
      const backups = listBackups();
      if (!backups.length) { console.log(' No backups found.\n'); return; }
      section('Available Backups');
      for (const b of backups) {
        const bp = path.join(BACKUP_DIR, b);
        const sz = fs.existsSync(bp) ? fs.statSync(bp).size : 0;
        console.log(`  ${b}  (${(sz/1024/1024).toFixed(1)}MB)`);
      }
      console.log(''); return;
    }

    if (opts.restore) {
      divider(); restoreLatest(); divider();
      ok('Restore complete');
      warn('Restart Claude Desktop for changes to take effect');
      console.log(''); return;
    }

    const result = runPatchFlow(opts);
    printSummary(result);
  } catch (e) {
    console.error(`\n${C.bgRed} UNEXPECTED ERROR ${C.reset}`);
    console.error(` ${C.red}${e.message}${C.reset}`);
    if (opts.verbose && e.stack) console.error(` ${C.dim}${e.stack}${C.reset}`);
    process.exit(1);
  }
}

main();
