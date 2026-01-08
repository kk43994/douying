import { AnalysisType, AppSettings, PlatformType, ScriptOptions } from '../types';
import { chatCompletions } from './aiClient';
import type { ChatCompletionsConfig, StreamCallback } from './aiClient';

export type AnalysisPromptOptions = {
  deep?: boolean;
  meta?: Record<string, unknown>;
  transcript?: string;  // 视频文案/字幕，用于深度分析
  signal?: AbortSignal; // 可选：用于取消请求
};
function buildChatConfig(settings: AppSettings): ChatCompletionsConfig {
  return {
    provider: settings.provider,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
  };
}

function buildCaptionExtractionConfig(settings: AppSettings): ChatCompletionsConfig {
  const canReuseMainVolcanoConfig = settings.provider === 'volcano';
  const apiKey =
    (settings.captionApiKey ?? '').trim() ||
    (canReuseMainVolcanoConfig ? settings.apiKey.trim() : '');
  const model =
    (settings.captionModel ?? '').trim() ||
    (canReuseMainVolcanoConfig ? settings.model.trim() : '');

  if (!apiKey) {
    throw new Error('请先在「设置」中配置「文案提取 API 配置」里的火山引擎 API Key。');
  }
  if (!model) {
    throw new Error('请先在「设置」中配置「文案提取 API 配置」里的模型。');
  }

  return {
    provider: 'volcano',
    apiKey,
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model,
  };
}

/**
 * 文案提取（豆包）：把抖音单视频链接交给豆包模型，提取视频中的“人声口播文案”
 * - 成功返回纯文本口播文案
 * - 失败抛出错误（不回退 Paraformer）
 */
