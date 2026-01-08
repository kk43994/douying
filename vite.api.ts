import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import type { Connect, Plugin } from 'vite';
import aBogusPkg from '@moonr/abogus';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Mobile/15E148 Safari/604.1';

type ResolveType = 'video' | 'account' | 'unknown';

type DouyinWebSession = {
  cookie: string;
  expiresAt: number;
};

let douyinWebSession: DouyinWebSession | null = null;
let douyinWebSessionLock: Promise<DouyinWebSession> | null = null;

function getSetCookies(res: Response): string[] {
  const headersAny = res.headers as any;
  const list = typeof headersAny.getSetCookie === 'function' ? headersAny.getSetCookie() : [];
  return Array.isArray(list) ? list : [];
}

function pickCookieValue(setCookies: string[], name: string): string | null {
  for (const sc of setCookies) {
    const m = sc.match(new RegExp(`${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
}

function parseSetCookiePairs(setCookies: string[]): Map<string, string> {
  const jar = new Map<string, string>();
  for (const sc of setCookies) {
    const kv = sc.split(';')[0];
    const eq = kv.indexOf('=');
    if (eq > 0) jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
  }
  return jar;
}

function extractInlineScripts(html: string): string[] {
  return Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g)).map((m) => m[1]);
}

function computeDouyinAcSignature(html: string, nonce: string, userAgent: string): string {
  const scripts = extractInlineScripts(html);
  if (!scripts[0]) throw new Error('抖音签名脚本缺失');

  const sandbox: any = {
    console,
    setTimeout,
    clearTimeout,
    window: null,
    global: null,
    document: { cookie: `__ac_nonce=${nonce}`, referrer: '' },
    navigator: {
      userAgent,
      language: 'zh-CN',
      languages: ['zh-CN', 'zh'],
      platform: 'Win32',
      webdriver: false,
    },
    location: {
      protocol: 'https:',
      href: 'https://www.douyin.com/',
      origin: 'https://www.douyin.com',
      host: 'www.douyin.com',
      hostname: 'www.douyin.com',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      reload: () => {},
    },
    history: {},
    performance: { timing: { navigationStart: Date.now() } },
    sessionStorage: { setItem() {}, getItem() { return null; } },
    localStorage: { setItem() {}, getItem() { return null; } },
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(scripts[0], ctx, { timeout: 5000 });

  // 初始化并计算签名（避免执行页面里的 reload 逻辑）
  ctx.byted_acrawler?.init?.({ aid: 99999999, dfp: 0 });
  const sig = ctx.byted_acrawler?.sign?.('', nonce);
  if (!sig || typeof sig !== 'string') throw new Error('抖音签名计算失败');
  return sig;
}

async function refreshDouyinWebSession(): Promise<DouyinWebSession> {
  // 1) 首次请求：拿 __ac_nonce + 获取签名脚本
  const res1 = await fetch('https://www.douyin.com/', {
    headers: {
      'User-Agent': DESKTOP_UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  const sc1 = getSetCookies(res1);
  const nonce = pickCookieValue(sc1, '__ac_nonce');
  if (!nonce) throw new Error('获取 __ac_nonce 失败');
  const html1 = await res1.text();

  // 2) 计算 __ac_signature
  const sig = computeDouyinAcSignature(html1, nonce, DESKTOP_UA);
  const baseCookie = `__ac_nonce=${nonce}; __ac_signature=${sig}; __ac_referer=__ac_blank`;

  // 3) 带签名二次请求：拿到 ttwid / UIFID_TEMP 等必要 cookie
  const res2 = await fetch('https://www.douyin.com/', {
    headers: {
      'User-Agent': DESKTOP_UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      Cookie: baseCookie,
    },
  });
  await res2.text();
  const sc2 = getSetCookies(res2);
  const jar2 = parseSetCookiePairs(sc2);

  const cookieParts: string[] = [baseCookie];
  for (const [k, v] of jar2.entries()) cookieParts.push(`${k}=${v}`);

  // __ac_nonce 默认 1800 秒；提前 60 秒刷新
  const ttlMs = 29 * 60 * 1000;
  return {
    cookie: cookieParts.join('; '),
    expiresAt: Date.now() + ttlMs,
  };
}

async function getDouyinWebSession(): Promise<DouyinWebSession> {
  if (douyinWebSession && Date.now() < douyinWebSession.expiresAt - 60_000) return douyinWebSession;
  if (douyinWebSessionLock) return douyinWebSessionLock;

  douyinWebSessionLock = (async () => {
    const session = await refreshDouyinWebSession();
    douyinWebSession = session;
    return session;
  })();

  try {
    return await douyinWebSessionLock;
  } finally {
    douyinWebSessionLock = null;
  }
}

function sendJson(res: any, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: any): Promise<any> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是有效的 JSON');
  }
}

function assertSafeExternalHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('链接格式错误');
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('仅支持 http/https 链接');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local')
  ) {
    throw new Error('不安全的链接（可能为本机/内网地址）');
  }
  return parsed;
}

function normalizeUrl(value: string): string {
  let url = value.trim();
  url = url.replace(/[)\]}'"\u2019\u201d\u3001\u3002\uff0c\uff01\uff1f\uff1b\uff1a,!.?;:]+$/g, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function extractUrlFromText(input: string): string | null {
  const text = input.trim();
  if (!text) return null;

  const matches: string[] = Array.from(text.match(/https?:\/\/[^\s]+/gi) ?? []);

  const looseDouyin: string[] = Array.from(text.match(/(?:^|\s)(v\.douyin\.com\/[^\s]+)/gi) ?? []);
  for (const m of looseDouyin) matches.push(m.trim());

  if (matches.length === 0) return null;
  const preferred = matches.find((u) => /douyin\.com/i.test(u)) ?? matches[0];
  return normalizeUrl(preferred);
}

function safeUrlHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === 'douyin.com' ||
    host.endsWith('.douyin.com') ||
    host === 'iesdouyin.com' ||
    host.endsWith('.iesdouyin.com')
  );
}

function assertSafeDouyinUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('链接格式错误');
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error('仅支持 http/https 链接');
  }
  if (!safeUrlHost(parsed)) {
    throw new Error('仅支持抖音链接（douyin.com / iesdouyin.com）');
  }
  return parsed;
}

async function resolveRedirects(startUrl: string, maxHops = 6): Promise<string> {
  let current = startUrl;
  for (let i = 0; i < maxHops; i++) {
    const currentUrl = assertSafeDouyinUrl(current);
    const res = await fetch(currentUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': DESKTOP_UA,
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return current;
      current = new URL(location, currentUrl).toString();
      continue;
    }

    // Not a redirect; keep current
    return currentUrl.toString();
  }
  return current;
}

function guessType(url: string): ResolveType {
  try {
    const u = new URL(url);
    const p = u.pathname;
    if (p.includes('/share/video/') || p.includes('/video/')) return 'video';
    if (p.includes('/share/user/') || p.includes('/user/')) return 'account';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function parseVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const p = u.pathname;
    const m1 = p.match(/\/share\/video\/(\d+)/);
    if (m1) return m1[1];
    const m2 = p.match(/\/video\/(\d+)/);
    if (m2) return m2[1];
    const item = u.searchParams.get('aweme_id') || u.searchParams.get('item_id');
    if (item) return item;
    return null;
  } catch {
    return null;
  }
}

function parseSecUid(url: string): string | null {
  try {
    const u = new URL(url);
    const p = u.pathname;
    const m1 = p.match(/\/share\/user\/([^/]+)/);
    if (m1) return decodeURIComponent(m1[1]);
    const m2 = p.match(/\/user\/([^/]+)/);
    if (m2) return decodeURIComponent(m2[1]);
    return u.searchParams.get('sec_uid') || null;
  } catch {
    return null;
  }
}

function formatCount(value: number | string | null | undefined): string {
  if (value == null) return '-';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '-';
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(2)}w`;
  return String(Math.round(n));
}

async function fetchVideoMeta(awemeId: string) {
  const shareUrl = `https://www.iesdouyin.com/share/video/${awemeId}/?region=CN&from=web_code_link`;
  const res = await fetch(shareUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  const html = await res.text();
  const m = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (!m) throw new Error('无法解析视频信息（缺少 ROUTER_DATA）');

  const data = JSON.parse(m[1]);
  const loader = data?.loaderData || {};
  const pageKey = Object.keys(loader).find((k) => k.includes('video_') && k.includes('/page'));
  const page = pageKey ? loader[pageKey] : null;
  const item = page?.videoInfoRes?.item_list?.[0];
  if (!item) throw new Error('视频信息为空');

  const author = item.author || {};
  const avatar =
    author?.avatar_thumb?.url_list?.[0] ||
    author?.avatar_medium?.url_list?.[0] ||
    author?.avatar_larger?.url_list?.[0] ||
    null;
  const cover = item?.video?.cover?.url_list?.[0] || item?.video?.origin_cover?.url_list?.[0] || null;
  const stats = item.statistics || {};

  // 尝试提取真实字幕/文案
  let caption: string | null = null;

  // 1. 检查 caption 字段（部分视频有字幕）
  if (item?.caption) {
    caption = item.caption;
  }
  // 2. 检查 video_subtitle 字段
  else if (item?.video?.video_subtitle) {
    caption = item.video.video_subtitle;
  }
  // 3. 检查 srt_lyric 字段（歌词/字幕）
  else if (item?.srt_lyric?.url) {
    try {
      const srtRes = await fetch(item.srt_lyric.url);
      if (srtRes.ok) {
        const srtText = await srtRes.text();
        // 解析 SRT 格式，提取纯文本
        caption = srtText
          .split('\n')
          .filter((line: string) => line.trim() && !/^\d+$/.test(line.trim()) && !/-->/.test(line))
          .join(' ')
          .trim();
      }
    } catch {
      // ignore srt fetch errors
    }
  }
  // 4. 检查 caption_infos 字段
  else if (item?.caption_infos && Array.isArray(item.caption_infos) && item.caption_infos.length > 0) {
    caption = item.caption_infos.map((c: any) => c.text || c.caption || '').join(' ').trim() || null;
  }

  // 获取视频播放地址（用于后续 Whisper 转写）
  const playUrl = item?.video?.play_addr?.url_list?.[0] ||
                  item?.video?.play_addr_lowbr?.url_list?.[0] ||
                  null;

  return {
    awemeId: item.aweme_id,
    desc: item.desc || '',
    createTime: item.create_time || null,
    durationMs: item?.video?.duration ?? null,
    author: {
      nickname: author.nickname || '',
      secUid: author.sec_uid || null,
      uniqueId: author.unique_id || null,
      avatarUrl: avatar,
    },
    coverUrl: cover,
    stats: {
      diggCount: stats.digg_count ?? null,
      commentCount: stats.comment_count ?? null,
      shareCount: stats.share_count ?? null,
      collectCount: stats.collect_count ?? null,
    },
    // 新增字段
    caption: caption,
    playUrl: playUrl,
  };
}

async function fetchUserMeta(secUid: string) {
  const apiUrl = `https://www.iesdouyin.com/web/api/v2/user/info/?sec_uid=${encodeURIComponent(secUid)}`;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': DESKTOP_UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`用户信息请求失败 (${res.status})`);
  const data = await res.json();
  const ui = data?.user_info;
  if (!ui) throw new Error('用户信息为空');

  const avatar = ui?.avatar_thumb?.url_list?.[0] || ui?.avatar_medium?.url_list?.[0] || null;
  const followerCount = ui?.mplatform_followers_count ?? null;
  const totalFavorited = ui?.total_favorited ?? null;

  return {
    secUid: ui.sec_uid || secUid,
    nickname: ui.nickname || '',
    signature: ui.signature || '',
    uniqueId: ui.unique_id || null,
    avatarUrl: avatar,
    stats: {
      followers: formatCount(followerCount),
      following: formatCount(ui?.following_count),
      likes: formatCount(totalFavorited),
      awemeCount: formatCount(ui?.aweme_count),
    },
    raw: {
      mplatform_followers_count: followerCount,
      total_favorited: totalFavorited,
    },
  };
}

// 获取用户热门视频列表
async function fetchUserVideos(secUid: string, count: number = 10) {
  try {
    // 新方案：直接调用 Douyin Web 接口获取作品列表（分享页已全面走风控 JS，不稳定）
    const generateABogus = (aBogusPkg as any)?.generate_a_bogus as (qs: string, ua: string) => string;
    if (!generateABogus) throw new Error('缺少 a_bogus 生成函数（@moonr/abogus）');

    const params = new URLSearchParams({
      device_platform: 'webapp',
      aid: '6383',
      channel: 'channel_pc_web',
      sec_user_id: secUid,
      max_cursor: '0',
      count: String(count),
    });

    const qs = params.toString();
    const aBogus = generateABogus(qs, DESKTOP_UA);
    const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/post/?${qs}&a_bogus=${encodeURIComponent(aBogus)}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const session = await getDouyinWebSession();

      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent': DESKTOP_UA,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
          Referer: `https://www.douyin.com/user/${encodeURIComponent(secUid)}`,
          Cookie: session.cookie,
        },
      });

      if (!res.ok) {
        console.warn(`[User Videos] HTTP ${res.status}`);
        // 首次失败尝试刷新 session 再试一次
        if (attempt === 0) {
          douyinWebSession = null;
          continue;
        }
        return [];
      }

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        console.warn('[User Videos] Failed to parse JSON response');
        if (attempt === 0) {
          douyinWebSession = null;
          continue;
        }
        return [];
      }

      if (!data || data.status_code !== 0 || !Array.isArray(data.aweme_list)) {
        console.warn('[User Videos] Invalid response payload:', data?.status_code);
        if (attempt === 0) {
          douyinWebSession = null;
          continue;
        }
        return [];
      }

      const awemeList: any[] = data.aweme_list;
      if (!awemeList.length) {
        console.warn('[User Videos] Empty aweme_list');
        if (attempt === 0) {
          douyinWebSession = null;
          continue;
        }
        return [];
      }

      // 解析视频数据
      const videos = awemeList
        .map((item: any) => {
          const stats = item.statistics || item.stats || {};
          const cover =
            item?.video?.cover?.url_list?.[0] ||
            item?.video?.origin_cover?.url_list?.[0] ||
            item?.video?.dynamic_cover?.url_list?.[0] ||
            item?.cover_url ||
            null;
          const playUrl =
            item?.video?.play_addr?.url_list?.[0] || item?.video?.play_addr_lowbr?.url_list?.[0] || null;

          return {
            awemeId: item.aweme_id || item.awemeId,
            desc: item.desc || item.title || '无标题',
            createTime: item.create_time || item.createTime || null,
            durationMs: item?.video?.duration ?? null,
            coverUrl: cover,
            playUrl: playUrl,
            stats: {
              diggCount: stats.digg_count ?? stats.diggCount ?? 0,
              commentCount: stats.comment_count ?? stats.commentCount ?? 0,
              shareCount: stats.share_count ?? stats.shareCount ?? 0,
              collectCount: stats.collect_count ?? stats.collectCount ?? 0,
            },
          };
        })
        .filter((v: any) => v.awemeId); // 过滤无效数据

      // 按点赞数排序（降序）
      videos.sort((a: any, b: any) => (b.stats.diggCount || 0) - (a.stats.diggCount || 0));

      return videos.slice(0, count);
    }

    return [];
  } catch (err) {
    console.error('[User Videos] Error:', err);
    return []; // 返回空数组而不是抛出错误
  }
}

