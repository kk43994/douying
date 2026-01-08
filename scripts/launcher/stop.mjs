import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

function isProcessAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return r.status === 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const pidPath = path.join(ROOT, 'platform.pid');
  if (!existsSync(pidPath)) {
    console.log('[关闭] 未找到 platform.pid，可能未通过“一键启动”启动。');
    return;
  }

  let info;
  try {
    info = JSON.parse(await readFile(pidPath, 'utf-8'));
  } catch {
    console.log('[关闭] platform.pid 已损坏，已清理。');
    await rm(pidPath, { force: true });
    return;
  }

  const pid = Number(info?.pid);
  if (!pid) {
    console.log('[关闭] platform.pid 缺少 pid，已清理。');
    await rm(pidPath, { force: true });
    return;
  }

  if (!isProcessAlive(pid)) {
    console.log('[关闭] 进程已不在运行，已清理 pid 文件。');
    await rm(pidPath, { force: true });
    return;
  }

  const ok = killProcessTree(pid);
  await rm(pidPath, { force: true });

  if (!ok) {
    console.log('[关闭] 关闭失败，请手动结束进程：' + pid);
    process.exitCode = 1;
    return;
  }

  console.log('[关闭] OK');
}

main().catch((err) => {
  console.error(`[关闭] 失败：${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});

