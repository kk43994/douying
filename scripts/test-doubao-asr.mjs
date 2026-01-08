#!/usr/bin/env node
/**
 * 用豆包（火山方舟 Ark）模型做“语音转文字”的可行性探测脚本（方案 B）。
 *
 * 说明：
 * - 这个脚本会尝试几种常见的“多模态消息”写法（参考 OpenAI 风格），用于验证 Ark 是否支持音频输入转写。
 * - 如果模型/接口不支持，会输出原始错误信息，方便你据此决定是否改用火山 ASR 专用接口（方案 A）。
 *
 * 用法示例：
 * 1) 传本地音频：
 *    ARK_API_KEY=xxx ARK_MODEL=ep-xxx node scripts/test-doubao-asr.mjs --file .\\demo.wav
 *
 * 2) 传音频 URL（脚本会先下载再 base64）：（建议小文件）
 *    ARK_API_KEY=xxx ARK_MODEL=ep-xxx node scripts/test-doubao-asr.mjs --url https://example.com/demo.wav
 */

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

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

function maskKey(key) {
  const k = String(key || '').trim();
  if (k.length <= 10) return '***';
  return `${k.slice(0, 6)}...${k.slice(-4)}`;
}

function inferFormat(nameOrUrl) {
  const ext = extname(nameOrUrl).toLowerCase().replace('.', '');
  if (['wav', 'mp3', 'm4a', 'aac', 'ogg', 'webm', 'flac'].includes(ext)) return ext;
  return null;
}

function mimeFromFormat(format) {
  const f = String(format || '').toLowerCase();
  if (f === 'wav') return 'audio/wav';
  if (f === 'mp3') return 'audio/mpeg';
  if (f === 'm4a') return 'audio/mp4';
  if (f === 'aac') return 'audio/aac';
  if (f === 'ogg') return 'audio/ogg';
  if (f === 'webm') return 'audio/webm';
  if (f === 'flac') return 'audio/flac';
  return 'application/octet-stream';
}

function usageAndExit(code = 0) {
  const msg = `
用豆包（火山方舟 Ark）测试“语音转文字”的脚本

必需环境变量：
  ARK_API_KEY    火山方舟 API Key
  ARK_MODEL      接入点 ID（ep-xxx）

可选环境变量：
  ARK_BASE_URL   默认：https://ark.cn-beijing.volces.com/api/v3

参数：
  --file <path>      本地音频文件路径（wav/mp3/m4a/ogg/webm/flac）
  --url  <url>       远程音频文件 URL（脚本会下载）
  --format <fmt>     覆盖音频格式（例如 wav / mp3）
  --max-bytes <n>    下载/读取上限（默认 8000000，约 8MB）
  --help             显示帮助

示例：
  ARK_API_KEY=xxx ARK_MODEL=ep-xxx node scripts/test-doubao-asr.mjs --file .\\demo.wav
`.trim();
  console.log(msg);
  process.exit(code);
}

async function readInputBuffer({ filePath, url, maxBytes }) {
  if (filePath) {
    const buf = await readFile(filePath);
    if (buf.byteLength > maxBytes) {
      throw new Error(`文件过大：${buf.byteLength} 字节，超过上限 ${maxBytes}（请换短音频或调大 --max-bytes）。`);
    }
    return { buffer: buf, name: basename(filePath) };
  }

  if (url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`下载音频失败 (HTTP ${res.status})`);

    const contentLength = Number(res.headers.get('content-length') || '0') || 0;
    if (contentLength && contentLength > maxBytes) {
      throw new Error(`音频过大：Content-Length=${contentLength}，超过上限 ${maxBytes}（请换短音频或调大 --max-bytes）。`);
    }

    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new Error(`音频过大：${ab.byteLength} 字节，超过上限 ${maxBytes}（请换短音频或调大 --max-bytes）。`);
    }
    const name = (() => {
      try {
        const u = new URL(url);
        return basename(u.pathname) || 'audio';
      } catch {
        return 'audio';
      }
    })();
    return { buffer: Buffer.from(ab), name };
  }

  throw new Error('请提供 --file 或 --url');
}

