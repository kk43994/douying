import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Link2, Sparkles, ExternalLink, ChevronDown, Mic, Server } from 'lucide-react';
import { AppSettings, AIProvider } from '../types';
import { testAiConnection } from '../services/aiService';
import { DEFAULT_SETTINGS, hasAiConfig } from '../services/settings';
import { Button } from './Button';

// AI 服务商配置
const AI_PROVIDERS = [
  {
    value: 'yunwu' as AIProvider,
    label: '云雾 API',
    description: '支持 200+ 模型，按量计费',
    color: 'indigo',
    docUrl: 'https://yunwu.apifox.cn',
    keyUrl: 'https://yunwu.ai',
  },
  {
    value: 'volcano' as AIProvider,
    label: '火山引擎',
    description: '字节跳动旗下，豆包大模型',
    color: 'orange',
    docUrl: 'https://www.volcengine.com/docs/82379',
    keyUrl: 'https://console.volcengine.com/ark',
  },
];

// 云雾API预设配置（按官方文档：https://yunwu.apifox.cn）
const YUNWU_BASE_URLS = [
  { label: '云雾官方 (推荐)', value: 'https://yunwu.ai/v1' },
  { label: '自定义', value: 'custom' },
];

// 火山引擎预设配置
const VOLCANO_BASE_URLS = [
  { label: '火山引擎官方 (推荐)', value: 'https://ark.cn-beijing.volces.com/api/v3' },
  { label: '自定义', value: 'custom' },
];

