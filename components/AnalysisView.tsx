import React, { useState, useCallback } from 'react';
import { AnalysisResult, AnalysisType, AppSettings, Persona, Product, HotVideo } from '../types';
import { analyzeDouyinContent, replicateCopywriting, generateTopics, StreamCallback } from '../services/aiService';
import { getUserMeta, getVideoMeta, resolveInput, getUserVideos, testLink } from '../services/douyinService';
import { cancelCaptionTask, createCaptionTask, queryCaptionTask } from '../services/captionService';
import { Button } from './Button';
import { FlowToolkit } from './FlowToolkit';
import { ReportMarkdown } from './ReportMarkdown';
import { ArrowLeft, Video, User, Zap, Search, Clock, ChevronRight, Copy, BarChart2, ExternalLink, RefreshCw, Mic, Wand2, ChevronDown, Lightbulb, Play, Heart, MessageCircle, Bookmark, Share2, X, AlertTriangle } from 'lucide-react';

// 格式化视频数据
function formatVideoCount(count: number): string {
    if (count >= 10000) {
        return `${(count / 10000).toFixed(1)}w`;
    }
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}k`;
    }
    return String(count);
}

function calcHotVideosSummary(videos: HotVideo[]) {
    const sample = videos.filter(v => v && v.stats && typeof v.stats.diggCount === 'number');
    const likes = sample.map(v => v.stats.diggCount).slice().sort((a, b) => a - b);
    const comments = sample.map(v => v.stats.commentCount).slice().sort((a, b) => a - b);
    const collects = sample.map(v => v.stats.collectCount).slice().sort((a, b) => a - b);
    const shares = sample.map(v => v.stats.shareCount).slice().sort((a, b) => a - b);

    const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : 0);
    const median = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length / 2)] : 0);

    return {
        sampleCount: sample.length,
        avgLike: avg(likes),
        medianLike: median(likes),
        maxLike: likes.length ? likes[likes.length - 1] : 0,
        avgComment: avg(comments),
        avgCollect: avg(collects),
        avgShare: avg(shares),
    };
}

interface AnalysisViewProps {
    settings: AppSettings;
    history: AnalysisResult[];
    onSaveHistory: (item: AnalysisResult) => void;
    onOpenSettings?: () => void;
    onCreateSimilar?: (prefillTopic: string) => void;
    personas?: Persona[];
    products?: Product[];
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({ settings, history, onSaveHistory, onOpenSettings, onCreateSimilar, personas = [], products = [] }) => {
    const [mode, setMode] = useState<'input' | 'result' | 'history'>('input');
    const [analysisType, setAnalysisType] = useState<AnalysisType>('account');
    const [rawInput, setRawInput] = useState('');
    const [deepMode, setDeepMode] = useState(true);
    const [loading, setLoading] = useState(false);
    const [testingLink, setTestingLink] = useState(false);
    const [linkTestMessage, setLinkTestMessage] = useState<string>('');
    const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
    const [transcribing, setTranscribing] = useState(false);
    const [playUrl, setPlayUrl] = useState<string | null>(null);
    const [activeAbort, setActiveAbort] = useState<AbortController | null>(null);
    const [activeCaptionTaskId, setActiveCaptionTaskId] = useState<string | null>(null);
    const [captionProgress, setCaptionProgress] = useState<string>('');

    const cancelActiveRequest = useCallback(() => {
        if (activeCaptionTaskId) {
            void cancelCaptionTask(activeCaptionTaskId).catch(() => {});
            setActiveCaptionTaskId(null);
            setCaptionProgress('');
        }
        setActiveAbort(prev => {
            prev?.abort();
            return null;
        });
    }, [activeCaptionTaskId]);

    // 文案复刻状态
    const [replicating, setReplicating] = useState(false);
    const [replicatedContent, setReplicatedContent] = useState<string | null>(null);
    const [videoType, setVideoType] = useState<'oral' | 'other'>('oral');
    const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
    const [selectedProductId, setSelectedProductId] = useState<string>('');
    const [customTopic, setCustomTopic] = useState('');
    const [specialRequirements, setSpecialRequirements] = useState('');

    // 选题生成状态
    const [generatingTopics, setGeneratingTopics] = useState(false);

    // 流式输出状态
    const [streamingContent, setStreamingContent] = useState('');
    const [generatedTopics, setGeneratedTopics] = useState<string | null>(null);
    const [topicPersonaId, setTopicPersonaId] = useState<string>('');

    // 重新分析状态
    const [reanalyzing, setReanalyzing] = useState(false);

    const normalizeUrl = (value: string): string => {
        let url = value.trim();
        url = url.replace(/[)\]}'"\u2019\u201d\u3001\u3002\uff0c\uff01\uff1f\uff1b\uff1a,!.?;:]+$/g, '');
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        return url;
    };

    const extractUrl = (input: string): string | null => {
        const text = input.trim();
        if (!text) return null;

        const matches: string[] = Array.from(text.match(/https?:\/\/[^\s]+/gi) ?? []);

        // Some Douyin share texts include scheme-less short links like: v.douyin.com/xxxx/
        const looseDouyin: string[] = Array.from(text.match(/(?:^|\s)(v\.douyin\.com\/[^\s]+)/gi) ?? []);
        for (const m of looseDouyin) matches.push(m.trim());

        if (matches.length === 0) return null;
        const preferred = matches.find((u) => /douyin\.com/i.test(u)) ?? matches[0];
        return normalizeUrl(preferred);
    };

    const isAccessRestrictedError = (e: unknown): boolean => {
        const msg = e instanceof Error ? e.message : String(e || '');
        return /无法访问|打不开|无法打开|权限|受限|限制|需要登录|风控|被拦截|地区限制|不可用|不可访问/i.test(msg);
    };

    const sleep = (ms: number, signal?: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
            if (!signal) return setTimeout(resolve, ms);
            if (signal.aborted) return reject(new Error('已取消请求。'));
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

    const getCaptionAsrParams = () => {
        const provider = settings.captionAsrProvider ?? 'doubao';
        if (provider === 'doubao') {
            const doubaoAppId = (settings.doubaoAsrAppId || '').trim();
            const doubaoToken = (settings.doubaoAsrToken || '').trim();
            if (!doubaoAppId || !doubaoToken) {
                throw new Error('请先在「设置」中配置豆包语音（AppID / Access Token）。');
            }
            return { provider: 'doubao' as const, doubaoAppId, doubaoToken };
        }

        const dashscopeApiKey = (settings.dashscopeApiKey || '').trim();
        if (!dashscopeApiKey) {
            throw new Error('请先在「设置」中配置阿里百炼 API Key（Paraformer）。');
        }
        return { provider: 'dashscope' as const, dashscopeApiKey };
    };

    const extractTranscriptByAsrTask = async (videoUrl: string, signal?: AbortSignal): Promise<string> => {
        const asr = getCaptionAsrParams();
        setCaptionProgress('创建任务中...');
        const created = await createCaptionTask(
            asr.provider === 'doubao'
                ? {
                      workUrl: videoUrl,
                      provider: 'doubao',
                      doubaoAppId: asr.doubaoAppId,
                      doubaoToken: asr.doubaoToken,
                  }
                : {
                      workUrl: videoUrl,
                      provider: 'dashscope',
                      dashscopeApiKey: asr.dashscopeApiKey,
                  },
            signal
        );
        setActiveCaptionTaskId(created.taskId);
        setCaptionProgress(created.message || '任务已创建');

        if (created.status === 'SUCCESS') {
            const transcript = (created.transcript || '').trim();
            if (!transcript) throw new Error('文案提取失败：转录结果为空。');
            return transcript;
        }

        const taskId = created.taskId;
        const start = Date.now();
        const maxWaitMs = 6 * 60 * 1000; // 6分钟（略高于后端 5 分钟超时）

        while (Date.now() - start < maxWaitMs) {
            await sleep(2000, signal);
            const snap = await queryCaptionTask(taskId, signal);
            setCaptionProgress(snap.message || '提取中...');

            if (snap.status === 'SUCCESS') {
                const transcript = (snap.transcript || '').trim();
                if (!transcript) throw new Error('文案提取失败：转录结果为空。');
                return transcript;
            }
            if (snap.status === 'FAILURE') {
                throw new Error(snap.error || '文案提取失败');
            }
            if (snap.status === 'CANCELLED') {
                throw new Error('已取消请求。');
            }
        }

        throw new Error('文案提取超时，请稍后重试。');
    };

    const handleAnalyze = async () => {
        const targetUrl = extractUrl(rawInput);
        if (!targetUrl) {
            alert("请提供有效的链接");
            return;
        }
        if (!settings.apiKey.trim()) {
            alert('请先在「设置」中配置 API Key。');
            onOpenSettings?.();
            return;
        }

        const controller = new AbortController();
        setActiveAbort(controller);
        setLoading(true);
        try {
            // Resolve share link → detect type (video/account) automatically.
            let resolvedUrl = targetUrl;
            let effectiveType: AnalysisType = analysisType;
            try {
                const resolved = await resolveInput(targetUrl);
                resolvedUrl = resolved.resolvedUrl || targetUrl;
                if (resolved.type === 'video' || resolved.type === 'account') {
                    effectiveType = resolved.type;
                    if (effectiveType !== analysisType) setAnalysisType(effectiveType);
                }
            } catch {
                // ignore resolve errors
            }

            // Fetch public metadata to enrich UI + prompt (avatar/cover/stats)
            let avatarUrl: string | undefined = undefined;
            let coverUrl: string | undefined = undefined;
            let authorName: string | undefined = undefined;
            let signature: string | undefined = undefined;
            let durationMs: number | null | undefined = undefined;
            let title = effectiveType === 'account' ? '未知账号' : '未知视频';
            let stats: AnalysisResult['stats'] | undefined = undefined;

            // 用于存储真实字幕
            let realCaption: string | undefined = undefined;
            let captionUnavailableReason: string | undefined = undefined;

            if (effectiveType === 'video') {
                try {
                    const meta = await getVideoMeta(targetUrl);
                    resolvedUrl = meta.resolvedUrl || resolvedUrl;
                    title = meta.desc?.trim() ? meta.desc.trim() : `抖音视频 ${meta.awemeId}`;
                    authorName = meta.author.nickname || undefined;
                    avatarUrl = meta.author.avatarUrl || undefined;
                    coverUrl = meta.coverUrl || undefined;
                    durationMs = meta.durationMs;
                    stats = {
                        diggCount: meta.stats.diggCount != null ? String(meta.stats.diggCount) : '-',
                        commentCount: meta.stats.commentCount != null ? String(meta.stats.commentCount) : '-',
                        shareCount: meta.stats.shareCount != null ? String(meta.stats.shareCount) : '-',
                        collectCount: meta.stats.collectCount != null ? String(meta.stats.collectCount) : '-',
                    };
                    // 使用真实字幕（如果有）
                    if (meta.caption) {
                        realCaption = meta.caption;
                    }
                    // 保存播放地址用于 Whisper 转录
                    if (meta.playUrl) {
                        setPlayUrl(meta.playUrl);
                    }
                } catch (e) {
                    console.warn('Failed to fetch video meta:', e);
                }
            } else {
                try {
                    const meta = await getUserMeta(targetUrl);
                    resolvedUrl = meta.resolvedUrl || resolvedUrl;
                    title = meta.nickname || title;
                    avatarUrl = meta.avatarUrl || undefined;
                    signature = meta.signature || undefined;
                    stats = {
                        followers: meta.stats.followers,
                        following: meta.stats.following,
                        likes: meta.stats.likes,
                        awemeCount: meta.stats.awemeCount,
                        location: '未知',
                    };
                } catch (e) {
                    console.warn('Failed to fetch user meta:', e);
                }
            }

            // 获取账号热门视频列表（仅账号分析）
            let hotVideos: HotVideo[] | undefined = undefined;
            let secUid: string | undefined = undefined;
	            if (effectiveType === 'account') {
	                try {
	                    const videosResult = await getUserVideos(resolvedUrl, 10);
	                    hotVideos = videosResult.videos;
	                    secUid = videosResult.secUid ?? undefined;
	                    if (!hotVideos || hotVideos.length === 0) {
	                        const ok = window.confirm(
	                            '未能获取该账号的热门视频样本（可能链接受限或抖音分享页结构变化）。\n继续分析将更多基于账号简介/数据推断，可靠性会下降。\n\n是否继续分析？'
	                        );
	                        if (!ok) throw new Error('已取消请求。');
	                    }
	                } catch (e) {
	                    if (e instanceof Error && e.message === '已取消请求。') throw e;
	                    console.warn('Failed to fetch user videos:', e);
	                    const reason = e instanceof Error ? e.message : '抓取失败';
	                    const ok = window.confirm(
	                        `热门视频抓取失败：${reason}\n\n继续分析将更多基于账号简介/数据推断，可靠性会下降。\n\n是否继续分析？`
	                    );
	                    if (!ok) throw new Error('已取消请求。');
	                    hotVideos = [];
	                }
	            }

            // 单视频：先提取口播文案（抖音无字幕时走语音识别）
            if (effectiveType === 'video' && !realCaption) {
                try {
                    getCaptionAsrParams();
                } catch (e) {
                    const msg = e instanceof Error ? e.message : '请先在「设置」中完成语音识别配置。';
                    alert(msg);
                    onOpenSettings?.();
                    return;
                }

                setTranscribing(true);
                try {
                    realCaption = await extractTranscriptByAsrTask(resolvedUrl, controller.signal);
                } catch (e) {
                    console.error('[Caption Extract] Failed:', e);
                    const reason = e instanceof Error ? e.message : '文案提取失败';
                    if (isAccessRestrictedError(e)) {
                        const ok = window.confirm(
                            `文案提取失败：${reason}\n\n可能原因：模型无法访问该链接或权限受限制。\n是否要在缺少口播文案的情况下“推断视频内容”继续分析？`
                        );
                        if (!ok) throw e;
                        captionUnavailableReason = reason;
                        realCaption = undefined;
                    } else {
                        throw e;
                    }
                } finally {
                    setTranscribing(false);
                    setActiveCaptionTaskId(null);
                    setCaptionProgress('');
                }
            }

            // 流式输出：先切换到结果页面，实时显示内容
            setStreamingContent('');
            setMode('result');

            // 创建一个临时结果用于流式显示
            const tempResult: AnalysisResult = {
                id: Date.now().toString(),
                type: effectiveType,
                url: resolvedUrl,
                title: title,
                content: '',
                transcript: effectiveType === 'video' ? realCaption : undefined,
                createdAt: Date.now(),
                avatarUrl,
                coverUrl,
                authorName,
                hotVideos,
                secUid,
                stats
            };
            setCurrentResult(tempResult);

	            const analysisOptions: Parameters<typeof analyzeDouyinContent>[3] = {
	                deep: deepMode,
	                meta: {
	                    url: resolvedUrl,
	                    type: effectiveType,
	                    title,
	                    authorName,
	                    avatarUrl: avatarUrl || undefined,
	                    coverUrl: coverUrl || undefined,
	                    signature,
	                    durationMs,
	                    stats,
	                    hotVideos,
	                    secUid: secUid || undefined,
	                    captionUnavailableReason: captionUnavailableReason || (effectiveType === 'video' && !realCaption ? '口播文案未提供/无法提取' : undefined),
	                },
	                // 把视频文案传给 AI 进行深度分析
	                transcript: realCaption || undefined,
	                signal: controller.signal,
	            };

            if (settings.streamingEnabled ?? true) {
                analysisOptions.onStream = (chunk, done) => {
                    if (!done) {
                        setStreamingContent(prev => prev + chunk);
                    }
                };
            }

            const rawResponse = await analyzeDouyinContent(effectiveType, resolvedUrl, settings, analysisOptions);
            
            // 1. Extract JSON stats block
            let content = rawResponse;

            // Regex to find ```json ... ``` block (兼容 \n / \r\n)
            const jsonMatch = rawResponse.match(/```json\s*[\r\n]([\s\S]*?)[\r\n]```/);
            
            if (jsonMatch) {
                try {
                    const parsedStats = JSON.parse(jsonMatch[1]);
                    // Update stats with real data if found
                    if (effectiveType === 'account') {
                        stats = {
                            ...(stats || {}),
                            followers: parsedStats.followers || stats?.followers || '-',
                            following: parsedStats.following || stats?.following || '-',
                            likes: parsedStats.likes || stats?.likes || '-',
                            location: parsedStats.location || stats?.location || '未知',
                            awemeCount: parsedStats.awemeCount || stats?.awemeCount || '-',
                        };
                        if (parsedStats.name) title = parsedStats.name;
                    } else {
                        stats = {
                            ...(stats || {}),
                            diggCount: parsedStats.digg || parsedStats.diggCount || stats?.diggCount || '-',
                            commentCount: parsedStats.comment || parsedStats.commentCount || stats?.commentCount || '-',
                            collectCount: parsedStats.collect || parsedStats.collectCount || stats?.collectCount || '-',
                            shareCount: parsedStats.share || parsedStats.shareCount || stats?.shareCount || '-',
                        };
                        if (parsedStats.title) title = parsedStats.title;
                        if (parsedStats.author) authorName = parsedStats.author;
                    }

                    // Remove the JSON block from the display content
                    content = rawResponse.replace(jsonMatch[0], '').trim();
                } catch (e) {
                    console.error("Failed to parse AI JSON stats", e);
                }
            }

            // 2. 使用真实字幕（仅在有真实数据时才显示）
            let transcript = undefined;
            if (effectiveType === 'video' && realCaption) {
                // 优先使用抖音字幕；无字幕时使用语音识别提取的口播文案
                transcript = realCaption;
            }

            const result: AnalysisResult = {
                id: Date.now().toString(),
                type: effectiveType,
                url: resolvedUrl,
                title: title,
                content: content,
                transcript: transcript,
                createdAt: Date.now(),
                avatarUrl,
                coverUrl,
                authorName,
                hotVideos,
                secUid,
                stats
            };
            
            setCurrentResult(result);
            onSaveHistory(result);
            setMode('result');
            setRawInput('');
        } catch (e) {
            const msg = e instanceof Error ? e.message : '分析失败。请确保链接可访问，或稍后重试。';
            if (msg !== '已取消请求。') alert(msg);
            console.error(e);
            // 出错时回到输入页面
            if (!currentResult?.content) {
                setMode('input');
            }
        } finally {
            setLoading(false);
            setStreamingContent(''); // 清空流式内容
            setActiveAbort(prev => (prev === controller ? null : prev));
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        alert('已复制到剪贴板');
    };

    // 文案复刻
    const handleReplicateCopywriting = async () => {
        if (!currentResult?.transcript) {
            alert('请先提取视频文案');
            return;
        }
        if (!settings.apiKey.trim()) {
            alert('请先在「设置」中配置 API Key。');
            onOpenSettings?.();
            return;
        }

        const controller = new AbortController();
        setActiveAbort(controller);
        setReplicating(true);
        setReplicatedContent(null);
        try {
            const selectedPersona = personas.find(p => p.id === selectedPersonaId);
            const selectedProduct = products.find(p => p.id === selectedProductId);

            const result = await replicateCopywriting({
                transcript: currentResult.transcript,
                videoType,
                persona: selectedPersona ? {
                    name: selectedPersona.name,
                    description: selectedPersona.description,
                    tone: selectedPersona.tone,
                    targetAudience: selectedPersona.targetAudience,
                } : undefined,
                product: selectedProduct ? {
                    name: selectedProduct.name,
                    description: selectedProduct.description,
                    features: selectedProduct.features,
                    painPoints: selectedProduct.painPoints,
                } : undefined,
                customTopic: customTopic.trim() || undefined,
                specialRequirements: specialRequirements.trim() || undefined,
            }, settings, controller.signal);

            setReplicatedContent(result);
        } catch (e) {
            const msg = e instanceof Error ? e.message : '文案复刻失败，请稍后重试。';
            if (msg !== '已取消请求。') alert(msg);
            console.error(e);
        } finally {
            setReplicating(false);
            setActiveAbort(prev => (prev === controller ? null : prev));
        }
    };

    // 选题生成
    const handleGenerateTopics = async () => {
        if (!currentResult) return;
        if (!settings.apiKey.trim()) {
            alert('请先在「设置」中配置 API Key。');
            onOpenSettings?.();
            return;
        }

        const controller = new AbortController();
        setActiveAbort(controller);
        setGeneratingTopics(true);
        setGeneratedTopics(null);
        try {
            const selectedPersona = personas.find(p => p.id === topicPersonaId);

            const result = await generateTopics({
                accountName: currentResult.title,
                accountDescription: currentResult.content.slice(0, 500),
                targetAudience: selectedPersona?.targetAudience,
                contentStyle: selectedPersona?.contentStyle,
                count: 10,
                persona: selectedPersona ? {
                    name: selectedPersona.name,
                    tone: selectedPersona.tone,
                    targetAudience: selectedPersona.targetAudience,
                } : undefined,
            }, settings, controller.signal);

            setGeneratedTopics(result);
        } catch (e) {
            const msg = e instanceof Error ? e.message : '选题生成失败，请稍后重试。';
            if (msg !== '已取消请求。') alert(msg);
            console.error(e);
        } finally {
            setGeneratingTopics(false);
            setActiveAbort(prev => (prev === controller ? null : prev));
        }
    };

    // 提取视频口播文案（默认：语音识别）
    const handleTranscribe = async () => {
        if (!currentResult || currentResult.type !== 'video') return;

        try {
            getCaptionAsrParams();
        } catch (e) {
            const msg = e instanceof Error ? e.message : '请先在「设置」中完成语音识别配置。';
            alert(msg);
            onOpenSettings?.();
            return;
        }

        const controller = new AbortController();
        setActiveAbort(controller);
        setTranscribing(true);
        try {
            const transcript = await extractTranscriptByAsrTask(currentResult.url, controller.signal);

            // 更新当前结果
            const updatedResult = { ...currentResult, transcript };
            setCurrentResult(updatedResult);
            onSaveHistory(updatedResult);

            alert('文案提取成功！点击「深度脚本分析」可获得更详细的分析报告。');
        } catch (e) {
            const msg = e instanceof Error ? e.message : '文案提取失败，请稍后重试。';
            if (msg !== '已取消请求。') alert(msg);
            console.error(e);
        } finally {
            setTranscribing(false);
            setActiveCaptionTaskId(null);
            setCaptionProgress('');
            setActiveAbort(prev => (prev === controller ? null : prev));
        }
    };

    // 重新深度分析（带文案）
    const handleReanalyze = async () => {
        if (!currentResult) return;
        if (!settings.apiKey.trim()) {
            alert('请先在「设置」中配置 API Key。');
            onOpenSettings?.();
            return;
        }

        const controller = new AbortController();
        setActiveAbort(controller);
        setReanalyzing(true);
        try {
            setLoading(true);
            setStreamingContent('');

            const options: Parameters<typeof analyzeDouyinContent>[3] = {
                deep: true,
                meta: {
                    url: currentResult.url,
                    type: currentResult.type,
                    title: currentResult.title,
                    authorName: currentResult.authorName,
                    stats: currentResult.stats,
                },
                transcript: currentResult.transcript,
                signal: controller.signal,
            };

            if (settings.streamingEnabled ?? true) {
                options.onStream = (chunk, done) => {
                    if (!done) {
                        setStreamingContent(prev => prev + chunk);
                    }
                };
            }

            const rawResponse = await analyzeDouyinContent(currentResult.type, currentResult.url, settings, options);

            // 解析响应
            let content = rawResponse;
            const jsonMatch = rawResponse.match(/```json\s*[\r\n]([\s\S]*?)[\r\n]```/);
            if (jsonMatch) {
                content = rawResponse.replace(jsonMatch[0], '').trim();
            }

            // 更新结果
            const updatedResult = { ...currentResult, content };
            setCurrentResult(updatedResult);
            onSaveHistory(updatedResult);

            alert('深度分析完成！');
        } catch (e) {
            const msg = e instanceof Error ? e.message : '分析失败，请稍后重试。';
            if (msg !== '已取消请求。') alert(msg);
            console.error(e);
        } finally {
            setReanalyzing(false);
            setLoading(false);
            setStreamingContent(''); // 清空流式内容
            setActiveAbort(prev => (prev === controller ? null : prev));
        }
    };

    const handleTestLink = async () => {
        const targetUrl = extractUrl(rawInput);
        if (!targetUrl) {
            alert("请提供有效的链接");
            return;
        }

        setTestingLink(true);
        setLinkTestMessage('');
        try {
            const result = await testLink(targetUrl);
            setLinkTestMessage(result.message || '');
            alert(result.message || '链接测试完成');
        } catch (e) {
            const msg = e instanceof Error ? e.message : '链接测试失败，请稍后重试。';
            setLinkTestMessage(msg);
            alert(msg);
            console.error(e);
        } finally {
            setTestingLink(false);
        }
    };

    const renderInput = () => (
        <div className="max-w-4xl mx-auto py-8 px-4 animate-fade-in">
            <div className="dy-glass-strong rounded-2xl overflow-hidden mb-6">
                <div className="flex border-b border-gray-100">
                    <button 
                        onClick={() => setAnalysisType('account')}
                        className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${analysisType === 'account' ? 'bg-white/60 text-pink-700 border-b-2 border-pink-500' : 'bg-white/40 text-gray-600 hover:bg-white/60'}`}
                    >
                        <User size={18} /> 分析账号
                    </button>
                    <button 
                        onClick={() => setAnalysisType('video')}
                        className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-all ${analysisType === 'video' ? 'bg-white/60 text-pink-700 border-b-2 border-pink-500' : 'bg-white/40 text-gray-600 hover:bg-white/60'}`}
                    >
                        <Video size={18} /> 单视频
                    </button>
                </div>

                <div className="p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        AI 真实数据分析{analysisType === 'account' ? '：抖音账号' : '：单视频'}
                    </h2>
                    
                    <div className="mb-6">
                        <input 
                            type="text" 
                            value={rawInput}
                            onChange={(e) => setRawInput(e.target.value)}
                            onPaste={(e) => {
                                const text = e.clipboardData.getData('text');
                                const url = extractUrl(text);
                                if (url) {
                                    e.preventDefault();
                                    setRawInput(url);
                                }
                            }}
                            placeholder={analysisType === 'account' 
                                ? "粘贴抖音主页链接/分享文本（自动提取链接）" 
                                : "粘贴视频链接/分享文本（自动提取链接）"
                            }
                            className="w-full p-4 rounded-lg border border-gray-300 bg-white/60 backdrop-blur focus:bg-white/80 focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all outline-none text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                            * 支持直接粘贴「抖音分享文案」文本，系统会自动提取其中的链接。
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            onClick={handleAnalyze}
                            isLoading={loading}
                            className="flex-1 py-3 text-base shadow-pink-200/50"
                            icon={<Zap size={18} />}
                            disabled={!rawInput.trim()}
                        >
                            {loading ? '正在分析中...' : '开始分析'}
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={handleTestLink}
                            isLoading={testingLink}
                            className="px-4 py-3 text-base"
                            icon={<Search size={18} />}
                            disabled={!rawInput.trim()}
                        >
                            测试链接
                        </Button>
                    </div>

                    {linkTestMessage ? (
                        <p className="text-xs text-gray-500 mt-2">{linkTestMessage}</p>
                    ) : null}

                    <label className="mt-4 flex items-center gap-2 text-sm text-gray-600 select-none">
                        <input
                            type="checkbox"
                            checked={deepMode}
                            onChange={(e) => setDeepMode(e.target.checked)}
                            className="accent-pink-600"
                        />
                        深度模式（更长、更细，耗时更久）
                    </label>
                </div>
            </div>

            <div className="mb-6">
                <FlowToolkit kind={analysisType} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="dy-glass p-6 rounded-xl">
                    <h3 className="font-semibold text-gray-900 mb-4">功能说明</h3>
                    <ul className="list-disc list-inside space-y-3 text-sm text-gray-600 leading-relaxed">
                        <li><strong>全网搜索</strong>：AI 会通过 Google 实时搜索该账号的粉丝数、获赞数等公开数据。</li>
                        <li><strong>拒绝瞎编</strong>：如果搜不到数据，AI 会显示“未知”，确保信息真实性。</li>
                        <li><strong>爆款验证</strong>：分析报告中会列举搜索到的真实视频标题作为证据。</li>
                    </ul>
                </div>

                <div className="dy-glass p-6 rounded-xl flex flex-col justify-center items-center text-center">
                   <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
                       <Clock className="text-gray-400" size={32} />
                   </div>
                   <h3 className="font-medium text-gray-900 mb-2">历史记录</h3>
                   <Button variant="secondary" onClick={() => setMode('history')} className="w-full">
                        查看全部记录
                   </Button>
                </div>
            </div>
        </div>
    );

	    const renderResult = () => {
	        if (!currentResult) return null;
	        const hotVideosSummary =
	            currentResult.type === 'account' && currentResult.hotVideos && currentResult.hotVideos.length > 0
	                ? calcHotVideosSummary(currentResult.hotVideos)
	                : null;
	        
	        return (
            <div className="max-w-6xl mx-auto py-6 px-4 animate-fade-in-up">
                <div className="flex items-center justify-between mb-6">
                     <button 
                        onClick={() => setMode('input')}
                        className="text-gray-700 hover:text-pink-600 flex items-center gap-2 font-medium bg-white/60 backdrop-blur px-4 py-2 rounded-lg border border-white/50 shadow-sm transition-colors"
                    >
                        <ArrowLeft size={18} /> 返回
                    </button>
                    <div className="flex gap-2">
                         {activeAbort && (loading || transcribing || reanalyzing || generatingTopics || replicating) && (
                             <Button
                                 variant="danger"
                                 onClick={cancelActiveRequest}
                                 icon={<X size={16} />}
                                 className="text-sm"
                             >
                                 取消
                             </Button>
                         )}
                         <a href={currentResult.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-pink-600 hover:underline px-3 py-2">
                             <ExternalLink size={16} /> 原链接
                         </a>
                    </div>
                </div>

                {currentResult.type === 'account' && (
                    <div className="dy-glass rounded-xl p-6 mb-6">
                         <div className="flex flex-col md:flex-row items-center gap-6">
                            <div className="w-20 h-20 rounded-full overflow-hidden shadow-lg bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center">
                                {currentResult.avatarUrl ? (
                                    <img src={currentResult.avatarUrl} alt={currentResult.title} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-white text-2xl font-bold">{currentResult.title.charAt(0).toUpperCase()}</span>
                                )}
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">{currentResult.title}</h2>
                                <p className="text-sm text-gray-500 mb-4 flex items-center justify-center md:justify-start gap-2">
                                    <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                                    IP属地: {currentResult.stats?.location || '未知'}
                                </p>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 border-t border-white/40 pt-4 md:border-none md:pt-0">
                                    <div>
                                        <div className="text-xl font-bold text-gray-900">{currentResult.stats?.followers}</div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">粉丝</div>
                                    </div>
                                    <div>
                                        <div className="text-xl font-bold text-gray-900">{currentResult.stats?.following}</div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">关注</div>
                                    </div>
                                    <div>
                                        <div className="text-xl font-bold text-gray-900">{currentResult.stats?.likes}</div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">获赞</div>
                                    </div>
                                    <div>
                                        <div className="text-xl font-bold text-gray-900">{currentResult.stats?.awemeCount ?? '-'}</div>
                                        <div className="text-xs text-gray-500 uppercase tracking-wide mt-1">作品</div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex-shrink-0 text-xs text-gray-400">
                                * 数据来自抖音公开接口/分享页解析
                            </div>
                        </div>
                    </div>
	                )}

	                {/* 未抓取到热门视频时提示（仅账号分析） */}
	                {currentResult.type === 'account' && (!currentResult.hotVideos || currentResult.hotVideos.length === 0) && (
	                    <div className="bg-amber-50 rounded-xl shadow-sm border border-amber-200 p-4 mb-6">
	                        <div className="flex items-start gap-3">
	                            <AlertTriangle size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
	                            <div>
	                                <div className="font-semibold text-amber-900">未抓取到热门视频样本</div>
	                                <div className="text-sm text-amber-800 mt-1">
	                                    本次报告将更多基于账号昵称/签名/数据推断，可信度会下降。建议稍后重试或更换链接（尽量使用带 sec_uid 的分享链接）。
	                                </div>
	                            </div>
	                        </div>
	                    </div>
	                )}

	                {/* 热门视频列表 - 仅账号分析 */}
		                {currentResult.type === 'account' && currentResult.hotVideos && currentResult.hotVideos.length > 0 && (
		                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
		                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
		                            <Play size={18} className="text-pink-500" />
	                            热门视频 TOP{currentResult.hotVideos.length}
	                            <span className="text-xs font-normal text-gray-400 ml-2">按点赞数排序</span>
	                        </h3>

	                        {hotVideosSummary ? (
	                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
	                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
	                                    <div className="text-lg font-bold text-gray-900">{hotVideosSummary.sampleCount}</div>
	                                    <div className="text-xs text-gray-500 mt-1">样本数</div>
	                                </div>
	                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
	                                    <div className="text-lg font-bold text-gray-900">{formatVideoCount(hotVideosSummary.avgLike)}</div>
	                                    <div className="text-xs text-gray-500 mt-1">平均点赞</div>
	                                </div>
	                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
	                                    <div className="text-lg font-bold text-gray-900">{formatVideoCount(hotVideosSummary.medianLike)}</div>
	                                    <div className="text-xs text-gray-500 mt-1">中位点赞</div>
	                                </div>
	                                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
	                                    <div className="text-lg font-bold text-gray-900">{formatVideoCount(hotVideosSummary.maxLike)}</div>
	                                    <div className="text-xs text-gray-500 mt-1">最高点赞</div>
	                                </div>
	                            </div>
	                        ) : null}
	                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
	                            {currentResult.hotVideos.map((video, index) => (
	                                <div key={video.awemeId} className="group">
                                    <div
                                        className="cursor-pointer"
                                        onClick={() => {
                                            // 跳转到单视频分析
                                            const videoUrl = `https://www.douyin.com/video/${video.awemeId}`;
                                            setRawInput(videoUrl);
                                            setAnalysisType('video');
                                            setMode('input');
                                        }}
                                    >
                                        <div className="relative aspect-[9/16] rounded-lg overflow-hidden bg-gray-100 mb-2">
                                            {video.coverUrl ? (
                                                <img
                                                    src={video.coverUrl}
                                                    alt={video.desc}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    referrerPolicy="no-referrer"
                                                    onError={(e) => {
                                                        // 图片加载失败时隐藏
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                    <Video size={24} />
                                                </div>
                                            )}
                                            {/* 排名标签 */}
                                            <div className={`absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                                index === 0 ? 'bg-red-500' : index === 1 ? 'bg-orange-500' : index === 2 ? 'bg-yellow-500' : 'bg-gray-500'
                                            }`}>
                                                {index + 1}
                                            </div>
                                            {/* 播放按钮遮罩 */}
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Search size={18} className="text-gray-700" />
                                                </div>
                                            </div>
	                                            {/* 互动数据 */}
	                                            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
	                                                <div className="flex items-center gap-1 text-white text-[11px] bg-black/50 px-2 py-1 rounded">
	                                                    <Heart size={12} />
	                                                    {formatVideoCount(video.stats.diggCount)}
	                                                </div>
	                                                <div className="flex items-center gap-1 text-white text-[11px] bg-black/50 px-2 py-1 rounded">
	                                                    <MessageCircle size={12} />
	                                                    {formatVideoCount(video.stats.commentCount)}
	                                                </div>
	                                                <div className="flex items-center gap-1 text-white text-[11px] bg-black/50 px-2 py-1 rounded">
	                                                    <Bookmark size={12} />
	                                                    {formatVideoCount(video.stats.collectCount)}
	                                                </div>
	                                            </div>
	                                        </div>
	                                    </div>
                                    <p className="text-xs text-gray-700 line-clamp-2 group-hover:text-pink-600 transition-colors mb-2">
                                        {video.desc || '无标题'}
                                    </p>
                                    {/* 快捷操作按钮 */}
                                    <div className="flex gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const videoUrl = `https://www.douyin.com/video/${video.awemeId}`;
                                                setRawInput(videoUrl);
                                                setAnalysisType('video');
                                                setMode('input');
                                            }}
                                            className="flex-1 text-xs py-1.5 px-2 bg-pink-50/70 text-pink-700 rounded hover:bg-pink-100/70 transition-colors flex items-center justify-center gap-1"
                                            title="分析视频"
                                        >
                                            <BarChart2 size={12} />
                                            分析
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                // 直接打开抖音视频链接
                                                window.open(`https://www.douyin.com/video/${video.awemeId}`, '_blank');
                                            }}
                                            className="flex-1 text-xs py-1.5 px-2 bg-purple-50 text-purple-600 rounded hover:bg-purple-100 transition-colors flex items-center justify-center gap-1"
                                            title="查看原视频"
                                        >
                                            <ExternalLink size={12} />
                                            原视频
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 pt-4 border-t border-white/40">
                            <p className="text-xs text-gray-500 mb-3 text-center">
                                选择上方视频进行「分析」后，可提取文案并进行「文案复刻」
                            </p>
                            <div className="flex justify-center">
                                <button
                                    onClick={() => {
                                        // 分析第一个热门视频
                                        if (currentResult.hotVideos && currentResult.hotVideos.length > 0) {
                                            const topVideo = currentResult.hotVideos[0];
                                            const videoUrl = `https://www.douyin.com/video/${topVideo.awemeId}`;
                                            setRawInput(videoUrl);
                                            setAnalysisType('video');
                                            setMode('input');
                                        }
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-medium rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors"
                                >
                                    <Wand2 size={16} />
                                    分析 TOP1 视频并复刻文案
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {currentResult.type === 'video' && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="w-full md:w-52">
                                <div className="aspect-square w-full rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
                                    {currentResult.coverUrl ? (
                                        <img
                                            src={currentResult.coverUrl}
                                            alt={currentResult.title}
                                            className="w-full h-full object-cover"
                                            referrerPolicy="no-referrer"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">暂无封面</div>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">{currentResult.title}</h2>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 border border-gray-200">
                                        {currentResult.avatarUrl ? (
                                            <img src={currentResult.avatarUrl} alt={currentResult.authorName || 'author'} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">作者</div>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 truncate">{currentResult.authorName || '未知作者'}</div>
                                        <div className="text-xs text-gray-500">* 数据来自抖音分享页解析</div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                        <div className="text-lg font-bold text-gray-900">{currentResult.stats?.diggCount ?? '-'}</div>
                                        <div className="text-xs text-gray-500 mt-1">点赞</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                        <div className="text-lg font-bold text-gray-900">{currentResult.stats?.commentCount ?? '-'}</div>
                                        <div className="text-xs text-gray-500 mt-1">评论</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                        <div className="text-lg font-bold text-gray-900">{currentResult.stats?.collectCount ?? '-'}</div>
                                        <div className="text-xs text-gray-500 mt-1">收藏</div>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                        <div className="text-lg font-bold text-gray-900">{currentResult.stats?.shareCount ?? '-'}</div>
                                        <div className="text-xs text-gray-500 mt-1">分享</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-8 space-y-6">
                         <div className="dy-glass-strong rounded-xl overflow-hidden min-h-[500px]">
                            <div className="border-b border-white/40 p-4 flex items-center gap-3 bg-white/35 backdrop-blur">
                                <div className="bg-pink-100/70 p-2 rounded text-pink-700">
                                    <BarChart2 size={20} />
                                </div>
                                <h3 className="font-bold text-gray-800">
                                    {currentResult.type === 'account' ? '账号深度分析报告' : '视频文案深度解析'}
                                </h3>
                            </div>
	                            <div className="p-8 prose prose-pink max-w-none prose-a:text-pink-700 prose-headings:font-bold prose-h1:text-3xl prose-h1:font-extrabold prose-h2:text-2xl prose-h2:font-bold prose-h3:text-xl prose-h3:font-bold prose-p:text-base prose-li:text-base">
                                {/* 流式输出时显示 streamingContent，完成后显示 currentResult.content */}
                                {loading ? (
                                    streamingContent ? (
                                        <>
                                            <ReportMarkdown content={streamingContent} />
                                            <span className="inline-block w-2 h-4 bg-pink-500 animate-pulse ml-1" />
                                        </>
                                    ) : (
                                        <div className="flex items-center gap-3 text-pink-700 py-8">
                                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            <span>正在分析中，请稍候...</span>
                                        </div>
                                    )
                                ) : (
                                    <ReportMarkdown content={currentResult.content} />
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-4 space-y-6">
                        <FlowToolkit
                            kind={currentResult.type}
                            reportTitle={currentResult.title}
                            reportContent={loading ? (streamingContent || '') : currentResult.content}
                            hotVideos={currentResult.type === 'account' ? currentResult.hotVideos : undefined}
                            currentUrl={currentResult.url}
                        />
                        {/* 选题生成 - 仅账号分析时显示 */}
                        {currentResult.type === 'account' && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                                <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <Lightbulb size={16} className="text-yellow-500" />
                                    选题生成
                                </h4>

                                <div className="space-y-3">
                                    {/* 人设选择 */}
                                    <div className="relative">
                                        <select
                                            value={topicPersonaId}
                                            onChange={(e) => setTopicPersonaId(e.target.value)}
                                            className="w-full p-2 text-sm rounded-lg border border-gray-200 bg-white appearance-none pr-8"
                                        >
                                            <option value="">选择人设档案（可选）</option>
                                            {personas.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>

                                    <Button
                                        onClick={handleGenerateTopics}
                                        isLoading={generatingTopics}
                                        icon={<Lightbulb size={16} />}
                                        className="w-full text-sm bg-yellow-500 hover:bg-yellow-600"
                                    >
                                        {generatingTopics ? '正在生成选题...' : '生成10个爆款选题'}
                                    </Button>
                                </div>

                                {/* 选题结果 */}
                                {generatedTopics && (
                                    <div className="mt-4 pt-4 border-t border-white/40">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-gray-700">选题列表</span>
                                            <button
                                                onClick={() => copyToClipboard(generatedTopics)}
                                                className="text-xs text-yellow-600 hover:text-yellow-700"
                                            >
                                                复制全部
                                            </button>
                                        </div>
                                        <div className="bg-white/50 backdrop-blur p-3 rounded-lg text-sm prose prose-sm max-w-none max-h-80 overflow-y-auto border border-white/50">
                                            <ReportMarkdown content={generatedTopics} compact />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {currentResult.transcript ? (
                             <div className="dy-glass rounded-xl p-5">
                                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                    <Copy size={16} className="text-green-500" />
                                    视频文案
                                </h4>
                                <div className="bg-white/50 backdrop-blur p-3 rounded text-sm text-gray-700 mb-3 h-40 overflow-y-auto custom-scrollbar border border-white/50">
                                    {currentResult.transcript}
                                </div>
                                <div className="space-y-2">
                                    <Button variant="secondary" className="w-full text-sm" onClick={() => copyToClipboard(currentResult.transcript!)}>
                                        复制完整文案
                                    </Button>
                                    {currentResult.type === 'video' && (
                                        <Button
                                            className="w-full text-sm bg-pink-600 hover:bg-pink-700"
                                            onClick={handleReanalyze}
                                            isLoading={reanalyzing}
                                            icon={<BarChart2 size={16} />}
                                        >
                                            {reanalyzing ? '正在深度分析...' : '深度脚本分析'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ) : currentResult.type === 'video' && (
                            <div className="dy-glass rounded-xl p-5">
                                <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                                    <Mic size={16} className="text-orange-500" />
                                    提取视频文案
                                </h4>
                                <p className="text-xs text-gray-500 mb-3">
                                    该视频暂无字幕数据，点击下方按钮提取视频文案，提取后可进行深度脚本分析和文案复刻。
                                </p>
                                 <Button
                                     variant="secondary"
                                     className="w-full text-sm"
                                     onClick={handleTranscribe}
                                     isLoading={transcribing}
                                     icon={<Mic size={16} />}
                                 >
                                     {transcribing ? '正在提取文案...' : '提取视频文案'}
                                 </Button>
                                 {transcribing && captionProgress && (
                                     <p className="text-xs text-gray-500 mt-2 text-center">
                                         {captionProgress}
                                     </p>
                                 )}
                                 <p className="text-xs text-gray-400 mt-2 text-center">
                                     * 默认使用语音识别提取口播文案
                                 </p>
                             </div>
                         )}

                        {/* 文案复刻功能 - 仅视频且有文案时显示 */}
                        {currentResult.type === 'video' && currentResult.transcript && (
                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                                <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <Wand2 size={16} className="text-purple-500" />
                                    文案复刻
                                </h4>

                                <div className="space-y-3">
                                    {/* 视频类型选择 */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setVideoType('oral')}
                                            className={`flex-1 py-2 px-3 text-xs rounded-lg border transition-colors ${
                                                videoType === 'oral'
                                                    ? 'bg-purple-50 border-purple-300 text-purple-700'
                                                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            口播类视频
                                        </button>
                                        <button
                                            onClick={() => setVideoType('other')}
                                            className={`flex-1 py-2 px-3 text-xs rounded-lg border transition-colors ${
                                                videoType === 'other'
                                                    ? 'bg-purple-50 border-purple-300 text-purple-700'
                                                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            剧情/其他
                                        </button>
                                    </div>

                                    {/* 人设选择 */}
                                    <div className="relative">
                                        <select
                                            value={selectedPersonaId}
                                            onChange={(e) => setSelectedPersonaId(e.target.value)}
                                            className="w-full p-2 text-sm rounded-lg border border-gray-200 bg-white appearance-none pr-8"
                                        >
                                            <option value="">选择人设档案（可选）</option>
                                            {personas.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>

                                    {/* 产品选择 */}
                                    <div className="relative">
                                        <select
                                            value={selectedProductId}
                                            onChange={(e) => setSelectedProductId(e.target.value)}
                                            className="w-full p-2 text-sm rounded-lg border border-gray-200 bg-white appearance-none pr-8"
                                        >
                                            <option value="">选择产品（可选）</option>
                                            {products.map(p => (
                                                <option key={p.id} value={p.id}>{p.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>

                                    {/* 自定义选题 */}
                                    <input
                                        type="text"
                                        value={customTopic}
                                        onChange={(e) => setCustomTopic(e.target.value)}
                                        placeholder="自定义选题（留空随机生成）"
                                        className="w-full p-2 text-sm rounded-lg border border-gray-200"
                                    />

                                    {/* 特殊要求 */}
                                    <textarea
                                        value={specialRequirements}
                                        onChange={(e) => setSpecialRequirements(e.target.value)}
                                        placeholder="特殊要求（可选）"
                                        rows={2}
                                        className="w-full p-2 text-sm rounded-lg border border-gray-200 resize-none"
                                    />

                                    <Button
                                        onClick={handleReplicateCopywriting}
                                        isLoading={replicating}
                                        icon={<Wand2 size={16} />}
                                        className="w-full text-sm bg-purple-600 hover:bg-purple-700"
                                    >
                                        {replicating ? '正在生成中...' : '生成文案复刻'}
                                    </Button>
                                </div>

                                {/* 复刻结果 */}
                                {replicatedContent && (
                                    <div className="mt-4 pt-4 border-t border-white/40">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-gray-700">生成结果</span>
                                            <button
                                                onClick={() => copyToClipboard(replicatedContent)}
                                                className="text-xs text-purple-600 hover:text-purple-700"
                                            >
                                                复制全部
                                            </button>
                                        </div>
                                    <div className="bg-white/50 backdrop-blur p-3 rounded-lg text-sm prose prose-sm max-w-none max-h-80 overflow-y-auto border border-white/50">
                                            <ReportMarkdown content={replicatedContent} compact />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="bg-gradient-to-br from-pink-500 to-fuchsia-600 rounded-xl shadow-lg shadow-pink-200/40 p-6 text-white">
                            <h4 className="font-bold text-lg mb-2 flex items-center gap-2">
                                <Zap size={18} className="text-yellow-300" />
                                创作同款
                            </h4>
                            <p className="text-pink-100 text-sm mb-6 leading-relaxed">
                                基于此{currentResult.type === 'account' ? '账号风格' : '视频逻辑'}，一键生成您的专属脚本。
                            </p>
                            <Button
                                variant="secondary"
                                className="w-full text-pink-700 border-none font-semibold hover:bg-white/85"
                                onClick={() => {
                                    const prefill = currentResult.type === 'account'
                                        ? `【同款账号】参考账号：${currentResult.title}（${currentResult.url}）\\n\\n请把你要拍的主题写在这里（例如：你要讲的产品/观点/故事），我会按该账号的表达风格生成完整分镜脚本：\\n`
                                        : `【同款视频】参考视频：${currentResult.title}（${currentResult.url}）\\n\\n请把你要替换成的新主题写在这里（例如：产品/赛道/故事），我会按该视频的结构节奏生成完整分镜脚本：\\n`;
                                    onCreateSimilar?.(prefill);
                                }}
                                disabled={!onCreateSimilar}
                            >
                                去创作同款脚本
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderHistory = () => {
        const accountHistory = history.filter(h => h.type === 'account');
        const videoHistory = history.filter(h => h.type === 'video');
        const transcriptHistory = videoHistory.filter(h => h.transcript && h.transcript.length > 0);

        return (
            <div className="max-w-7xl mx-auto py-8 px-4 h-full flex flex-col">
                 <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => setMode('input')}
                            className="text-gray-500 hover:text-pink-600"
                        >
                            <ArrowLeft size={24} />
                        </button>
                        <h2 className="text-2xl font-bold text-gray-900">分析历史记录</h2>
                        <span className="bg-pink-100/70 text-pink-800 px-3 py-1 rounded-full text-xs font-semibold">
                            Total: {history.length}
                        </span>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden min-h-0">
                     
                     {/* Column 1: Recent Users */}
                     <div className="dy-glass rounded-xl flex flex-col h-full overflow-hidden">
                        <div className="p-4 border-b border-white/40 bg-white/35 backdrop-blur font-semibold text-gray-700 flex items-center gap-2">
                            <User size={16} className="text-blue-500" /> 最近分析的用户
                        </div>
                        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
                            {accountHistory.length > 0 ? accountHistory.map(item => (
                                <div key={item.id} onClick={() => { setCurrentResult(item); setMode('result'); }} className="p-3 border border-white/40 rounded-lg hover:border-pink-300 hover:shadow-sm cursor-pointer transition-all bg-white/60 backdrop-blur flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-sm font-bold">
                                        {item.title.charAt(0)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium text-gray-900 truncate">{item.title}</h4>
                                        <p className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleDateString('zh-CN')}</p>
                                    </div>
                                    <ChevronRight size={14} className="text-gray-300" />
                                </div>
                            )) : <div className="text-center text-gray-400 py-10 text-sm">暂无记录</div>}
                        </div>
                     </div>

                     {/* Column 2: Recent Videos */}
                     <div className="dy-glass rounded-xl flex flex-col h-full overflow-hidden">
                        <div className="p-4 border-b border-white/40 bg-white/35 backdrop-blur font-semibold text-gray-700 flex items-center gap-2">
                            <Video size={16} className="text-pink-600" /> 最近分析的单视频
                        </div>
                        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
                            {videoHistory.length > 0 ? videoHistory.map(item => (
                                <div key={item.id} onClick={() => { setCurrentResult(item); setMode('result'); }} className="p-3 border border-white/40 rounded-lg hover:border-pink-300 hover:shadow-sm cursor-pointer transition-all bg-white/60 backdrop-blur group">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="text-sm font-medium text-gray-900 truncate max-w-[150px]">{item.title}</h4>
                                        <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 line-clamp-2">
                                        {item.content.replace(/[#*]/g, '').slice(0, 50)}...
                                    </p>
                                </div>
                            )) : <div className="text-center text-gray-400 py-10 text-sm">暂无记录</div>}
                        </div>
                     </div>

                     {/* Column 3: Copy History (Real) */}
                     <div className="dy-glass rounded-xl flex flex-col h-full overflow-hidden">
                        <div className="p-4 border-b border-white/40 bg-white/35 backdrop-blur font-semibold text-gray-700 flex items-center gap-2">
                            <Copy size={16} className="text-green-500" /> 文案历史记录
                        </div>
                         <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3">
                             {transcriptHistory.length > 0 ? transcriptHistory.map(item => (
                                 <div key={item.id} className="p-3 border border-gray-100 rounded-lg bg-gray-50 hover:bg-white hover:border-green-300 transition-colors">
                                     <div className="flex justify-between items-start mb-2">
                                         <span className="text-xs font-medium text-gray-500 truncate max-w-[120px]">{item.title}</span>
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); copyToClipboard(item.transcript!); }}
                                            className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50"
                                            title="复制文案"
                                         >
                                             <Copy size={14} />
                                         </button>
                                     </div>
                                     <div className="text-xs text-gray-600 line-clamp-3 bg-white p-2 rounded border border-gray-100">
                                         {item.transcript}
                                     </div>
                                 </div>
                             )) : <div className="text-center text-gray-400 py-10 text-sm">暂无提取的文案记录</div>}
                        </div>
                     </div>
                 </div>
            </div>
        );
    }

    switch(mode) {
        case 'result': return renderResult();
        case 'history': return renderHistory();
        default: return renderInput();
    }
};
