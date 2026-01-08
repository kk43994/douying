#!/usr/bin/env node
/**
 * 豆包语音「大模型录音文件极速版识别API（flash）」自检脚本
 *
 * 依赖：
 *   - ffmpeg-static（用于把 mp4 抽取成 mp3）
 *
 * 必需环境变量：
 *   DOUBAO_ASR_APP_ID        对应 Header：X-Api-App-Key（控制台 APP ID）
 *   DOUBAO_ASR_ACCESS_TOKEN  对应 Header：X-Api-Access-Key（控制台 Access Token）
 *
 * 用法：
 *   node scripts/test-doubao-bigasr-flash.mjs --video "C:\\path\\to\\demo.mp4"
 *   node scripts/test-doubao-bigasr-flash.mjs --audio "C:\\path\\to\\demo.mp3"
 *
 * 可选参数：
 *   --resource-id <id>   默认：volc.bigasr.auc_turbo
 */

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith('--')) return '';
  return value;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function mask(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return `len=${s.length}`;
}

function usageAndExit(code = 0) {
  console.log(
    `
豆包语音（大模型录音文件极速版识别API - flash）自检脚本

必需环境变量：
  DOUBAO_ASR_APP_ID
  DOUBAO_ASR_ACCESS_TOKEN

参数：
  --video <path>        本地 mp4 视频文件（会自动抽取音频）
  --audio <path>        本地音频文件（mp3/wav/ogg 等）
  --resource-id <id>    默认 volc.bigasr.auc_turbo

示例：
  $env:DOUBAO_ASR_APP_ID=\"123\"
  $env:DOUBAO_ASR_ACCESS_TOKEN=\"xxx\"
  node scripts/test-doubao-bigasr-flash.mjs --video \"C:\\\\demo.mp4\"
`.trim()
  );
  process.exit(code);
}

async function extractMp3FromMp4(mp4Path) {
  const ffmpeg = (await import('ffmpeg-static')).default;
  if (!ffmpeg) throw new Error('ffmpeg-static 未能提供 ffmpeg 路径');

  const tmpRoot = await mkdtemp(join(tmpdir(), 'douying-asr-test-'));
  const mp3Path = join(tmpRoot, 'audio.mp3');

  const cleanup = async () => {
    try {
      await rm(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  try {
    await new Promise((resolve, reject) => {
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        mp4Path,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-b:a',
        '64k',
        mp3Path,
      ];
      const child = spawn(ffmpeg, args, { windowsHide: true });
      let stderr = '';
      child.stderr?.on('data', (d) => (stderr += String(d)));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve();
        reject(new Error(`ffmpeg 转码失败（exit=${code}）${stderr.trim() ? `：${stderr.trim()}` : ''}`));
      });
    });

    const mp3Buf = await readFile(mp3Path);
    if (!mp3Buf.byteLength) throw new Error('抽取音频失败：输出为空');
    return mp3Buf;
  } finally {
    await cleanup();
  }
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) usageAndExit(0);

  const appKey = String(process.env.DOUBAO_ASR_APP_ID || '').trim();
  const accessKey = String(process.env.DOUBAO_ASR_ACCESS_TOKEN || '').trim();
  const resourceId = String(getArg('--resource-id') || 'volc.bigasr.auc_turbo').trim();

  const videoPath = getArg('--video');
  const audioPath = getArg('--audio');
  if (!appKey || !accessKey) {
    console.error('缺少 DOUBAO_ASR_APP_ID 或 DOUBAO_ASR_ACCESS_TOKEN。');
    usageAndExit(2);
  }
  if ((videoPath && audioPath) || (!videoPath && !audioPath)) {
    console.error('请只提供一种输入：--video 或 --audio。');
    usageAndExit(2);
  }

  console.log('==== 配置（已脱敏） ====');
  console.log('X-Api-App-Key     :', appKey);
  console.log('X-Api-Access-Key  :', mask(accessKey));
  console.log('X-Api-Resource-Id :', resourceId);
  console.log('');

  let audioBuf;
  if (videoPath) {
    console.log('抽取音频中（mp4 → mp3）...');
    audioBuf = await extractMp3FromMp4(videoPath);
  } else {
    audioBuf = await readFile(audioPath);
  }

  console.log('音频字节数:', audioBuf.byteLength);
  const audioB64 = audioBuf.toString('base64');

  console.log('调用识别接口中...');
  const requestId = randomUUID();
  const res = await fetch('https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-App-Key': appKey,
      'X-Api-Access-Key': accessKey,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': requestId,
      'X-Api-Sequence': '-1',
    },
    body: JSON.stringify({
      user: { uid: appKey },
      audio: { data: audioB64 },
      request: { model_name: 'bigmodel' },
    }),
  });

  const statusCode = res.headers.get('x-api-status-code') || '';
  const statusMessage = res.headers.get('x-api-message') || '';
  const logid = res.headers.get('x-tt-logid') || '';
  const text = await res.text().catch(() => '');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  console.log('HTTP:', res.status);
  console.log('X-Api-Status-Code:', statusCode);
  console.log('X-Api-Message    :', statusMessage);
  console.log('X-Tt-Logid       :', logid);
  console.log('');

  if (!res.ok) {
    throw new Error(`请求失败 (HTTP ${res.status})${text ? `：${text.slice(0, 1000)}` : ''}`);
  }

  const transcript = String(data?.result?.text || '').trim();
  if (!transcript) {
    throw new Error(`返回文本为空${text ? `：${text.slice(0, 1000)}` : ''}`);
  }

  console.log('==== 转写结果 ====');
  console.log(transcript);
}

main().catch((err) => {
  console.error('脚本执行失败：', err?.message || String(err));
  process.exitCode = 1;
});
