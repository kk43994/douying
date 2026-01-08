import type { AIProvider } from '../types';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

// 流式输出回调类型
export type StreamCallback = (chunk: string, done: boolean) => void;

export type ChatCompletionsConfig = {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

// 清理字符串中的非 ASCII 字符（HTTP 头要求）
function sanitizeForHeader(str: string): string {
  return str.replace(/[^\x00-\x7F]/g, '').trim();
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const anyPayload = payload as any;
  const message =
    anyPayload?.error?.message ||
    anyPayload?.message ||
    anyPayload?.error ||
    anyPayload?.detail;
  return typeof message === 'string' ? message : null;
}

export async function chatCompletions(
  config: ChatCompletionsConfig,
  params: {
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    onStream?: StreamCallback; // 可选的流式回调
    signal?: AbortSignal; // 可选：用于取消请求
  }
): Promise<string> {
  const rawApiKey = (config.apiKey || '').trim();
  if (!rawApiKey) {
    const providerName = config.provider === 'volcano' ? '火山引擎' : '云雾';
    throw new Error(`请先在「设置」中填写 ${providerName} API Key。`);
  }

  // 验证 API Key 是否包含非法字符
  const apiKey = sanitizeForHeader(rawApiKey);
  if (!apiKey) {
    throw new Error('API Key 格式错误：包含非法字符，请检查是否有中文或特殊符号。');
  }
  if (apiKey !== rawApiKey) {
    console.warn('[AI] API Key 中包含非 ASCII 字符，已自动过滤');
  }

  // 根据服务商设置默认 Base URL
  const defaultBaseUrl = config.provider === 'volcano'
    ? 'https://ark.cn-beijing.volces.com/api/v3'
    : 'https://yunwu.ai/v1';

  const baseUrl = normalizeBaseUrl((config.baseUrl || '').trim() || defaultBaseUrl);
  const rawModel = (config.model || '').trim();
  if (!rawModel) {
    const fieldName = config.provider === 'volcano' ? '模型/接入点 ID' : '模型名称';
    throw new Error(`请先在「设置」中填写${fieldName}。`);
  }

  // 模型名称也需要验证（虽然不在 header 中，但保险起见）
  const model = sanitizeForHeader(rawModel);
  if (!model) {
    throw new Error('模型名称格式错误：包含非法字符。');
  }

  const useStream = !!params.onStream;
  const controller = new AbortController();
  let timedOut = false;
  const abortHandler = () => controller.abort();
  if (params.signal) {
    if (params.signal.aborted) {
      controller.abort();
    } else {
      params.signal.addEventListener('abort', abortHandler, { once: true });
    }
  }

  // 流式模式下超时更长（10分钟），因为会持续接收数据
  const timeoutMs = useStream ? 600_000 : (config.provider === 'volcano' ? 180_000 : 120_000);
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    console.log(`[AI] Calling ${config.provider} API: ${baseUrl}/chat/completions, model: ${model}, stream: ${useStream}`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens,
        stream: useStream,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      let data: unknown = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
      let msg = readErrorMessage(data) || `请求失败 (${response.status})`;

      // 火山引擎特定错误处理
      if (config.provider === 'volcano') {
        if (response.status === 404 || msg.includes('not found') || msg.includes('endpoint')) {
          msg = `模型不存在。请确认：\n1. 模型 ID 正确（如 doubao-seed-1-8-251228）\n2. 已在火山方舟控制台开通该模型\n\n原始错误：${msg}`;
        } else if (response.status === 401 || response.status === 403) {
          msg = `认证失败。请检查 API Key 是否正确。\n\n原始错误：${msg}`;
        }
      } else {
        // 云雾常见鉴权失败提示（避免弹窗只显示英文）
        if (
          response.status === 401 ||
          response.status === 403 ||
          /invalid\s+token/i.test(msg) ||
          /unauthorized/i.test(msg)
        ) {
          msg = `认证失败。请检查云雾 API Key 是否正确或已过期。\n\n原始错误：${msg}`;
        }
      }

      throw new Error(msg);
    }

    // 流式处理
    if (useStream && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta;
            // 只展示最终输出内容：禁止把推理/思考过程（reasoning_content）拼进正文
            const content = delta?.content || '';
            if (content) {
              fullContent += content;
              params.onStream?.(content, false);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      params.onStream?.('', true); // 通知完成
      console.log('[AI Debug] Stream completed, total length:', fullContent.length);

      if (!fullContent.trim()) {
        throw new Error('AI 返回为空，请稍后重试。');
      }
      return fullContent.trim();
    }

    // 非流式处理
    const text = await response.text();
    console.log('[AI Debug] Response status:', response.status);
    console.log('[AI Debug] Response text:', text.slice(0, 500));

    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    const message = (data as any)?.choices?.[0]?.message;
    // 只展示最终输出内容：禁止把推理/思考过程（reasoning_content）当作正文
    const content = message?.content || '';
    console.log('[AI Debug] Content length:', content?.length);
    if (typeof content === 'string' && content.trim()) return content.trim();

    throw new Error('AI 返回为空，请稍后重试。');
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      if (timedOut) {
        const providerName = config.provider === 'volcano' ? '火山引擎' : '云雾';
        throw new Error(`${providerName} 请求超时（${timeoutMs / 1000}秒），请稍后重试或检查网络。`);
      }
      throw new Error('已取消请求。');
    }
    throw err instanceof Error ? err : new Error('请求失败，请稍后重试。');
  } finally {
    window.clearTimeout(timeout);
    params.signal?.removeEventListener('abort', abortHandler);
  }
}