export async function extractDouyinTranscriptByDoubao(
  videoUrl: string,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<string> {
  const captionSettings = buildCaptionExtractionConfig(settings);

  const prompt = `
请从以下抖音视频链接中提取“人声口播”的完整文案（不是标题/描述；不要分析、不要总结）。

抖音视频链接：
${videoUrl}

硬性要求（必须遵守）：
1) 只输出中文（必要的数字/单位除外），不要夹杂英文单词。
2) 不要输出任何代码块、不要使用三反引号、不要输出列表序号。
3) 只允许输出两种格式之一：
   A) 成功：输出 <transcript> 与 </transcript> 标签包裹的口播文案；除标签外不要输出任何其他字符。
   B) 失败：输出 <error> 与 </error> 标签包裹的中文失败原因；除标签外不要输出任何其他字符。
4) 口播文案尽量逐字还原；多说话人合并输出即可；去掉时间戳与无关提示词。
`.trim();

  const raw = await chatCompletions(captionSettings, {
    messages: [
      {
        role: 'system',
        content:
          '你是短视频口播文案提取助手。你的唯一任务是从给定链接提取视频中人声口播的文字内容，并严格按指定格式输出。',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    maxTokens: 4096,
    signal,
  });

  const transcriptMatch = raw.match(/<transcript>\s*([\s\S]*?)\s*<\/transcript>/i);
  if (transcriptMatch) {
    const transcript = transcriptMatch[1].trim();
    if (!transcript) throw new Error('文案提取失败：返回的口播文案为空。');
    return transcript;
  }

  const errorMatch = raw.match(/<error>\s*([\s\S]*?)\s*<\/error>/i);
  if (errorMatch) {
    const reason = errorMatch[1].trim() || '未知原因';
    throw new Error(`文案提取失败：${reason}`);
  }

  // 宽容兜底：如果模型未按格式输出，尽量做清洗后返回（避免用户白等）
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<transcript>|<\/transcript>|<error>|<\/error>/gi, '')
    .trim();
  if (!cleaned) throw new Error('文案提取失败：返回为空或格式不正确。');
  // 兜底情况下如果像错误提示，就按失败处理，交给上层做“是否推断继续分析”的交互
  if (/无法访问|无法打开|不能访问|无法获取|我无法|我不能|无权限|受限|限制|需要登录|地区限制|风控/i.test(cleaned)) {
    throw new Error(`文案提取失败：${cleaned}`);
  }
  return cleaned;
}

export async function generateVideoScript(options: ScriptOptions, settings: AppSettings): Promise<string> {
  let platformInstructions = '';
  if (options.platform === PlatformType.DOUYIN) {
    platformInstructions = '重点在于前3秒的黄金开头（Hook）。叙事节奏要快。提供具体的镜头运镜建议。如果合适，建议搭配的热门背景音乐类型。';
  } else if (options.platform === PlatformType.REDNOTE) {
    platformInstructions = '重点在于氛围感描述，建立情感连接，多使用 Emoji 表情。语气要像闺蜜分享秘密一样亲切自然。';
  } else {
    platformInstructions = '创建一个通用的短视频脚本，结构清晰，包含黄金开头、核心价值和行动号召（CTA）。';
  }

  const prompt = `
你是一位顶尖的短视频脚本策划大师。
请为以下主题创作一个爆款短视频脚本：“${options.topic}”。

发布平台: ${options.platform}
视频风格: ${options.tone}
目标时长: ${options.duration}
语言: ${options.language}

${platformInstructions}

输出格式 (Markdown):
# [吸引人的爆款标题]

## 视频信息
- **核心概念**: [一句话总结]
- **节奏**: [例如：快节奏、舒缓、激昂]
- **视觉风格**: [例如：明亮、电影感、自拍视角]

## 脚本分镜表
| 时间 | 画面 / 场景 | 口播 / 台词 |
|------|----------------|------------------|
| 0:00-0:03 | [视觉钩子描述] | [开头钩子台词] |
（请继续补全表格，直到脚本结束）

## 标题与文案
[为视频生成适合发布的标题和文案，包含热门话题标签]
`.trim();

  return chatCompletions(buildChatConfig(settings), {
    messages: [
      { role: 'system', content: '你是专业的新媒体短视频脚本策划与写作助手。输出必须是 Markdown。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
  });
}

// 导出流式回调类型供外部使用
export type { StreamCallback };

export async function analyzeDouyinContent(
  type: AnalysisType,
  url: string,
  settings: AppSettings,
  options?: AnalysisPromptOptions & { onStream?: StreamCallback }
): Promise<string> {
  const metaBlock =
    options?.meta && Object.keys(options.meta).length > 0
      ? `\n\n已解析到的公开信息（必须视为可信事实，严禁擅自改写/捏造数字）：\n<元数据>\n${JSON.stringify(options.meta, null, 2)}\n</元数据>\n`
      : '';

  // 视频文案/字幕（如果有）
  const transcriptBlock =
    options?.transcript?.trim()
      ? `\n\n【视频口播文案】（这是视频的真实口播内容，请基于此进行拆解）：\n<口播文案>\n${options.transcript.trim()}\n</口播文案>\n`
      : '';

  const hasTranscript = Boolean(options?.transcript?.trim());
  const deep = Boolean(options?.deep);
  const detailLevel = deep ? '内容详实' : '精炼概括';

  const baseRules = `
通用规则（必须遵守）：
1) 输出必须是 Markdown；不要输出任何“思考过程/推理过程”。
2) 所有结论仅基于已提供的元数据 / 口播文案；缺失信息写“未提供/未知”，不要编造具体数字或事实。
3) 不要在正文原样粘贴元数据或口播文案全文；引用时用摘要/要点。
4) 输出只用中文（数字/单位除外），不要夹杂英文单词或缩写（例如 Hook/CTA/Workflow 等改为中文表达）。
`.trim();

  const accountJsonTemplate = `
\`\`\`json
{"name":"-","followers":"-","following":"-","likes":"-","awemeCount":"-","location":"-"}
\`\`\`
`.trim();

  const videoJsonTemplate = `
\`\`\`json
{"title":"-","author":"-","digg":"-","comment":"-","collect":"-","share":"-","duration":"-"}
\`\`\`
`.trim();

  const accountReportPart1 = `
# 账号深度分析报告

## 1. IP赛道分析
- 赛道定位：
- 产品/服务定位：
- 赛道热度：
- 差异化优势：

## 2. 粉丝画像
- 核心人群：
- 变种标签：
- 关注动机：
- 消费能力/购买意向：

## 3. IP赛道 & 人设
- 人设定位：
- 人设标签：
- 信任背书：
- 人设SOP：

## 4. IP爆款内容结构
- 黄金公式：
- 开头Hook：
- 结尾CTA：
- 拍摄形式：
`.trim();

  const accountReportPart2 = `
## 5. IP特殊符号
- 记忆点设计：
- 视觉符号：
- 内容形式：

## 6. 变现渠道
- 主力产品线：
- 私域导流：
- 橱窗/直播：

## 7. 十条爆款选题
1.
2.
3.
4.
5.
6.
7.
8.
9.
10.

## 8. 优化建议
- 内容升级：
- 产品迭代：
- 风险防范：
`.trim();

  const accountPromptAll = `
${baseRules}

请分析这个抖音账号：${url}
${metaBlock}

提示：如果 meta 中提供了 hotVideos（热门视频列表），请优先基于该列表归纳内容结构与选题，不要凭空编造具体视频事实。

输出要求（严格遵守）：
- 先输出 1 个且仅 1 个 \`\`\`json\`\`\` 代码块（必须可被 JSON.parse；不要注释/不要省略号；所有 value 必须是字符串；未知用 "-"）。
- JSON 必须包含字段：name, followers, following, likes, awemeCount, location。
- JSON 代码块之后紧跟 Markdown 报告（${detailLevel}），严格按下方结构输出。
- 除开头 JSON 块外，正文不要出现任何三反引号代码块。

JSON 模板（请把 "-" 替换为实际值；未知仍用 "-"）：
${accountJsonTemplate}

${accountReportPart1}

${accountReportPart2}
`.trim();

  const videoContextNote = hasTranscript
    ? '重要：你已获得视频口播文案，请以口播文案为准进行拆解，不要杜撰视频里不存在的台词/情节。'
    : '注意：未提供口播文案/字幕。本次只能基于标题、作者、时长与互动数据做“可能性分析”，并明确标注不确定性；不要编造具体台词/剧情细节。';

  const videoReport = `
# 视频脚本拆解（以流量为目标）

## 1. 一句话结论
- 爆点：
- 最大短板：
- 最值得抄的点：

## 2. 细分赛道与观众画像
- 细分赛道：
- 核心观众：
- 停留/互动的主要原因：

## 3. 流量数据解读（只基于已知数据）
- 互动数据现状：
- 互动结构判断：
- 最该优先提升的指标：

## 4. 脚本拆解（好与坏）
### 4.1 开头（0-3秒）
- 好在哪：
- 坏在哪：
- 立刻怎么改：

### 4.2 中段（推进与信息密度）
- 好在哪：
- 坏在哪：
- 立刻怎么改：

### 4.3 结尾（引导互动/关注）
- 好在哪：
- 坏在哪：
- 立刻怎么改：

## 5. 直接可执行的增流量动作
`.trim();

  const videoPromptAll = `
${baseRules}

视频专属要求（必须遵守）：
1) 输出只用中文（数字/单位除外），不要夹杂英文单词或缩写（例如“开头抓人点”“结尾引导”用中文表达）。
2) 不要输出任何代码块、不要使用三反引号、不要输出 JSON、不要输出链接。
3) 内容要干练直击痛点：${deep ? '每个小节最多 6 条要点' : '每个小节最多 4 条要点'}，多用短句。
4) 不要输出空白占位符；信息缺失写“未知/未提供”。

请以“如何获取更多流量”为唯一目标，拆解这个抖音单视频：${url}
${metaBlock}
${transcriptBlock}

${videoContextNote}

输出结构（标题保持一致，严格按顺序）：
${videoReport}

第 5 部分要求：
- 用 - 列表输出 ${deep ? '6-10' : '4-6'} 条，按优先级排序；
- 每条必须写清楚：改什么 → 怎么改 → 为什么能增流量。
`.trim();

  const accountPromptPart1 = `
${baseRules}

请分析这个抖音账号：${url}
${metaBlock}

提示：如果 meta 中提供了 hotVideos（热门视频列表），请优先基于该列表归纳内容结构与选题，不要凭空编造具体视频事实。

只输出：
- 1 个且仅 1 个 \`\`\`json\`\`\` 代码块（必须可被 JSON.parse；不要注释/不要省略号；所有 value 必须是字符串；未知用 "-"）；
- + Markdown 报告的第 1-4 部分（${detailLevel}），从 "# 账号深度分析报告" 开始；
- 除开头 JSON 块外，正文不要出现任何三反引号代码块。

JSON 模板（请把 "-" 替换为实际值；未知仍用 "-"）：
${accountJsonTemplate}

${accountReportPart1}
`.trim();

  const accountPromptPart2 = `
${baseRules}

请继续补全这个抖音账号的《账号深度分析报告》：${url}（不要重复第 1-4 部分内容）。
${metaBlock}

只输出第 5-8 部分（${detailLevel}），直接从 "## 5. IP特殊符号" 开始。
不要输出任何 JSON 代码块，也不要输出任何三反引号代码块。

${accountReportPart2}
`.trim();

  if (!deep) {
    const prompt = type === 'account' ? accountPromptAll : videoPromptAll;
    const systemRole =
      type === 'video'
        ? '你是爆款短视频拆解大师，以获取更多流量为唯一目标。'
        : '你是短视频内容分析师与脚本拆解专家。';
    return chatCompletions(buildChatConfig(settings), {
      messages: [
        { role: 'system', content: systemRole },
        { role: 'user', content: prompt },
      ],
      temperature: type === 'video' ? 0.2 : 0.3,
      maxTokens: 4096,
      onStream: options?.onStream, // 支持流式输出
      signal: options?.signal,
    });
  }

  // 深度模式：账号拆分两次调用避免截断；单视频保持一次调用（更干练）
  if (type === 'video') {
    return chatCompletions(buildChatConfig(settings), {
      messages: [
        { role: 'system', content: '你是爆款短视频拆解大师，以获取更多流量为唯一目标。直接输出内容，不要输出任何思考过程或解释。' },
        { role: 'user', content: videoPromptAll },
      ],
      temperature: 0.2,
      maxTokens: 4096,
      onStream: options?.onStream,
      signal: options?.signal,
    });
  }

  // 账号深度模式也支持流式输出
  const streamCallback = options?.onStream;
  let fullContent = '';

  // 创建一个包装函数，用于累积和流式输出内容
  const streamWrapper = (chunk: string, done: boolean) => {
    if (!done) {
      fullContent += chunk;
      streamCallback?.(chunk, false);
    }
  };

  const part1 = await chatCompletions(buildChatConfig(settings), {
    messages: [
      { role: 'system', content: '你是短视频内容分析师。直接输出 Markdown 格式内容，不要有任何思考过程或解释。' },
      { role: 'user', content: accountPromptPart1 },
    ],
    temperature: 0.25,
    maxTokens: 4096,
    onStream: streamCallback ? streamWrapper : undefined,
    signal: options?.signal,
  });

  // 如果没有使用流式，手动累积
  if (!streamCallback) {
    fullContent = part1;
  }

  // 添加分隔符
  const separator = '\n\n';
  fullContent += separator;
  streamCallback?.(separator, false);

  const part2 = await chatCompletions(buildChatConfig(settings), {
    messages: [
      { role: 'system', content: '你是短视频内容分析师。直接输出 Markdown 格式内容，不要有任何思考过程或解释。' },
      {
        role: 'user',
        content: accountPromptPart2,
      },
    ],
    temperature: 0.25,
    maxTokens: 4096,
    onStream: streamCallback ? streamWrapper : undefined,
    signal: options?.signal,
  });

  // 通知流式输出完成
  streamCallback?.('', true);

  // 如果没有使用流式，拼接返回
  if (!streamCallback) {
    return `${part1}${separator}${part2}`;
  }
  return fullContent;
}

export async function testAiConnection(settings: AppSettings): Promise<string> {
  return chatCompletions(buildChatConfig(settings), {
    messages: [
      { role: 'system', content: '你是 API 连通性测试助手。' },
      { role: 'user', content: '只回复：OK' },
    ],
    temperature: 0,
    maxTokens: 32,
  });
}


/**
 * 文案复刻 - 根据原视频文案生成新文案
 */
export interface CopywritingReplicateOptions {
  transcript: string;           // 原视频文案
  videoType: 'oral' | 'other'; // 口播类 / 其他
  persona?: {                   // 人设档案（可选）
    name: string;
    description: string;
    tone: string;
    targetAudience: string;
  };
  product?: {                   // 产品信息（可选）
    name: string;
    description: string;
    features: string[];
    painPoints: string[];
  };
  customTopic?: string;         // 自定义选题
  specialRequirements?: string; // 特殊要求
}

/**
 * 选题生成 - 基于账号分析生成爆款选题
 */
export interface TopicGenerationOptions {
  accountName: string;
  accountDescription?: string;
  niche?: string;              // 赛道
  targetAudience?: string;     // 目标受众
  contentStyle?: string;       // 内容风格
  count?: number;              // 生成数量
  persona?: {
    name: string;
    tone: string;
    targetAudience: string;
  };
}

export async function generateTopics(
  options: TopicGenerationOptions,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<string> {
  const count = options.count || 10;

  let personaBlock = '';
  if (options.persona) {
    personaBlock = `
【人设档案】
- 人设名称：${options.persona.name}
- 说话风格：${options.persona.tone}
- 目标受众：${options.persona.targetAudience}
`;
  }

  const prompt = `
你是一位短视频爆款选题策划专家。请根据以下账号信息，生成${count}个高潜力爆款选题。

【账号信息】
- 账号名称：${options.accountName}
${options.accountDescription ? `- 账号描述：${options.accountDescription}` : ''}
${options.niche ? `- 内容赛道：${options.niche}` : ''}
${options.targetAudience ? `- 目标受众：${options.targetAudience}` : ''}
${options.contentStyle ? `- 内容风格：${options.contentStyle}` : ''}
${personaBlock}

请输出${count}个爆款选题，每个选题包含：

| 序号 | 选题标题 | 选题类型 | 预估热度 | 核心卖点 |
|------|---------|---------|---------|---------|
| 1 | [吸引眼球的标题] | [干货/情感/争议/故事/测评] | ⭐⭐⭐⭐⭐ | [一句话说明为什么会火] |

然后为每个选题补充：

## 选题 1：[标题]
**选题角度**：[具体切入点]
**开头Hook**：[3秒抓住观众的开场白]
**核心内容**：[主要讲什么，分几个点]
**结尾CTA**：[引导互动/关注的话术]
**适合时长**：[建议时长]
**发布时机**：[最佳发布时间]

（依次类推其他选题，直到全部生成完毕）
`.trim();

  return chatCompletions(buildChatConfig(settings), {
    messages: [
      { role: 'system', content: '你是专业的短视频选题策划专家，擅长挖掘热点和用户痛点，生成高播放量的爆款选题。输出必须是 Markdown 格式。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    maxTokens: 4096,
    signal,
  });
}

/**
 * 语音转文字：使用阿里百炼 Paraformer（通过后端代理）
 * 文档：https://help.aliyun.com/zh/model-studio/developer-reference/paraformer-speech-recognition/
 * 免费额度：每月 600 分钟
 * @param videoUrl 视频播放地址
 * @param settings API 设置
 */
export async function smartTranscribe(
  videoUrl: string,
  settings: AppSettings
): Promise<string> {
  // 检查是否配置了阿里百炼 API Key
  if (!settings.dashscopeApiKey?.trim()) {
    throw new Error('请先在「设置」中配置阿里百炼 API Key（每月免费 600 分钟）');
  }

  console.log('[Transcribe] Using 阿里百炼 Paraformer via backend');

  // 通过后端代理调用阿里百炼（后端会处理下载、上传临时文件、调用API）
  const response = await fetch(
    `/api/transcribe-paraformer?url=${encodeURIComponent(videoUrl)}&apiKey=${encodeURIComponent(settings.dashscopeApiKey.trim())}`,
    { method: 'GET' }
  );

  const data = await response.json();
  console.log('[Paraformer] Backend response:', data);

  if (!response.ok || data.error) {
    throw new Error(data.error || `转录失败 (${response.status})`);
  }

  if (!data.transcript) {
    throw new Error('转录结果为空');
  }

  return data.transcript;
}

export async function replicateCopywriting(
  options: CopywritingReplicateOptions,
  settings: AppSettings,
  signal?: AbortSignal
): Promise<string> {
  let personaBlock = '';
  if (options.persona) {
    personaBlock = `
【人设档案】
- 人设名称：${options.persona.name}
- 人设描述：${options.persona.description}
- 说话风格：${options.persona.tone}
- 目标受众：${options.persona.targetAudience}
`;
  }

  let productBlock = '';
  if (options.product) {
    productBlock = `
【产品信息】
- 产品名称：${options.product.name}
- 产品描述：${options.product.description}
- 产品卖点：${options.product.features.join('、')}
- 解决痛点：${options.product.painPoints.join('、')}
`;
  }

  const topicInstruction = options.customTopic
    ? `请围绕主题「${options.customTopic}」进行创作。`
    : '请随机生成一个相关选题进行创作。';

  const specialReq = options.specialRequirements
    ? `\n特殊要求：${options.specialRequirements}`
    : '';

  const videoTypeDesc = options.videoType === 'oral' ? '口播类短视频' : '剧情/探店/多角色对话类视频';

  const prompt = `
你是一位顶级短视频文案创作专家。请根据以下原始视频文案，生成3条全新的高质量文案。

【原始视频文案（参考结构和风格）】
<transcript>
${options.transcript}
</transcript>

【视频类型】${videoTypeDesc}
${personaBlock}
${productBlock}

${topicInstruction}
${specialReq}

请输出3条文案，每条包含：
1. **优质文案**（改写原文案，保留结构但换主题/内容，更加精炼有力）
2. **模仿文案**（完全原创，参考原视频的表达风格和节奏创作新内容）

输出格式：

## 文案一：优质文案
**标题**：[吸引人的标题]
**文案**：
[完整文案内容，包含开头hook、主体内容、结尾CTA]
**标签**：#话题1 #话题2 #话题3

---

## 文案二：优质文案
**标题**：[吸引人的标题]
**文案**：
[完整文案内容]
**标签**：#话题1 #话题2 #话题3

---

## 文案三：模仿文案
**标题**：[吸引人的标题]
**文案**：
[完整文案内容]
**标签**：#话题1 #话题2 #话题3
`.trim();

  return chatCompletions(buildChatConfig(settings), {
    messages: [
      { role: 'system', content: '你是专业的短视频文案创作专家，擅长分析爆款视频结构并创作高转化文案。输出必须是 Markdown 格式。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    maxTokens: 4096,
    signal,
  });
}