async function handleResolve(reqUrl: URL, res: any) {
  const input = reqUrl.searchParams.get('input') || reqUrl.searchParams.get('text') || reqUrl.searchParams.get('url') || '';
  const extracted = extractUrlFromText(input);
  if (!extracted) return sendJson(res, 400, { error: '未找到有效链接' });
  try {
    assertSafeDouyinUrl(extracted);
  } catch (err) {
    return sendJson(res, 400, { error: err instanceof Error ? err.message : '仅支持抖音链接' });
  }

  let resolved = extracted;
  try {
    resolved = await resolveRedirects(extracted);
  } catch {
    // ignore resolve errors and fallback to extracted
  }

  const type = guessType(resolved);
  const videoId = type === 'video' ? parseVideoId(resolved) : null;
  const secUid = type === 'account' ? parseSecUid(resolved) : null;

  return sendJson(res, 200, {
    extractedUrl: extracted,
    resolvedUrl: resolved,
    type,
    videoId,
    secUid,
  });
}

type LinkTestResult = {
  extractedUrl: string;
  resolvedUrl: string;
  type: ResolveType;
  ok: boolean;
  message: string;
  videoId?: string | null;
  secUid?: string | null;
  hasCaption?: boolean;
  playUrlOk?: boolean;
  playUrlStatus?: number | null;
  playUrlMethod?: string | null;
};