async function callArkChatCompletions({ baseUrl, apiKey, model, body }) {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

function extractContent(respData) {
  const msg = respData?.choices?.[0]?.message;
  const content = msg?.content || msg?.reasoning_content || '';
  return typeof content === 'string' ? content.trim() : '';
}

async function main() {
  if (hasFlag('--help')) usageAndExit(0);

  const apiKey = (process.env.ARK_API_KEY || process.env.VOLCANO_API_KEY || '').trim();
  const model = (process.env.ARK_MODEL || process.env.VOLCANO_MODEL || '').trim();
  const baseUrl = (process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').trim();

  const filePath = getArg('--file');
  const url = getArg('--url');
  const formatArg = getArg('--format');
  const maxBytes = Number(getArg('--max-bytes') || '8000000') || 8000000;

  if (!apiKey || !model) {
    console.error('缺少 ARK_API_KEY 或 ARK_MODEL。');
    usageAndExit(2);
  }
  if ((filePath && url) || (!filePath && !url)) {
    console.error('请只提供一种输入：--file 或 --url。');
    usageAndExit(2);
  }

  const { buffer, name } = await readInputBuffer({ filePath, url, maxBytes });
  const format = (formatArg || inferFormat(name) || inferFormat(url || '') || 'wav').toLowerCase();
  const b64 = buffer.toString('base64');

  console.log('==== 配置 ====');
  console.log('baseUrl:', baseUrl);
  console.log('model  :', model);
  console.log('apiKey :', maskKey(apiKey));
  console.log('input  :', filePath ? filePath : url);
  console.log('name   :', name);
  console.log('format :', format);
  console.log('bytes  :', buffer.byteLength);
  console.log('');

  const sys = '你是语音转文字助手。你的唯一任务是把用户提供的音频逐字转写成中文。只输出转写正文，不要解释、不要加标题、不要加时间戳。';
  const userText = '请把上面的音频逐字转写成中文口播文案。仅输出正文。';

  const dataUrl = `data:${mimeFromFormat(format)};base64,${b64}`;

  const candidates = [
    {
      name: 'OpenAI 风格：input_audio(data+format)',
      body: {
        model,
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content: [
              { type: 'input_audio', input_audio: { data: b64, format } },
              { type: 'text', text: userText },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      },
    },
    {
      name: '猜测写法：audio(data+format)',
      body: {
        model,
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content: [
              { type: 'audio', audio: { data: b64, format } },
              { type: 'text', text: userText },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      },
    },
    {
      name: '猜测写法：audio_url(data-url)',
      body: {
        model,
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content: [
              { type: 'audio_url', audio_url: { url: dataUrl } },
              { type: 'text', text: userText },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      },
    },
  ];

  for (const c of candidates) {
    console.log(`---- 尝试：${c.name} ----`);
    const resp = await callArkChatCompletions({ baseUrl, apiKey, model, body: c.body });
    if (!resp.ok) {
      const msg =
        resp.data?.error?.message ||
        resp.data?.message ||
        resp.data?.error ||
        resp.data?.detail ||
        JSON.stringify(resp.data).slice(0, 600);
      console.log(`失败：HTTP ${resp.status}，${msg}`);
      console.log('');
      continue;
    }

    const content = extractContent(resp.data);
    if (content) {
      console.log('成功，转写结果如下：');
      console.log(content);
      process.exit(0);
    }

    console.log('失败：接口返回成功，但未拿到可用的文本内容。原始响应（截断）：');
    console.log(JSON.stringify(resp.data).slice(0, 800));
    console.log('');
  }

  console.error('全部尝试均失败：说明当前接入点/模型大概率不支持“直接音频输入转写”。建议改用火山/百炼的 ASR 专用接口（方案 A）。');
  process.exit(1);
}

main().catch((err) => {
  console.error('脚本执行失败：', err?.message || String(err));
  process.exit(1);
});
