export interface ScriptOptions {
  topic: string;
  tone: ScriptTone;
  platform: PlatformType;
  duration: string;
  language: string;
}

export enum ScriptTone {
  PROFESSIONAL = '专业干货',
  FUNNY = '幽默搞笑',
  EMOTIONAL = '情感共鸣',
  SALES = '带货种草',
  CASUAL = '生活 Vlog',
}

export enum PlatformType {
  DOUYIN = '抖音/TikTok',
  REDNOTE = '小红书',
  YOUTUBE_SHORTS = '视频号/Shorts',
}

export interface GeneratedScript {
  id: string;
  title: string;
  content: string; // Markdown content
  createdAt: number;
  options: ScriptOptions;
}

export type ViewState = 'generator' | 'analysis' | 'history' | 'templates' | 'settings' | 'personas' | 'products';

export type AIProvider = 'yunwu' | 'volcano';

export interface AppSettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  // 是否启用流式输出（边生成边显示）
  streamingEnabled?: boolean;
  // 视频文案提取（语音识别）服务商选择：默认豆包语音；阿里百炼作为备用
  captionAsrProvider?: 'doubao' | 'dashscope';
  // 豆包语音（大模型录音文件极速版）配置
  doubaoAsrAppId?: string;
  // 注意：这里的 token 指的是“Access Token”（用于 X-Api-Access-Key），不是火山方舟模型的 API Key
  doubaoAsrToken?: string;
  // 阿里百炼 Paraformer 语音识别配置（可选，用于视频文案提取）
  dashscopeApiKey?: string;
  // 文案提取 API 配置（默认使用火山引擎豆包模型；与“分析”配置解耦）
  // 兼容策略：当 provider=volcano 且此处为空时，可复用主配置
  captionApiKey?: string;
  captionModel?: string;
}

// New types for Analysis
export type AnalysisType = 'account' | 'video';

// 热门视频类型
export interface HotVideo {
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
}

export interface AnalysisResult {
  id: string;
  type: AnalysisType;
  url: string;
  title: string; // Account name or Video title
  content: string; // The markdown report
  transcript?: string; // Extracted transcript for videos
  createdAt: number;
  avatarUrl?: string;
  coverUrl?: string;
  authorName?: string;
  // 账号热门视频列表（仅账号分析）
  hotVideos?: HotVideo[];
  // 账号 secUid（用于后续获取视频）
  secUid?: string;
  // Display stats (stringified for UI)
  stats?: {
    followers?: string;
    following?: string;
    likes?: string;
    location?: string;
    awemeCount?: string;
    diggCount?: string;
    commentCount?: string;
    shareCount?: string;
    collectCount?: string;
  };
}

// 人设档案类型
export interface Persona {
  id: string;
  name: string;           // 人设名称
  avatar?: string;        // 头像URL
  description: string;    // 人设描述
  tone: string;           // 说话风格/语气
  targetAudience: string; // 目标受众
  contentStyle: string;   // 内容风格
  keywords: string[];     // 关键词标签
  createdAt: number;
  updatedAt: number;
}

// 产品类型
export interface Product {
  id: string;
  name: string;           // 产品名称
  image?: string;         // 产品图片URL
  category: string;       // 产品类别
  description: string;    // 产品描述
  features: string[];     // 产品特点/卖点
  price?: string;         // 价格
  targetAudience: string; // 目标人群
  painPoints: string[];   // 解决的痛点
  createdAt: number;
  updatedAt: number;
}

// 文案复刻选项
export interface CopywritingOptions {
  videoType: 'oral' | 'other';      // 口播类 / 其他
  personaId?: string;               // 选择的人设档案ID
  productId?: string;               // 选择的产品ID
  topicType: 'random' | 'custom';   // 随机选题 / 自定义选题
  customTopic?: string;             // 自定义选题内容
  specialRequirements?: string;     // 特殊要求
}