async function probeRemoteMediaUrl(
  url: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; status: number | null; method: string | null; error?: string }> {
  const safe = assertSafeExternalHttpUrl(url).toString();

  // 优先 HEAD；若被拦截/不支持，则回退到 Range 小包探测
  try {
    const headRes = await fetch(safe, {
      method: 'HEAD',
      headers: {
        'User-Agent': MOBILE_UA,
        Referer: 'https://www.douyin.com/',
      },
      signal,
    });
    return { ok: headRes.ok, status: headRes.status, method: 'HEAD' };
  } catch {
    // ignore
  }

  try {
    const rangeRes = await fetch(safe, {
      method: 'GET',
      headers: {
        'User-Agent': MOBILE_UA,
        Referer: 'https://www.douyin.com/',
        Range: 'bytes=0-1',
      },
      signal,
    });
    return { ok: rangeRes.ok, status: rangeRes.status, method: 'RANGE' };
  } catch (err) {
    return { ok: false, status: null, method: null, error: err instanceof Error ? err.message : '探测失败' };
  }
}

async function handleLinkTest(reqUrl: URL, res: any) {
  const input = reqUrl.searchParams.get('input') || reqUrl.searchParams.get('text') || reqUrl.searchParams.get('url') || '';
  const extracted = extractUrlFromText(input) ?? input.trim();
  if (!extracted) return sendJson(res, 400, { error: '未找到有效链接' });

  try {
    assertSafeDouyinUrl(extracted);
  } catch (err) {
    return sendJson(res, 400, { error: err instanceof Error ? err.message : '仅支持抖音链接' });
  }

  let resolved = extracted;
  try {
    resolved = await resolveRedirects(extracted);
  } catch {
    // ignore resolve errors
  }

  const type = guessType(resolved);
  const videoId = type === 'video' ? parseVideoId(resolved) : null;
  const secUid = type === 'account' ? parseSecUid(resolved) : null;

  const base: LinkTestResult = {
    extractedUrl: extracted,
    resolvedUrl: resolved,
    type,
    ok: false,
    message: '链接测试失败',
    videoId,
    secUid,
  };

  if (type === 'unknown') {
    base.message = '可解析到抖音域名，但无法判断是账号还是视频链接';
    return sendJson(res, 200, base);
  }

  if (type === 'account') {
    if (!secUid) {
      base.message = '链接看起来是账号链接，但无法识别 sec_uid';
      return sendJson(res, 200, base);
    }
    try {
      await fetchUserMeta(secUid);
      base.ok = true;
      base.message = '账号链接可访问';
      return sendJson(res, 200, base);
    } catch (err) {
      base.ok = false;
      base.message = err instanceof Error ? err.message : '账号链接不可访问';
      return sendJson(res, 200, base);
    }
  }

  // video
  if (!videoId) {
    base.message = '链接看起来是视频链接，但无法识别视频 ID';
    return sendJson(res, 200, base);
  }

  try {
    const meta = await fetchVideoMeta(videoId);
    base.hasCaption = Boolean(meta.caption && meta.caption.trim());
    if (!meta.playUrl) {
      base.ok = false;
      base.message = '已解析到视频信息，但无法获取播放地址（可能权限受限或视频不可用）';
      return sendJson(res, 200, base);
    }

    const probe = await probeRemoteMediaUrl(meta.playUrl);
    base.playUrlOk = probe.ok;
    base.playUrlStatus = probe.status;
    base.playUrlMethod = probe.method;

    if (probe.ok) {
      base.ok = true;
      base.message = base.hasCaption ? '链接可访问（该视频自带字幕）' : '链接可访问（可进行语音识别提取口播文案）';
      return sendJson(res, 200, base);
    }

    base.ok = false;
    if (probe.status) {
      base.message = `视频播放地址可能受限 (HTTP ${probe.status})`;
      return sendJson(res, 200, base);
    }
    base.message = probe.error ? `视频播放地址探测失败：${probe.error}` : '视频播放地址探测失败';
    return sendJson(res, 200, base);
  } catch (err) {
    base.ok = false;
    base.message = err instanceof Error ? err.message : '视频链接不可访问';
    return sendJson(res, 200, base);
  }
}

