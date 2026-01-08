import { AppSettings } from '../types';
import { loadJson, saveJson } from './storage';

const SETTINGS_KEY = 'douscript_settings';

// 按云雾API官方文档配置：https://yunwu.apifox.cn
export const DEFAULT_SETTINGS: AppSettings = {
  provider: 'yunwu',
  apiKey: '',
  baseUrl: 'https://yunwu.ai/v1',
  model: 'gpt-4o-mini',
  streamingEnabled: true,
  // 视频文案提取（语音识别）默认用豆包语音
  captionAsrProvider: 'doubao',
  doubaoAsrAppId: '',
  doubaoAsrToken: '',
  // 文案提取（豆包/火山引擎）
  captionApiKey: '',
  captionModel: 'doubao-seed-1-8-251228',
  dashscopeApiKey: '',
};

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');

export function loadAppSettings(): AppSettings {
  const saved = loadJson<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);

  const envApiKey = (process.env.YUNWU_API_KEY || '').trim();
  const envBaseUrl = (process.env.YUNWU_BASE_URL || '').trim();
  const envModel = (process.env.YUNWU_MODEL || '').trim();

  const merged: AppSettings = {
    ...DEFAULT_SETTINGS,
    ...saved,
  };

  if (!merged.apiKey && envApiKey) merged.apiKey = envApiKey;
  if (!merged.baseUrl && envBaseUrl) merged.baseUrl = envBaseUrl;
  if (!merged.model && envModel) merged.model = envModel;

  merged.baseUrl = normalizeBaseUrl(merged.baseUrl || DEFAULT_SETTINGS.baseUrl);

  return merged;
}

export function saveAppSettings(settings: AppSettings): void {
  const normalized: AppSettings = {
    ...settings,
    apiKey: settings.apiKey.trim(),
    baseUrl: normalizeBaseUrl(settings.baseUrl.trim()),
    model: settings.model.trim(),
    streamingEnabled: settings.streamingEnabled ?? true,
    captionAsrProvider: settings.captionAsrProvider === 'dashscope' ? 'dashscope' : 'doubao',
    doubaoAsrAppId: (settings.doubaoAsrAppId ?? '').trim(),
    doubaoAsrToken: (settings.doubaoAsrToken ?? '').trim(),
    captionApiKey: (settings.captionApiKey ?? '').trim(),
    captionModel: (settings.captionModel ?? DEFAULT_SETTINGS.captionModel).trim(),
    dashscopeApiKey: (settings.dashscopeApiKey ?? '').trim(),
  };
  saveJson(SETTINGS_KEY, normalized);
}

export function hasAiConfig(settings: AppSettings): boolean {
  return Boolean(settings.apiKey.trim()) && Boolean(settings.baseUrl.trim()) && Boolean(settings.model.trim());
}
