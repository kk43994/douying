import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;

function pickArg(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return fallback;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith('-')) return fallback;
  return v;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function isProcessAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function runOrThrow(command, args, opts = {}) {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'cmd' : command;
  const finalArgs = isWin ? ['/d', '/s', '/c', command, ...args] : args;
  const result = spawnSync(cmd, finalArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`命令执行失败：${command} ${args.join(' ')}`);
  }
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref();
    return;
  }
  spawn('xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
}

async function ensureDeps() {
  const nm = path.join(ROOT, 'node_modules');
  if (existsSync(nm)) return;
  console.log('[启动] 首次运行，正在安装依赖 npm install ...');
  runOrThrow('npm', ['install']);
}

async function ensureBuild() {
  const dist = path.join(ROOT, 'dist');
  if (existsSync(dist)) return;
  console.log('[启动] 未检测到 dist，正在构建 npm run build ...');
  runOrThrow('npm', ['run', 'build']);
}

async function readPidInfo(pidPath) {
  try {
    const raw = await readFile(pidPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  const host = pickArg('--host', DEFAULT_HOST);
  const port = Number(pickArg('--port', String(DEFAULT_PORT)));
  const mode = hasFlag('--dev') ? 'dev' : 'preview';
  const noOpen = hasFlag('--no-open');
  const forceBuild = hasFlag('--build');

  const pidPath = path.join(ROOT, 'platform.pid');
  const outPath = path.join(ROOT, 'platform.out.log');
  const errPath = path.join(ROOT, 'platform.err.log');

  const existing = await readPidInfo(pidPath);
  if (existing?.pid && isProcessAlive(Number(existing.pid))) {
    const url = `http://${existing.host || host}:${existing.port || port}/`;
    if (!noOpen) await openBrowser(url);
    console.log(`[启动] 已在运行：${url}`);
    return;
  }
  if (existing) {
    await rm(pidPath, { force: true });
  }

  await ensureDeps();
  if (mode === 'preview') {
    if (forceBuild) {
      console.log('[启动] 正在构建 npm run build ...');
      runOrThrow('npm', ['run', 'build']);
    } else {
      await ensureBuild();
    }
  }

  const outFd = await open(outPath, 'a');
  const errFd = await open(errPath, 'a');

  const args =
    mode === 'dev'
      ? ['run', 'dev', '--', '--host', host, '--port', String(port), '--strictPort']
      : ['run', 'preview', '--', '--host', host, '--port', String(port), '--strictPort'];

  const isWin = process.platform === 'win32';
  const child = spawn(isWin ? 'cmd' : 'npm', isWin ? ['/d', '/s', '/c', 'npm', ...args] : args, {
    cwd: ROOT,
    env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' },
    detached: true,
    stdio: ['ignore', outFd.fd, errFd.fd],
    windowsHide: true,
  });
  child.unref();
  await outFd.close();
  await errFd.close();

  await writeFile(
    pidPath,
    JSON.stringify(
      {
        pid: child.pid,
        mode,
        host,
        port,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf-8',
  );

  const url = `http://${host}:${port}/`;
  const ok = await waitForHttp(url, 15000);
  if (!ok) {
    console.error(`[启动] 服务未就绪或启动失败：${url}`);
    console.error(`[启动] 请查看日志：${errPath}`);
    await rm(pidPath, { force: true });
    process.exitCode = 1;
    return;
  }

  if (!noOpen) await openBrowser(url);
  console.log(`[启动] OK：${url}`);
}

main().catch((err) => {
  console.error(`[启动] 失败：${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