async function handleVideo(reqUrl: URL, res: any) {
  const inputUrl = reqUrl.searchParams.get('url') || '';
  const extracted = extractUrlFromText(inputUrl) ?? inputUrl;
  if (!extracted) return sendJson(res, 400, { error: '缺少 url 参数' });
  const normalized = normalizeUrl(extracted);
  try {
    assertSafeDouyinUrl(normalized);
  } catch (err) {
    return sendJson(res, 400, { error: err instanceof Error ? err.message : '仅支持抖音链接' });
  }

  let resolved = normalized;
  try {
    resolved = await resolveRedirects(normalized);
  } catch {
    // ignore
  }
  const id = parseVideoId(resolved);
  if (!id) return sendJson(res, 400, { error: '无法识别视频 ID' });

  const meta = await fetchVideoMeta(id);
  return sendJson(res, 200, { resolvedUrl: resolved, ...meta });
}

async function handleUser(reqUrl: URL, res: any) {
  const inputUrl = reqUrl.searchParams.get('url') || '';
  const extracted = extractUrlFromText(inputUrl) ?? inputUrl;
  if (!extracted) return sendJson(res, 400, { error: '缺少 url 参数' });
  const normalized = normalizeUrl(extracted);
  try {
    assertSafeDouyinUrl(normalized);
  } catch (err) {
    return sendJson(res, 400, { error: err instanceof Error ? err.message : '仅支持抖音链接' });
  }

  let resolved = normalized;
  try {
    resolved = await resolveRedirects(normalized);
  } catch {
    // ignore
  }
  const secUid = parseSecUid(resolved);
  if (!secUid) return sendJson(res, 400, { error: '无法识别 sec_uid' });

  const meta = await fetchUserMeta(secUid);
  return sendJson(res, 200, { resolvedUrl: resolved, ...meta });
}

