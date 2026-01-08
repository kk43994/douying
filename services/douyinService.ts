type ApiError = { error?: string };

export type ResolveType = 'video' | 'account' | 'unknown';

export type ResolveResult = {
  extractedUrl: string;
  resolvedUrl: string;
  type: ResolveType;
  videoId: string | null;
  secUid: string | null;
};

export type LinkTestResult = {
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

export type VideoMeta = {
  resolvedUrl: string;
  awemeId: string;
  desc: string;
  createTime: number | null;
  durationMs: number | null;
  coverUrl: string | null;
  author: {
    nickname: string;
    secUid: string | null;
    uniqueId: string | null;
    avatarUrl: string | null;
  };
  stats: {
    diggCount: number | null;
    commentCount: number | null;
    shareCount: number | null;
    collectCount: number | null;
  };
  // 真实字幕/文案（如果视频有字幕）
  caption: string | null;
  // 视频播放地址（用于 Whisper 转写）
  playUrl: string | null;
};

export type UserMeta = {
  resolvedUrl: string;
  secUid: string;
  nickname: string;
  signature: string;
  uniqueId: string | null;
  avatarUrl: string | null;
  stats: {
    followers: string;
    following: string;
    likes: string;
    awemeCount: string;
  };
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T & ApiError;
  if (!res.ok) {
    const msg = data?.error || `请求失败 (${res.status})`;
    throw new Error(msg);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(data.error);
  }
  return data as T;
}

export async function resolveInput(input: string): Promise<ResolveResult> {
  return fetchJson<ResolveResult>(`/api/resolve?input=${encodeURIComponent(input)}`);
}

export async function testLink(input: string): Promise<LinkTestResult> {
  return fetchJson<LinkTestResult>(`/api/link/test?input=${encodeURIComponent(input)}`);
}

export async function getVideoMeta(url: string): Promise<VideoMeta> {
  return fetchJson<VideoMeta>(`/api/douyin/video?url=${encodeURIComponent(url)}`);
}

export async function getUserMeta(url: string): Promise<UserMeta> {
  return fetchJson<UserMeta>(`/api/douyin/user?url=${encodeURIComponent(url)}`);
}

// 热门视频类型
export type HotVideo = {
  awemeId: string;
  desc: string;
  createTime: number | null;
  durationMs: number | null;
  coverUrl: string | null;
  playUrl: string | null;
  stats: {
    diggCount: number;
    commentCount: number;
    shareCount: number;
    collectCount: number;
  };
};

export type UserVideosResult = {
  videos: HotVideo[];
  secUid: string | null;
};

// 获取用户热门视频列表
export async function getUserVideos(url: string, count: number = 10): Promise<UserVideosResult> {
  return fetchJson<UserVideosResult>(`/api/douyin/user/videos?url=${encodeURIComponent(url)}&count=${count}`);
}
