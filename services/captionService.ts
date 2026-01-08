type ApiError = { error?: string };

export type CaptionTaskStatus = 'WAITING' | 'RUNNING' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';
export type CaptionTaskStage =
  | 'queued'
  | 'downloading'
  | 'uploading'
  | 'submitting'
  | 'polling'
  | 'fetching_result'
  | 'done'
  | 'failed'
  | 'cancelled';

export type CaptionAsrProvider = 'doubao' | 'dashscope';

export type CaptionTaskSnapshot = {
  taskId: string;
  status: CaptionTaskStatus;
  stage: CaptionTaskStage;
  message?: string;
  transcript?: string;
  error?: string;
  publicFileUrl?: string;
  createdAt: number;
  updatedAt: number;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json()) as T & ApiError;
  if (!res.ok) {
    throw new Error(data?.error || `请求失败 (${res.status})`);
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(data.error);
  }
  return data as T;
}

export type CreateCaptionTaskParams = {
  workUrl: string;
  provider: CaptionAsrProvider;
  doubaoAppId?: string;
  doubaoToken?: string;
  dashscopeApiKey?: string;
};

export async function createCaptionTask(params: CreateCaptionTaskParams, signal?: AbortSignal): Promise<CaptionTaskSnapshot> {
  return fetchJson<CaptionTaskSnapshot>('/api/caption/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
}

export async function queryCaptionTask(taskId: string, signal?: AbortSignal): Promise<CaptionTaskSnapshot> {
  return fetchJson<CaptionTaskSnapshot>(`/api/caption/query?taskId=${encodeURIComponent(taskId)}`, {
    method: 'GET',
    signal,
  });
}

export async function cancelCaptionTask(taskId: string, signal?: AbortSignal): Promise<CaptionTaskSnapshot> {
  return fetchJson<CaptionTaskSnapshot>(`/api/caption/cancel?taskId=${encodeURIComponent(taskId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId }),
    signal,
  });
}