// 获取用户热门视频列表 API
async function handleUserVideos(reqUrl: URL, res: any) {
  const inputUrl = reqUrl.searchParams.get('url') || '';
  const countStr = reqUrl.searchParams.get('count') || '10';
  const count = Math.min(Math.max(parseInt(countStr, 10) || 10, 1), 50);

  const extracted = extractUrlFromText(inputUrl) ?? inputUrl;
  if (!extracted) return sendJson(res, 200, { videos: [], secUid: null }); // 返回空而非错误

  const normalized = normalizeUrl(extracted);
  try {
    assertSafeDouyinUrl(normalized);
  } catch {
    return sendJson(res, 200, { videos: [], secUid: null });
  }

  let resolved = normalized;
  try {
    resolved = await resolveRedirects(normalized);
  } catch {
    // ignore
  }

  const secUid = parseSecUid(resolved);
  if (!secUid) {
    return sendJson(res, 200, { videos: [], secUid: null }); // 返回空而非错误
  }

  // fetchUserVideos 已经内部处理错误，返回空数组
  const videos = await fetchUserVideos(secUid, count);
  return sendJson(res, 200, { videos, secUid });
}

async function handleTranscribe(reqUrl: URL, res: any) {
  const videoUrl = reqUrl.searchParams.get('url') || '';
  if (!videoUrl) return sendJson(res, 400, { error: '缺少 url 参数' });

  try {
    // 下载视频
    const videoRes = await fetch(videoUrl, {
      headers: {
        'User-Agent': MOBILE_UA,
        'Referer': 'https://www.douyin.com/',
      },
    });

    if (!videoRes.ok) {
      return sendJson(res, 400, { error: `下载视频失败 (${videoRes.status})` });
    }

    // 获取视频内容
    const buffer = await videoRes.arrayBuffer();

    // 返回视频文件供前端处理
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buffer.byteLength);
    res.end(Buffer.from(buffer));
  } catch (err) {
    return sendJson(res, 500, { error: err instanceof Error ? err.message : '下载失败' });
  }
}

type CaptionTaskStatus = 'WAITING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';
type CaptionTaskStage =
  | 'queued'
  | 'downloading'
  | 'uploading'
  | 'submitting'
  | 'polling'
  | 'fetching_result'
  | 'done'
  | 'failed'
  | 'cancelled';

type CaptionTask = {
  id: string;
  status: CaptionTaskStatus;
  stage: CaptionTaskStage;
  message?: string;
  createdAt: number;
  updatedAt: number;
  transcript?: string;
  error?: string;
  // 通过百炼「上传文件获取临时URL」能力得到的 oss:// 临时地址（有效期 48 小时）
  publicFileUrl?: string;
  abort: AbortController;
};

const CAPTION_TASK_TTL_MS = 60 * 60 * 1000; // 1 小时
const captionTasks = new Map<string, CaptionTask>();

function cleanupCaptionTasks(now: number = Date.now()) {
  for (const [id, task] of captionTasks.entries()) {
    const tooOld = now - task.updatedAt > CAPTION_TASK_TTL_MS;
    const finished = task.status === 'SUCCESS' || task.status === 'FAILURE' || task.status === 'CANCELLED';
    if (tooOld && finished) captionTasks.delete(id);
  }
}

function snapshotCaptionTask(task: CaptionTask) {
  return {
    taskId: task.id,
    status: task.status,
    stage: task.stage,
    message: task.message,
    transcript: task.transcript,
    error: task.error,
    publicFileUrl: task.publicFileUrl,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
    return;
  }
  if (signal.aborted) throw new Error('已取消请求。');
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new Error('已取消请求。'));
    };
    const cleanup = () => {
      clearTimeout(t);
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

type DashscopeUploadPolicy = {
  upload_dir: string;
  upload_host: string;
  oss_access_key_id: string;
  policy: string;
  signature: string;
  x_oss_object_acl: string;
  x_oss_forbid_overwrite: string;
};

async function getDashscopeUploadPolicy(
  apiKey: string,
  model: string,
  signal?: AbortSignal
): Promise<DashscopeUploadPolicy> {
  const url = new URL('https://dashscope.aliyuncs.com/api/v1/uploads');
  url.searchParams.set('action', 'getPolicy');
  url.searchParams.set('model', model);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal,
  });

  const data = (await res.json().catch(() => null)) as any;
  if (!res.ok || data?.code) {
    const msg = data?.message || `获取上传凭证失败 (HTTP ${res.status})`;
    throw new Error(msg);
  }

  const policy = data?.data as DashscopeUploadPolicy | undefined;
  if (!policy?.upload_dir || !policy?.upload_host) {
    throw new Error('获取上传凭证失败：返回数据不完整');
  }

  return policy;
}

async function uploadToDashscopeTemporaryOss(
  buffer: ArrayBuffer,
  filename: string,
  contentType: string,
  apiKey: string,
  model: string,
  signal?: AbortSignal
): Promise<string> {
  const policy = await getDashscopeUploadPolicy(apiKey, model, signal);
  const key = `${policy.upload_dir}/${filename}`;

  const formData = new FormData();
  formData.append('OSSAccessKeyId', String(policy.oss_access_key_id));
  formData.append('Signature', String(policy.signature));
  formData.append('policy', String(policy.policy));
  formData.append('x-oss-object-acl', String(policy.x_oss_object_acl));
  formData.append('x-oss-forbid-overwrite', String(policy.x_oss_forbid_overwrite));
  formData.append('key', key);
  formData.append('success_action_status', '200');
  formData.append('file', new Blob([buffer], { type: contentType }), filename);

  const uploadRes = await fetch(policy.upload_host, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    throw new Error(`上传临时文件失败 (HTTP ${uploadRes.status})${errText ? `：${errText}` : ''}`);
  }

  return `oss://${key}`;
}

const DOUBAO_BIGASR_RESOURCE_ID_TURBO = 'volc.bigasr.auc_turbo';

type DoubaoBigasrFlashConfig = {
  // 对应 Header：X-Api-App-Key（控制台“APP ID”）
  appKey: string;
  // 对应 Header：X-Api-Access-Key（控制台“Access Token”）
  accessKey: string;
  // 对应 Header：X-Api-Resource-Id（默认极速版固定值 volc.bigasr.auc_turbo）
  resourceId?: string;
};

let cachedFfmpegPath: string | null | undefined = undefined;

