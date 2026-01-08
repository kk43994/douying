import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  Clock,
  Copy,
  ExternalLink,
  Lightbulb,
  MessageCircle,
  Search,
  User,
  Video,
  Wand2,
  Zap,
} from 'lucide-react';
import type { HotVideo } from '../types';

type ToolkitKind = 'account' | 'video';

type ToolkitTab = 'core' | 'utility';

type Feature = {
  id: string;
  title: string;
  desc: string;
  badge?: string;
  icon: React.ReactNode;
};

function formatCount(count: number): string {
  if (!Number.isFinite(count)) return '-';
  if (count >= 10000) return `${(count / 10000).toFixed(1)}w`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function safeTimeMs(ts: number): number {
  if (!Number.isFinite(ts)) return 0;
  return ts < 1e12 ? ts * 1000 : ts;
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function copy(text: string) {
  navigator.clipboard.writeText(text);
  alert('已复制到剪贴板');
}

export function FlowToolkit(props: {
  kind: ToolkitKind;
  reportTitle?: string;
  reportContent?: string;
  hotVideos?: HotVideo[];
  currentUrl?: string;
}) {
  const { kind, reportTitle, reportContent, hotVideos = [], currentUrl } = props;

  const defaultCoreId = kind === 'account' ? 'dashboard' : 'timeline';
  const [tab, setTab] = useState<ToolkitTab>('core');
  const [activeId, setActiveId] = useState<string>(defaultCoreId);
  const [benchLinks, setBenchLinks] = useState<string[]>(['', '', '']);
  const [batchText, setBatchText] = useState('');
  const [planChecked, setPlanChecked] = useState<boolean[]>(Array.from({ length: 7 }, () => false));

  useEffect(() => {
    setTab('core');
    setActiveId(defaultCoreId);
  }, [defaultCoreId]);

  const sortedByLike = useMemo(() => {
    const list = hotVideos
      .filter(v => v && v.stats && typeof v.stats.diggCount === 'number')
      .slice()
      .sort((a, b) => (b.stats?.diggCount ?? 0) - (a.stats?.diggCount ?? 0));
    return list;
  }, [hotVideos]);

  const dashboardStats = useMemo(() => {
    if (sortedByLike.length === 0) return null;
    const likes = sortedByLike.map(v => v.stats.diggCount).slice().sort((a, b) => a - b);
    const avg = Math.round(likes.reduce((s, n) => s + n, 0) / likes.length);
    const median = likes[Math.floor(likes.length / 2)];
    const p75 = likes[Math.floor(likes.length * 0.75)];
    const max = likes[likes.length - 1];
    return { sample: likes.length, avg, median, p75, max };
  }, [sortedByLike]);

  const scheduleStats = useMemo(() => {
    const times = hotVideos
      .map(v => (v.createTime ? safeTimeMs(v.createTime) : 0))
      .filter(Boolean)
      .sort((a, b) => b - a);
    if (times.length < 2) return null;

    const hours = new Array(24).fill(0);
    for (const t of times) {
      const d = new Date(t);
      hours[d.getHours()] += 1;
    }
    const topHours = hours
      .map((count, hour) => ({ hour, count }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const intervals: number[] = [];
    for (let i = 0; i < times.length - 1; i++) {
      const diffDays = Math.max(0, (times[i] - times[i + 1]) / (1000 * 60 * 60 * 24));
      if (Number.isFinite(diffDays)) intervals.push(diffDays);
    }
    intervals.sort((a, b) => a - b);
    const medianGap = intervals.length ? intervals[Math.floor(intervals.length / 2)] : 0;

    return {
      topHours,
      medianGapDays: medianGap,
    };
  }, [hotVideos]);

  const coreFeatures: Feature[] = useMemo(() => {
    if (kind === 'account') {
      return [
        {
          id: 'dashboard',
          title: '作品数据看板',
          desc: '用热门作品样本做“可视化证据”。',
          badge: sortedByLike.length ? '可预览' : '缺样本',
          icon: <BarChart2 size={16} />,
        },
        {
          id: 'pillars',
          title: '内容支柱拆分',
          desc: '按细分赛道/主题聚类，找主航道与副航道。',
          badge: '待开发',
          icon: <Video size={16} />,
        },
        {
          id: 'review',
          title: '爆款复盘库',
          desc: '把 Top 视频拆成可复用模板。',
          badge: sortedByLike.length ? '可预览' : '缺样本',
          icon: <Lightbulb size={16} />,
        },
        {
          id: 'schedule',
          title: '发布时间/频率',
          desc: '用时间轴找“发文节奏”和窗口期。',
          badge: scheduleStats ? '可预览' : '缺样本',
          icon: <Clock size={16} />,
        },
        {
          id: 'audience',
          title: '粉丝画像推断',
          desc: '结论必须引用样本证据，不够就写“推断”。',
          badge: '待开发',
          icon: <User size={16} />,
        },
        {
          id: 'ipPersona',
          title: 'IP人设一致性',
          desc: '人设、封面、标题、叙事视角是否统一。',
          badge: '待开发',
          icon: <Wand2 size={16} />,
        },
        {
          id: 'benchmark',
          title: '对标竞品对比',
          desc: '输入 1-3 个对标账号，输出差距清单。',
          badge: '待开发',
          icon: <Search size={16} />,
        },
        {
          id: 'growthPlan',
          title: '7天增长任务',
          desc: '把建议落成“每天拍什么/怎么发”。',
          badge: '可预览',
          icon: <Zap size={16} />,
        },
      ];
    }

    return [
      {
        id: 'timeline',
        title: '时间轴拆解',
        desc: '0-3秒钩子/转折/高潮/结尾转粉逐段点评。',
        badge: '待开发',
        icon: <Clock size={16} />,
      },
      {
        id: 'potential',
        title: '流量潜力评分',
        desc: '用可解释维度给分，找最高杠杆改法。',
        badge: '待开发',
        icon: <BarChart2 size={16} />,
      },
      {
        id: 'ab',
        title: '标题/封面A/B',
        desc: '一条视频给多组标题/封面方向+适配人群。',
        badge: '待开发',
        icon: <Wand2 size={16} />,
      },
      {
        id: 'comment',
        title: '评论区打法',
        desc: '置顶评论/互动话术/争议点控制。',
        badge: '待开发',
        icon: <MessageCircle size={16} />,
      },
      {
        id: 'rewrite',
        title: '脚本重写',
        desc: '更短更狠/更强情绪/更垂直三版改写。',
        badge: '待开发',
        icon: <Copy size={16} />,
      },
    ];
  }, [kind, scheduleStats, sortedByLike.length]);

  const utilityFeatures: Feature[] = useMemo(() => {
    return [
      {
        id: 'batch',
        title: '批量分析',
        desc: '粘贴多链接排队跑，出汇总表。',
        badge: '待开发',
        icon: <Zap size={16} />,
      },
      {
        id: 'compare',
        title: '历史对比',
        desc: '同账号多次分析对比变化。',
        badge: '待开发',
        icon: <BarChart2 size={16} />,
      },
      {
        id: 'export',
        title: '导出报告',
        desc: '一键导出 Markdown/PDF（先做 MD）。',
        badge: reportContent ? '可用' : '无报告',
        icon: <ExternalLink size={16} />,
      },
      {
        id: 'prompt',
        title: '提示词模板',
        desc: '保存你的分析模板/写作模板。',
        badge: '待开发',
        icon: <Wand2 size={16} />,
      },
      {
        id: 'diagnose',
        title: '失败诊断',
        desc: '抓取/ASR/模型失败给可操作原因。',
        badge: '待开发',
        icon: <AlertTriangle size={16} />,
      },
    ];
  }, [reportContent]);

  const features = tab === 'core' ? coreFeatures : utilityFeatures;
  const active = features.find(f => f.id === activeId) ?? features[0];

  const title = tab === 'core' ? (kind === 'account' ? '账号流量工具箱' : '视频拆解工具箱') : '便捷功能';

  const renderPreview = () => {
    if (!active) return null;

    if (tab === 'utility' && active.id === 'export') {
      return (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">将当前报告导出为 Markdown 文件。</div>
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold disabled:opacity-50"
              disabled={!reportContent}
              onClick={() => {
                if (!reportContent) return;
                const safeTitle = (reportTitle || (kind === 'account' ? '账号分析' : '单视频分析'))
                  .replace(/[\\/:*?\"<>|]/g, ' ')
                  .trim()
                  .slice(0, 60);
                downloadText(`${safeTitle || 'report'}.md`, reportContent);
              }}
            >
              导出 Markdown
            </button>
            <button
              className="px-3 py-2 rounded-lg bg-white/70 hover:bg-white/85 border border-white/60 text-gray-800 text-sm font-semibold backdrop-blur disabled:opacity-50"
              disabled={!reportContent}
              onClick={() => reportContent && copy(reportContent)}
            >
              复制全文
            </button>
          </div>
        </div>
      );
    }

    if (tab === 'utility' && active.id === 'batch') {
      return (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">粘贴多个链接（每行一个），后续会做队列与汇总。</div>
          <textarea
            value={batchText}
            onChange={(e) => setBatchText(e.target.value)}
            rows={5}
            placeholder="https://www.douyin.com/user/...\nhttps://www.douyin.com/video/..."
            className="w-full p-3 rounded-lg border border-gray-300 bg-white/70 backdrop-blur outline-none text-sm"
          />
          <button
            className="w-full px-3 py-2 rounded-lg bg-gray-200 text-gray-500 text-sm font-semibold cursor-not-allowed"
            onClick={() => alert('该功能仅做了前端入口，后端队列/并发与汇总还未接入。')}
          >
            开始批量分析（开发中）
          </button>
        </div>
      );
    }

    if (tab === 'utility' && active.id === 'compare') {
      return (
        <div className="space-y-2 text-sm text-gray-700">
          <div>入口已预留：后续在「历史记录」支持选择两条报告一键对比。</div>
          <div className="text-xs text-gray-500">对比维度建议：选题变化、爆款率、互动中位数、赛道漂移、人设一致性。</div>
        </div>
      );
    }

    if (tab === 'utility' && active.id === 'prompt') {
      return (
        <div className="space-y-2 text-sm text-gray-700">
          <div>入口已预留：后续支持保存/切换「账号分析模板」「视频拆解模板」。</div>
          <div className="text-xs text-gray-500">目标：更稳定的中文输出、更少跑偏、更少 JSON/代码块污染。</div>
        </div>
      );
    }

    if (tab === 'utility' && active.id === 'diagnose') {
      return (
        <div className="space-y-2 text-sm text-gray-700">
          <div>入口已预留：后续把失败原因归类成“链接不可访问/风控/转写失败/模型超时”。</div>
          <div className="text-xs text-gray-500">建议：遇到链接问题先点「链接测试」，再决定是否“推断继续分析”。</div>
        </div>
      );
    }

    if (kind === 'account' && active.id === 'dashboard') {
      if (!dashboardStats) {
        return <div className="text-sm text-gray-600">暂无热门视频样本，先抓到作品列表才能做看板。</div>;
      }
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/60 backdrop-blur rounded-lg border border-white/50 p-3">
              <div className="text-lg font-bold text-gray-900">{dashboardStats.sample}</div>
              <div className="text-xs text-gray-500 mt-1">样本数</div>
            </div>
            <div className="bg-white/60 backdrop-blur rounded-lg border border-white/50 p-3">
              <div className="text-lg font-bold text-gray-900">{formatCount(dashboardStats.median)}</div>
              <div className="text-xs text-gray-500 mt-1">中位点赞</div>
            </div>
            <div className="bg-white/60 backdrop-blur rounded-lg border border-white/50 p-3">
              <div className="text-lg font-bold text-gray-900">{formatCount(dashboardStats.p75)}</div>
              <div className="text-xs text-gray-500 mt-1">P75点赞</div>
            </div>
            <div className="bg-white/60 backdrop-blur rounded-lg border border-white/50 p-3">
              <div className="text-lg font-bold text-gray-900">{formatCount(dashboardStats.max)}</div>
              <div className="text-xs text-gray-500 mt-1">最高点赞</div>
            </div>
          </div>

          <div className="text-sm font-semibold text-gray-800">Top 10 样本</div>
          <div className="space-y-2">
            {sortedByLike.slice(0, 10).map(v => (
              <div key={v.awemeId} className="flex items-start gap-2 text-sm">
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-pink-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-gray-800 line-clamp-2">{v.desc || '（无标题）'}</div>
                  <div className="text-xs text-gray-500 mt-0.5">点赞 {formatCount(v.stats.diggCount)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

      if (kind === 'account' && active.id === 'review') {
        if (sortedByLike.length === 0) {
          return <div className="text-sm text-gray-600">暂无样本，先抓到热门作品再做复盘库。</div>;
        }
        const prompt = `你是爆款短视频拆解大师（以流量为唯一目标）。请只用中文、短句输出。\n\n请复盘以下账号的爆款视频（按钩子/冲突/信息密度/节奏/情绪/转粉点/可复用模板输出），并给出下一条可抄的脚本结构。\n\nTop视频标题：\n${sortedByLike
        .slice(0, 10)
        .map((v, i) => `${i + 1}. ${v.desc || '（无标题）'}（赞${formatCount(v.stats.diggCount)}）`)
        .join('\n')}\n`;
        return (
          <div className="space-y-2">
            <div className="text-sm text-gray-700">已准备复盘模板（后续可一键送入模型）。</div>
          <button
            className="w-full px-3 py-2 rounded-lg bg-white/70 hover:bg-white/85 border border-white/60 text-gray-800 text-sm font-semibold backdrop-blur"
            onClick={() => copy(prompt)}
          >
            复制复盘指令
          </button>
          <div className="text-xs text-gray-500">提示：后续会把“证据引用”做成强约束，避免空泛建议。</div>
        </div>
      );
    }

    if (kind === 'account' && active.id === 'schedule') {
      if (!scheduleStats) {
        return <div className="text-sm text-gray-600">样本时间不足（至少需要 2 条有发布时间的作品）。</div>;
      }
      return (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">Top 发布时间段（样本内）：</div>
          <div className="flex flex-wrap gap-2">
            {scheduleStats.topHours.length ? (
              scheduleStats.topHours.map(h => (
                <span
                  key={h.hour}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-pink-50/70 text-pink-800 border border-pink-200"
                >
                  {String(h.hour).padStart(2, '0')}:00（{h.count}条）
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-500">暂无</span>
            )}
          </div>
          <div className="text-sm text-gray-700">
            发布间隔中位数：<span className="font-semibold">{scheduleStats.medianGapDays.toFixed(1)}</span> 天
          </div>
          <div className="text-xs text-gray-500">后续会叠加“互动表现”给出更可信的发布时间建议。</div>
        </div>
      );
    }

    if (kind === 'account' && active.id === 'benchmark') {
      return (
        <div className="space-y-3">
          <div className="text-sm text-gray-700">输入 1-3 个对标账号链接（后续会抓数据并输出差距清单）。</div>
          <div className="space-y-2">
            {benchLinks.map((v, idx) => (
              <input
                key={idx}
                value={v}
                onChange={(e) => {
                  const next = benchLinks.slice();
                  next[idx] = e.target.value;
                  setBenchLinks(next);
                }}
                placeholder={`对标账号 ${idx + 1}（可选）`}
                className="w-full p-2.5 rounded-lg border border-gray-300 bg-white/70 backdrop-blur outline-none text-sm"
              />
            ))}
          </div>
          <button
            className="w-full px-3 py-2 rounded-lg bg-gray-200 text-gray-500 text-sm font-semibold cursor-not-allowed"
            onClick={() => alert('该功能仅做了前端入口，后续会接入抓取与对比逻辑。')}
          >
            开始对标对比（开发中）
          </button>
        </div>
      );
    }

    if (kind === 'account' && active.id === 'growthPlan') {
      const days = ['D1 选题', 'D2 钩子', 'D3 节奏', 'D4 封面标题', 'D5 评论区', 'D6 复盘', 'D7 迭代'];
      return (
        <div className="space-y-2">
          <div className="text-sm text-gray-700">7 天增长清单（前端预览，后续由模型生成具体任务）。</div>
          <div className="space-y-2">
            {days.map((label, idx) => (
              <label key={label} className="flex items-center gap-2 text-sm text-gray-800 select-none">
                <input
                  type="checkbox"
                  className="accent-pink-600"
                  checked={planChecked[idx]}
                  onChange={(e) => {
                    const next = planChecked.slice();
                    next[idx] = e.target.checked;
                    setPlanChecked(next);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="text-xs text-gray-500">后续会把任务细化成“每天拍什么+标题怎么写+转粉怎么做”。</div>
        </div>
      );
    }

    return (
      <div className="space-y-2 text-sm text-gray-700">
        <div>该功能已预留前端入口，后续接入后端/模型即可生效。</div>
        <div className="text-xs text-gray-500">目标：更强的“证据引用”、更少跑偏、更少解析失败。</div>
      </div>
    );
  };

  return (
    <div className="dy-glass rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-900">{title}</div>
          <div className="text-xs text-gray-500 mt-0.5">点击预览（后端/模型后续接入）</div>
        </div>
        <div className="flex gap-1 bg-white/50 border border-white/50 rounded-lg p-1 backdrop-blur">
          <button
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              tab === 'core' ? 'bg-white/80 text-pink-700' : 'text-gray-600 hover:bg-white/60'
            }`}
            onClick={() => {
              setTab('core');
              setActiveId(kind === 'account' ? 'dashboard' : 'timeline');
            }}
          >
            核心
          </button>
          <button
            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
              tab === 'utility' ? 'bg-white/80 text-pink-700' : 'text-gray-600 hover:bg-white/60'
            }`}
            onClick={() => {
              setTab('utility');
              setActiveId('export');
            }}
          >
            便捷
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {features.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveId(f.id)}
            className={`text-left rounded-lg border px-3 py-2 transition-all ${
              activeId === f.id
                ? 'bg-pink-50/70 border-pink-200 shadow-sm'
                : 'bg-white/60 border-white/50 hover:bg-white/75'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-pink-600">{f.icon}</span>
                <span className="text-sm font-semibold text-gray-900 truncate">{f.title}</span>
              </div>
              {f.badge ? (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    /可用|可预览/.test(f.badge)
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : /缺样本|无报告/.test(f.badge)
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  {f.badge}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-gray-600 mt-1 line-clamp-2">{f.desc}</div>
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-white/40 pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-900 truncate">{active?.title}</div>
          {currentUrl ? (
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-pink-700 hover:underline"
              title="打开原链接"
            >
              原链接
            </a>
          ) : null}
        </div>
        {renderPreview()}
      </div>
    </div>
  );
}