// 云雾常用模型列表
const YUNWU_MODELS = [
  { label: 'GPT-4o Mini (推荐)', value: 'gpt-4o-mini' },
  { label: 'GPT-4o', value: 'gpt-4o' },
  { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
  { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
  { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
  { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
  { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash' },
  { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash-preview-05-20' },
  { label: 'DeepSeek V3', value: 'deepseek-chat' },
  { label: '自定义模型', value: 'custom' },
];

// 火山引擎豆包模型列表
const VOLCANO_MODELS = [
  { label: 'Doubao Seed 1.8', value: 'doubao-seed-1-8-251228' },
  { label: 'Doubao Pro 32k', value: 'doubao-pro-32k-241215' },
  { label: 'Doubao Pro 128k', value: 'doubao-pro-128k-241215' },
  { label: 'Doubao Lite 32k', value: 'doubao-lite-32k-241215' },
  { label: 'Doubao Lite 128k', value: 'doubao-lite-128k-241215' },
  { label: '自定义模型 ID', value: 'custom' },
];

interface SettingsViewProps {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
}

// 检查是否包含非 ASCII 字符
function hasNonAscii(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(str);
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onChange }) => {
  const [showKey, setShowKey] = useState(false);
  const [showCaptionKey, setShowCaptionKey] = useState(false);
  const [showDashscopeKey, setShowDashscopeKey] = useState(false);
  const [showDoubaoAsrToken, setShowDoubaoAsrToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [customBaseUrl, setCustomBaseUrl] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [customCaptionModel, setCustomCaptionModel] = useState(false);

  const configOk = useMemo(() => hasAiConfig(settings), [settings]);

  // 检查 API Key 是否有问题
  const apiKeyHasIssue = useMemo(() => hasNonAscii(settings.apiKey), [settings.apiKey]);

  // 获取当前服务商配置
  const currentProvider = AI_PROVIDERS.find(p => p.value === settings.provider) || AI_PROVIDERS[0];
  const baseUrlOptions = settings.provider === 'volcano' ? VOLCANO_BASE_URLS : YUNWU_BASE_URLS;
  const modelOptions = settings.provider === 'volcano' ? VOLCANO_MODELS : YUNWU_MODELS;
  const captionAsrProvider = settings.captionAsrProvider ?? 'doubao';

  // 判断当前baseUrl是否在预设列表中
  const isPresetBaseUrl = useMemo(() => {
    return baseUrlOptions.some(u => u.value === settings.baseUrl && u.value !== 'custom');
  }, [settings.baseUrl, baseUrlOptions]);

  // 判断当前model是否在预设列表中
  const isPresetModel = useMemo(() => {
    return modelOptions.some(m => m.value === settings.model && m.value !== 'custom');
  }, [settings.model, modelOptions]);

  // 判断文案提取模型是否在火山引擎预设列表中
  const isPresetCaptionModel = useMemo(() => {
    const value = (settings.captionModel || '').trim();
    return VOLCANO_MODELS.some(m => m.value === value && m.value !== 'custom');
  }, [settings.captionModel]);

  // 切换服务商时重置配置
  const handleProviderChange = (newProvider: AIProvider) => {
    const defaultBaseUrl = newProvider === 'volcano'
      ? 'https://ark.cn-beijing.volces.com/api/v3'
      : 'https://yunwu.ai/v1';
    const defaultModel = newProvider === 'volcano'
      ? 'doubao-seed-1-8-251228'
      : 'gpt-4o-mini';

    onChange({
      ...settings,
      provider: newProvider,
      baseUrl: defaultBaseUrl,
      model: defaultModel,
      apiKey: '', // 切换时清空 API Key
    });
    setCustomBaseUrl(false);
    setCustomModel(false);
    setTestMessage(null);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8">
      {/* AI 服务商选择 */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Server className="text-gray-600" />
          AI 服务商设置
        </h2>
        <p className="text-gray-500 mt-1">选择 AI 服务商并配置 API，数据仅保存在本地浏览器。</p>
      </div>

      {/* 服务商切换卡片 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {AI_PROVIDERS.map((provider) => (
          <button
            key={provider.value}
            onClick={() => handleProviderChange(provider.value)}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              settings.provider === provider.value
                ? provider.value === 'volcano'
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-pink-500 bg-pink-50/70'
                : 'border-gray-200 bg-white/60 hover:bg-white/70 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full ${
                settings.provider === provider.value
                  ? provider.value === 'volcano' ? 'bg-orange-500' : 'bg-pink-500'
                  : 'bg-gray-300'
              }`} />
              <span className="font-semibold text-gray-900">{provider.label}</span>
            </div>
            <p className="text-xs text-gray-500">{provider.description}</p>
          </button>
        ))}
      </div>

      {/* 当前服务商配置 */}
      <div className="mb-6">
       <h3 className={`text-xl font-bold flex items-center gap-2 ${
           settings.provider === 'volcano' ? 'text-orange-600' : 'text-pink-600'
         }`}>
          <Sparkles className={settings.provider === 'volcano' ? 'text-orange-500' : 'text-pink-500'} />
          {currentProvider.label} 配置
        </h3>
        <div className="flex flex-wrap gap-3 mt-2">
          <a
            href={currentProvider.keyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 text-sm hover:underline ${
              settings.provider === 'volcano' ? 'text-orange-600 hover:text-orange-700' : 'text-pink-600 hover:text-pink-700'
            }`}
          >
            <ExternalLink size={14} />
            获取 API Key
          </a>
          <a
            href={currentProvider.docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 text-sm hover:underline ${
              settings.provider === 'volcano' ? 'text-orange-600 hover:text-orange-700' : 'text-pink-600 hover:text-pink-700'
            }`}
          >
            <ExternalLink size={14} />
            API 文档
          </a>
        </div>
      </div>

      <div className={`dy-glass-strong rounded-xl border shadow-sm p-6 space-y-6 ${
        settings.provider === 'volcano' ? 'border-orange-200' : 'border-gray-200'
      }`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <KeyRound size={16} className={settings.provider === 'volcano' ? 'text-orange-500' : 'text-pink-600'} />
            API Key
          </label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              className={`flex-1 p-3 rounded-lg border focus:ring-2 ${
                apiKeyHasIssue
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50'
                  : settings.provider === 'volcano'
                    ? 'border-gray-300 focus:ring-orange-500 focus:border-orange-500'
                    : 'border-gray-300 focus:ring-pink-500 focus:border-pink-500'
              }`}
              placeholder={settings.provider === 'volcano' ? '输入火山引擎 API Key' : 'sk-...'}
              value={settings.apiKey}
              onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowKey((v) => !v)}
              icon={showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            >
              {showKey ? '隐藏' : '显示'}
            </Button>
          </div>
          {!configOk && !apiKeyHasIssue && (
            <p className="text-xs text-amber-600 mt-2">未配置 API Key，将无法生成脚本/分析内容。</p>
          )}
          {apiKeyHasIssue && (
            <p className="text-xs text-red-600 mt-2">
              ⚠️ API Key 包含非法字符（中文或特殊符号），请检查是否复制完整或有多余字符。
            </p>
          )}
          {settings.provider === 'volcano' && !apiKeyHasIssue && (
            <p className="text-xs text-gray-500 mt-2">
              火山引擎需要在控制台创建「推理接入点」后获取 API Key
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Link2 size={16} className={settings.provider === 'volcano' ? 'text-orange-500' : 'text-pink-600'} />
            Base URL
          </label>
          <div className="space-y-2">
            <div className="relative">
              <select
                className={`w-full p-3 rounded-lg border focus:ring-2 appearance-none bg-white/70 backdrop-blur pr-10 ${
                  settings.provider === 'volcano'
                    ? 'border-gray-300 focus:ring-orange-500 focus:border-orange-500'
                    : 'border-gray-300 focus:ring-pink-500 focus:border-pink-500'
                }`}
                value={isPresetBaseUrl ? settings.baseUrl : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setCustomBaseUrl(true);
                  } else {
                    setCustomBaseUrl(false);
                    onChange({ ...settings, baseUrl: e.target.value });
                  }
                }}
              >
                {baseUrlOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {(customBaseUrl || !isPresetBaseUrl) && (
              <input
                type="text"
                className={`w-full p-3 rounded-lg border focus:ring-2 ${
                  settings.provider === 'volcano'
                    ? 'border-gray-300 focus:ring-orange-500 focus:border-orange-500'
                    : 'border-gray-300 focus:ring-pink-500 focus:border-pink-500'
                }`}
                placeholder="输入自定义 Base URL"
                value={settings.baseUrl}
                onChange={(e) => onChange({ ...settings, baseUrl: e.target.value })}
              />
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Sparkles size={16} className={settings.provider === 'volcano' ? 'text-orange-500' : 'text-pink-600'} />
            {settings.provider === 'volcano' ? '模型 / 接入点 ID' : '模型'}
          </label>
          <div className="space-y-2">
            <div className="relative">
              <select
                className={`w-full p-3 rounded-lg border focus:ring-2 appearance-none bg-white/70 backdrop-blur pr-10 ${
                  settings.provider === 'volcano'
                    ? 'border-gray-300 focus:ring-orange-500 focus:border-orange-500'
                    : 'border-gray-300 focus:ring-pink-500 focus:border-pink-500'
                }`}
                value={isPresetModel ? settings.model : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setCustomModel(true);
                  } else {
                    setCustomModel(false);
                    onChange({ ...settings, model: e.target.value });
                  }
                }}
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {(customModel || !isPresetModel) && (
              <input
                type="text"
                className={`w-full p-3 rounded-lg border focus:ring-2 ${
                  settings.provider === 'volcano'
                    ? 'border-gray-300 focus:ring-orange-500 focus:border-orange-500'
                    : 'border-gray-300 focus:ring-pink-500 focus:border-pink-500'
                }`}
                placeholder={settings.provider === 'volcano' ? '输入接入点 ID (ep-xxx)' : '输入自定义模型名称'}
                value={settings.model}
                onChange={(e) => onChange({ ...settings, model: e.target.value })}
              />
            )}
            <p className="text-xs text-gray-500">
              {settings.provider === 'volcano'
                ? '模型 ID 可在火山方舟控制台 → 在线推理 → 快捷 API 接入中查看'
                : '云雾支持 200+ 模型，完整列表见官网首页「支持模型」'}
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Sparkles className={settings.provider === 'volcano' ? 'text-orange-500' : 'text-pink-600'} size={16} />
            流式输出
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
            <input
              type="checkbox"
              className={`accent-${settings.provider === 'volcano' ? 'orange' : 'pink'}-600`}
              checked={settings.streamingEnabled ?? true}
              onChange={(e) => onChange({ ...settings, streamingEnabled: e.target.checked })}
            />
            启用流式输出（边生成边显示）
          </label>
          <p className="text-xs text-gray-500 mt-2">关闭后将等待完整结果再展示，适合网络较慢或不想看到中间过程的场景。</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="secondary"
            isLoading={testing}
            onClick={async () => {
              setTesting(true);
              setTestMessage(null);
              try {
                const result = await testAiConnection(settings);
                setTestMessage(result.trim() === 'OK' ? '连接成功：OK' : `连接成功：${result}`);
              } catch (e) {
                setTestMessage(e instanceof Error ? `连接失败：${e.message}` : '连接失败：未知错误');
              } finally {
                setTesting(false);
              }
            }}
            disabled={!configOk}
          >
            测试连接
          </Button>
          <Button type="button" variant="secondary" onClick={() => onChange(DEFAULT_SETTINGS)}>
            恢复默认
          </Button>
        </div>

        {testMessage && (
          <div className={`text-sm rounded-lg p-3 ${
            testMessage.includes('成功')
              ? 'text-green-700 bg-green-50 border border-green-200'
              : 'text-red-700 bg-red-50 border border-red-200'
          }`}>{testMessage}</div>
        )}
      </div>

      {/* 文案提取 API 配置（豆包/火山引擎，独立于“分析”配置） */}
      <div className="mt-10 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles className="text-orange-500" />
          文案提取 API 配置
        </h2>
        <p className="text-gray-500 mt-1">
          用于「豆包大模型直接从链接提取口播文案」的备用方案（可能需要开通联网插件）。
        </p>
        <p className="text-xs text-gray-400 mt-2">
          说明：当前项目默认采用「语音识别」提取口播文案（更稳定，不依赖模型是否能联网访问链接）。
        </p>
      </div>

      <div className="bg-white rounded-xl border border-orange-200 shadow-sm p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <KeyRound size={16} className="text-orange-500" />
            API Key（文案提取）
          </label>
          <div className="flex gap-2">
            <input
              type={showCaptionKey ? 'text' : 'password'}
              className="flex-1 p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              placeholder="输入火山引擎 API Key（用于文案提取）"
              value={settings.captionApiKey || ''}
              onChange={(e) => onChange({ ...settings, captionApiKey: e.target.value })}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCaptionKey((v) => !v)}
              icon={showCaptionKey ? <EyeOff size={16} /> : <Eye size={16} />}
            >
              {showCaptionKey ? '隐藏' : '显示'}
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <ChevronDown size={16} className="text-orange-500" />
            模型（文案提取）
          </label>
          <div className="space-y-2">
            <div className="relative">
              <select
                className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 appearance-none bg-white pr-10"
                value={isPresetCaptionModel ? (settings.captionModel || '') : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setCustomCaptionModel(true);
                  } else {
                    setCustomCaptionModel(false);
                    onChange({ ...settings, captionModel: e.target.value });
                  }
                }}
              >
                {VOLCANO_MODELS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>

            {(!isPresetCaptionModel || customCaptionModel) && (
              <input
                type="text"
                className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="输入自定义模型 ID（如 doubao-seed-1-8-251228）"
                value={settings.captionModel || ''}
                onChange={(e) => onChange({ ...settings, captionModel: e.target.value })}
              />
            )}
          </div>
        </div>
      </div>

      {/* 语音识别设置（用于视频文案提取） */}
      <div className="mt-8 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Mic className="text-orange-500" />
          语音识别设置（用于视频文案提取）
        </h2>
        <p className="text-gray-500 mt-1">
          默认使用「豆包语音（语音识别大模型-录音文件极速版）」提取口播文案；阿里百炼 Paraformer 作为备用可选。
        </p>
        <div className="grid grid-cols-2 gap-4 mt-4 max-w-2xl">
          <button
            onClick={() => onChange({ ...settings, captionAsrProvider: 'doubao' })}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              captionAsrProvider === 'doubao'
                ? 'border-orange-500 bg-orange-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="font-semibold text-gray-900">豆包语音（推荐）</div>
            <div className="text-xs text-gray-500 mt-1">极速版（flash）：抽取音频 → 直接识别返回</div>
          </button>

          <button
            onClick={() => onChange({ ...settings, captionAsrProvider: 'dashscope' })}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              captionAsrProvider === 'dashscope'
                ? 'border-gray-700 bg-gray-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="font-semibold text-gray-900">阿里百炼（备用）</div>
            <div className="text-xs text-gray-500 mt-1">Paraformer：上传临时文件 → 异步转写</div>
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mt-3">
          {captionAsrProvider === 'doubao' ? (
            <>
              <a
                href="https://www.volcengine.com/docs/6561/163043"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 hover:underline"
              >
                <ExternalLink size={14} />
                创建应用并开通服务
              </a>
              <a
                href="https://www.volcengine.com/docs/6561/1631584"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 hover:underline"
              >
                <ExternalLink size={14} />
                极速版接口文档（flash）
              </a>
            </>
          ) : (
            <>
              <a
                href="https://bailian.console.aliyun.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 hover:underline"
              >
                <ExternalLink size={14} />
                获取 API Key
              </a>
              <a
                href="https://help.aliyun.com/zh/model-studio/developer-reference/paraformer-speech-recognition/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700 hover:underline"
              >
                <ExternalLink size={14} />
                API 文档
              </a>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
        {captionAsrProvider === 'doubao' ? (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <KeyRound size={16} className="text-orange-500" />
                AppID（豆包语音）
              </label>
              <input
                type="text"
                className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="在控制台创建应用后获得"
                value={settings.doubaoAsrAppId || ''}
                onChange={(e) => onChange({ ...settings, doubaoAsrAppId: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <KeyRound size={16} className="text-orange-500" />
                Access Token（豆包语音）
              </label>
              <div className="flex gap-2">
                <input
                  type={showDoubaoAsrToken ? 'text' : 'password'}
                  className="flex-1 p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="控制台获取的 Access Token"
                  value={settings.doubaoAsrToken || ''}
                  onChange={(e) => onChange({ ...settings, doubaoAsrToken: e.target.value })}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowDoubaoAsrToken((v) => !v)}
                  icon={showDoubaoAsrToken ? <EyeOff size={16} /> : <Eye size={16} />}
                >
                  {showDoubaoAsrToken ? '隐藏' : '显示'}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Access Token 来自豆包语音控制台「录音文件识别大模型」的「服务接口认证信息」，不要使用 IAM 的 AccessKeyID/SecretAccessKey。
                <br />
                本功能会携带请求头 <code>X-Api-App-Key</code> / <code>X-Api-Access-Key</code> /
                <code>X-Api-Resource-Id=volc.bigasr.auc_turbo</code>。
              </p>
            </div>

            <p className="text-xs text-gray-500 -mt-2">
              资源 ID 为 <code>volc.bigasr.auc_turbo</code>（极速版固定值），无需填写。若提示 403 / requested resource not granted，
              请检查是否已开通对应资源权限与 Access Token 是否正确。
            </p>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <KeyRound size={16} className="text-orange-500" /> 阿里百炼 API Key（Paraformer）
            </label>
            <div className="flex gap-2">
              <input
                type={showDashscopeKey ? 'text' : 'password'}
                className="flex-1 p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="sk-..."
                value={settings.dashscopeApiKey || ''}
                onChange={(e) => onChange({ ...settings, dashscopeApiKey: e.target.value })}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowDashscopeKey((v) => !v)}
                icon={showDashscopeKey ? <EyeOff size={16} /> : <Eye size={16} />}
              >
                {showDashscopeKey ? '隐藏' : '显示'}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              作为备用方案：不配置则无法使用阿里百炼语音识别提取。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