async function getFfmpegPath(): Promise<string> {
  if (cachedFfmpegPath !== undefined) {
    if (!cachedFfmpegPath) throw new Error('ffmpeg 不可用：请先安装依赖 ffmpeg-static');
    return cachedFfmpegPath;
  }

  try {
    const mod: any = await import('ffmpeg-static');
    const value = mod?.default ?? mod;
    cachedFfmpegPath = typeof value === 'string' && value.trim() ? value.trim() : null;
  } catch {
    cachedFfmpegPath = null;
  }

  if (!cachedFfmpegPath) throw new Error('ffmpeg 不可用：请先安装依赖 ffmpeg-static');
  return cachedFfmpegPath;
}

function tailText(text: string, maxChars: number): string {
  const s = String(text || '');
  if (s.length <= maxChars) return s;
  return s.slice(s.length - maxChars);
}

async function extractMp3FromVideoBuffer(
  videoBuffer: ArrayBuffer,
  signal?: AbortSignal,
  onStage?: (stage: CaptionTaskStage, message: string) => void
): Promise<Buffer> {
  if (signal?.aborted) throw new Error('已取消请求。');

  onStage?.('uploading', '提取音频中...');
  const ffmpegPath = await getFfmpegPath();
  const tmpRoot = await mkdtemp(join(tmpdir(), 'douying-asr-'));
  const inputPath = join(tmpRoot, 'input.mp4');
  const outputPath = join(tmpRoot, 'audio.mp3');

  const cleanup = async () => {
    try {
      await rm(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  try {
    await writeFile(inputPath, Buffer.from(videoBuffer));

    await new Promise<void>((resolve, reject) => {
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-b:a',
        '64k',
        outputPath,
      ];

      const child = spawn(ffmpegPath, args, { windowsHide: true });
      let stderr = '';

      const onAbort = () => {
        try {
          child.kill();
        } catch {
          // ignore
        }
      };

      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      child.stderr?.on('data', (d) => {
        stderr += String(d);
        if (stderr.length > 20_000) stderr = tailText(stderr, 20_000);
      });

      child.on('error', (err) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      });

      child.on('close', (code) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        if (signal?.aborted) return reject(new Error('已取消请求。'));
        if (code === 0) return resolve();
        const hint = stderr.trim() ? `：${tailText(stderr.trim(), 1200)}` : '';
        reject(new Error(`提取音频失败（ffmpeg exit=${code}）${hint}`));
      });
    });

    const mp3 = await readFile(outputPath);
    if (!mp3.byteLength) throw new Error('提取音频失败：输出为空');
    return mp3;
  } finally {
    await cleanup();
  }
}

async function transcribeWithDoubaoBigasrFlash(
  videoUrl: string,
  cfg: DoubaoBigasrFlashConfig,
  signal?: AbortSignal,
  onStage?: (stage: CaptionTaskStage, message: string) => void
): Promise<{ transcript: string }> {
  const safeUrl = assertSafeExternalHttpUrl(videoUrl).toString();

  const appKey = (cfg.appKey || '').trim();
  const accessKey = (cfg.accessKey || '').trim();
  const resourceId = (cfg.resourceId || DOUBAO_BIGASR_RESOURCE_ID_TURBO).trim();
  if (!appKey) throw new Error('缺少豆包语音 AppID（X-Api-App-Key）');
  if (!accessKey) throw new Error('缺少豆包语音 Access Token（X-Api-Access-Key）');

  onStage?.('downloading', '下载视频中...');
  const videoRes = await fetch(safeUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Referer': 'https://www.douyin.com/',
    },
    signal,
  });

  if (!videoRes.ok) {
    throw new Error(`下载视频失败：可能权限受限 (HTTP ${videoRes.status})`);
  }

  const videoBuf = await videoRes.arrayBuffer();
  const mp3Buf = await extractMp3FromVideoBuffer(videoBuf, signal, onStage);
  const audioB64 = mp3Buf.toString('base64');

  onStage?.('submitting', '提交豆包语音识别中...');
  const requestId = randomUUID();
  const apiRes = await fetch('https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash', {
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
    signal,
  });

  const statusCode = apiRes.headers.get('x-api-status-code') || apiRes.headers.get('X-Api-Status-Code') || '';
  const statusMessage = apiRes.headers.get('x-api-message') || apiRes.headers.get('X-Api-Message') || '';
  const logid = apiRes.headers.get('x-tt-logid') || apiRes.headers.get('X-Tt-Logid') || '';
  const apiText = await apiRes.text().catch(() => '');
  let apiData: any = null;
  try {
    apiData = apiText ? JSON.parse(apiText) : null;
  } catch {
    apiData = null;
  }

  if (!apiRes.ok) {
    const extra = [
      statusCode ? `X-Api-Status-Code=${statusCode}` : '',
      statusMessage ? `X-Api-Message=${statusMessage}` : '',
      logid ? `X-Tt-Logid=${logid}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    throw new Error(
      `豆包语音识别失败 (HTTP ${apiRes.status})${extra ? `：${extra}` : ''}${
        apiText ? `\n${tailText(apiText, 1200)}` : ''
      }`
    );
  }

  // 该接口以 Header 的 X-Api-Status-Code 表示业务状态，20000000 为成功
  const statusNum = Number(statusCode || '0');
  if (statusNum && statusNum !== 20000000) {
    const msg = statusMessage || apiData?.message || apiData?.error || '豆包语音识别失败';
    const suffix = logid ? `（logid=${logid}）` : '';
    throw new Error(`${msg}${suffix}`);
  }

  const transcript = String(apiData?.result?.text || '').trim();
  if (!transcript) {
    const suffix = logid ? `（logid=${logid}）` : '';
    throw new Error(`豆包语音识别完成，但返回文本为空${suffix}`);
  }

  return { transcript };
}

async function transcribeWithParaformer(
  videoUrl: string,
  apiKey: string,
  signal?: AbortSignal,
  onStage?: (stage: CaptionTaskStage, message: string) => void
): Promise<{ transcript: string; publicUrl: string }> {
  const safeUrl = assertSafeExternalHttpUrl(videoUrl).toString();
  const model = 'paraformer-v2';

  onStage?.('downloading', '下载视频中...');
  console.log('[Paraformer Backend] Downloading video:', safeUrl);
  const videoRes = await fetch(safeUrl, {
    headers: {
      'User-Agent': MOBILE_UA,
      'Referer': 'https://www.douyin.com/',
    },
    signal,
  });

  if (!videoRes.ok) {
    throw new Error(`下载视频失败：可能权限受限 (HTTP ${videoRes.status})`);
  }

  const buffer = await videoRes.arrayBuffer();
  console.log('[Paraformer Backend] Downloaded, size:', buffer.byteLength);

  onStage?.('uploading', '上传临时文件中...');
  const publicUrl = await uploadToDashscopeTemporaryOss(buffer, 'video.mp4', 'video/mp4', apiKey, model, signal);
  console.log('[Paraformer Backend] Uploaded to:', publicUrl);

  onStage?.('submitting', '提交语音识别任务中...');
  const submitRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // DashScope 的 HTTP 异步任务必须显式开启，否则会报：current user api does not support synchronous calls
      'X-DashScope-Async': 'enable',
      // 使用 oss:// 临时URL 调用模型时必须启用资源解析
      'X-DashScope-OssResourceResolve': 'enable',
    },
    body: JSON.stringify({
      model,
      input: {
        file_urls: [publicUrl],
      },
      parameters: {
        language_hints: ['zh', 'en'],
      },
    }),
    signal,
  });

  const submitData = (await submitRes.json()) as any;
  console.log('[Paraformer Backend] Submit response:', submitData);

  if (!submitRes.ok || submitData.code) {
    throw new Error(submitData.message || '提交转录任务失败');
  }

  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('未获取到转录任务ID');

  onStage?.('polling', '语音识别中...');
  const maxWaitMs = 300_000; // 5分钟
  const pollInterval = 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await sleep(pollInterval, signal);

    const queryRes = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
    });

    const queryData = (await queryRes.json()) as any;
    const status = queryData.output?.task_status;
    console.log('[Paraformer Backend] Task status:', status);

    if (queryData.code) {
      throw new Error(queryData.message || '查询任务状态失败');
    }

    if (status === 'SUCCEEDED') {
      const transcriptionUrl = queryData.output?.results?.[0]?.transcription_url;
      if (!transcriptionUrl) throw new Error('未获取到转录结果 URL');

      onStage?.('fetching_result', '获取转录结果中...');
      const resultRes = await fetch(transcriptionUrl, { signal });
      if (!resultRes.ok) throw new Error('获取转录结果失败');

      const resultData = (await resultRes.json()) as any;
      const texts = resultData.transcripts?.map((t: any) => t.text).filter(Boolean) || [];
      if (texts.length === 0) throw new Error('转录结果为空');

      return { transcript: texts.join('\n'), publicUrl };
    }

    if (status === 'FAILED') {
      throw new Error(queryData.message || '转录任务失败');
    }
  }

  throw new Error('转录超时，请稍后重试');
}

// 阿里百炼 Paraformer 转录（通过后端代理，保持旧接口不变）
async function handleParaformerTranscribe(reqUrl: URL, res: any) {
  const videoUrl = reqUrl.searchParams.get('url') || '';
  const apiKey = reqUrl.searchParams.get('apiKey') || '';

  if (!videoUrl) return sendJson(res, 400, { error: '缺少 url 参数' });
  if (!apiKey) return sendJson(res, 400, { error: '缺少 apiKey 参数' });

  try {
    const { transcript } = await transcribeWithParaformer(videoUrl, apiKey);
    return sendJson(res, 200, { transcript });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '转录失败';
    console.error('[Paraformer Backend] Error:', err);
    return sendJson(res, 500, { error: msg });
  }
}

// 文案提取任务 API（模仿 AnyToCopy：create/query/cancel）
async function handleCaptionCreate(req: any, reqUrl: URL, res: any) {
  cleanupCaptionTasks();
  if ((req.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, 405, { error: '仅支持 POST' });
  }

  try {
    const body = (await readJsonBody(req)) || {};
    const workUrlRaw = String(body.workUrl || body.url || '').trim();
    const providerRaw = String(body.provider || body.asrProvider || '').trim().toLowerCase();
    const doubaoAppId = String(body.doubaoAppId || body.appId || body.doubaoAppKey || body.appKey || '').trim();
    const doubaoToken = String(body.doubaoToken || body.token || body.doubaoAccessKey || body.accessKey || '').trim();
    const dashscopeApiKey = String(body.dashscopeApiKey || body.apiKey || '').trim();

    if (!workUrlRaw) return sendJson(res, 400, { error: '缺少 workUrl' });
    const provider =
      providerRaw === 'doubao' || providerRaw === 'dashscope'
        ? providerRaw
        : doubaoAppId || doubaoToken
          ? 'doubao'
          : 'dashscope';
    if (provider === 'doubao') {
      if (!doubaoAppId) return sendJson(res, 400, { error: '缺少 doubaoAppId（豆包语音 AppID）' });
      if (!doubaoToken) return sendJson(res, 400, { error: '缺少 doubaoToken（豆包语音 Access Token）' });
    } else {
      if (!dashscopeApiKey) return sendJson(res, 400, { error: '缺少 dashscopeApiKey（阿里百炼）' });
    }

    const extracted = extractUrlFromText(workUrlRaw) ?? workUrlRaw;
    const normalized = normalizeUrl(extracted);
    assertSafeDouyinUrl(normalized);

    let resolved = normalized;
    try {
      resolved = await resolveRedirects(normalized);
    } catch {
      // ignore resolve errors
    }

    const id = parseVideoId(resolved);
    if (!id) return sendJson(res, 400, { error: '无法识别视频 ID' });

    const meta = await fetchVideoMeta(id);

    // 若抖音本身给了字幕，直接复用（无需跑语音识别）
    if (meta.caption && meta.caption.trim()) {
      const taskId = randomUUID();
      const task: CaptionTask = {
        id: taskId,
        status: 'SUCCESS',
        stage: 'done',
        message: '已获取抖音字幕',
        transcript: meta.caption.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        abort: new AbortController(),
      };
      captionTasks.set(taskId, task);
      return sendJson(res, 200, snapshotCaptionTask(task));
    }

    if (!meta.playUrl) {
      return sendJson(res, 500, { error: '无法获取视频播放地址，可能权限受限或视频不可用' });
    }

    const taskId = randomUUID();
    const task: CaptionTask = {
      id: taskId,
      status: 'WAITING',
      stage: 'queued',
      message: '任务已创建',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      abort: new AbortController(),
    };
    captionTasks.set(taskId, task);

    // 异步执行任务（create 立即返回 taskId）
    void (async () => {
      const update = (stage: CaptionTaskStage, message: string) => {
        task.status = 'RUNNING';
        task.stage = stage;
        task.message = message;
        task.updatedAt = Date.now();
      };

      try {
        let transcript = '';
        let publicUrl: string | undefined = undefined;

        if (provider === 'doubao') {
          const ret = await transcribeWithDoubaoBigasrFlash(
            meta.playUrl!,
            { appKey: doubaoAppId, accessKey: doubaoToken },
            task.abort.signal,
            (stage, message) => update(stage, message)
          );
          transcript = ret.transcript;
        } else {
          update('downloading', '下载视频中...');
          const ret = await transcribeWithParaformer(
            meta.playUrl!,
            dashscopeApiKey,
            task.abort.signal,
            (stage, message) => update(stage, message)
          );
          transcript = ret.transcript;
          publicUrl = ret.publicUrl;
        }

        task.status = 'SUCCESS';
        task.stage = 'done';
        task.message = '提取完成';
        task.transcript = transcript;
        task.publicFileUrl = publicUrl;
        task.updatedAt = Date.now();
      } catch (err: any) {
        const aborted = task.abort.signal.aborted || err?.name === 'AbortError' || err?.message === '已取消请求。';
        task.status = aborted ? 'CANCELLED' : 'FAILURE';
        task.stage = aborted ? 'cancelled' : 'failed';
        task.error = aborted ? '已取消请求。' : (err instanceof Error ? err.message : '提取失败');
        task.message = aborted ? '已取消' : '提取失败';
        task.updatedAt = Date.now();
      }
    })();

    return sendJson(res, 200, snapshotCaptionTask(task));
  } catch (err) {
    return sendJson(res, 500, { error: err instanceof Error ? err.message : '创建任务失败' });
  }
}

function handleCaptionQuery(reqUrl: URL, res: any) {
  cleanupCaptionTasks();
  const taskId = reqUrl.searchParams.get('taskId') || '';
  if (!taskId) return sendJson(res, 400, { error: '缺少 taskId' });
  const task = captionTasks.get(taskId);
  if (!task) return sendJson(res, 404, { error: '任务不存在或已过期' });
  return sendJson(res, 200, snapshotCaptionTask(task));
}

async function handleCaptionCancel(req: any, reqUrl: URL, res: any) {
  cleanupCaptionTasks();
  if ((req.method || 'GET').toUpperCase() !== 'POST') {
    return sendJson(res, 405, { error: '仅支持 POST' });
  }

  let taskId = reqUrl.searchParams.get('taskId') || '';
  try {
    const body = (await readJsonBody(req)) || {};
    if (!taskId) taskId = String(body.taskId || '').trim();
  } catch {
    // ignore body parse errors for cancel
  }

  if (!taskId) return sendJson(res, 400, { error: '缺少 taskId' });
  const task = captionTasks.get(taskId);
  if (!task) return sendJson(res, 404, { error: '任务不存在或已过期' });

  if (task.status === 'RUNNING' || task.status === 'WAITING') {
    task.abort.abort();
    task.status = 'CANCELLED';
    task.stage = 'cancelled';
    task.message = '已取消';
    task.error = '已取消请求。';
    task.updatedAt = Date.now();
  }

  return sendJson(res, 200, snapshotCaptionTask(task));
}

function middleware(): Connect.NextHandleFunction {
  return (req, res, next) => {
    void (async () => {
      if (!req.url) return next();
      const reqUrl = new URL(req.url, 'http://localhost');
      if (reqUrl.pathname === '/api/resolve') return handleResolve(reqUrl, res);
      if (reqUrl.pathname === '/api/link/test') return handleLinkTest(reqUrl, res);
      if (reqUrl.pathname === '/api/douyin/video') return handleVideo(reqUrl, res);
      if (reqUrl.pathname === '/api/douyin/user') return handleUser(reqUrl, res);
      if (reqUrl.pathname === '/api/douyin/user/videos') return handleUserVideos(reqUrl, res);
      if (reqUrl.pathname === '/api/transcribe') return handleTranscribe(reqUrl, res);
      if (reqUrl.pathname === '/api/transcribe-paraformer') return handleParaformerTranscribe(reqUrl, res);
      if (reqUrl.pathname === '/api/caption/create') return handleCaptionCreate(req, reqUrl, res);
      if (reqUrl.pathname === '/api/caption/query') return handleCaptionQuery(reqUrl, res);
      if (reqUrl.pathname === '/api/caption/cancel') return handleCaptionCancel(req, reqUrl, res);
      return next();
    })().catch((err) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : '服务器错误' });
    });
  };
}

export function douyinApiPlugin(): Plugin {
  return {
    name: 'douyin-api-plugin',
    configureServer(server) {
      server.middlewares.use(middleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware());
    },
  };
}
