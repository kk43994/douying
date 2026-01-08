import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

const LABELS = [
  '爆点',
  '最大短板',
  '最值得抄的点',
  '细分赛道',
  '核心观众',
  '停留/互动的主要原因',
  '互动数据现状',
  '互动结构判断',
  '最该优先提升的指标',
  '好在哪',
  '坏在哪',
  '立刻怎么改',

  '赛道定位',
  '产品/服务定位',
  '赛道热度',
  '差异化优势',
  '核心人群',
  '变种标签',
  '关注动机',
  '消费能力/购买意向',
  '人设定位',
  '人设标签',
  '信任背书',
  '人设SOP',
  '黄金公式',
  '开头Hook',
  '结尾CTA',
  '拍摄形式',
  '记忆点设计',
  '视觉符号',
  '内容形式',
  '主力产品线',
  '私域导流',
  '橱窗/直播',
  '内容升级',
  '产品迭代',
  '风险防范',
  '直接可执行的增流量动作',
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function boldKeyLabels(md: string): string {
  const labelGroup = LABELS.map(escapeRegExp).join('|');
  if (!labelGroup) return md;

  const listLabel = new RegExp(`(^|\\n)([-*]\\s*)(?!\\*\\*)(${labelGroup})(\\s*[：:])(\\s*)`, 'g');
  const lineLabel = new RegExp(`(^|\\n)(\\s*)(?![-*]\\s)(?!#+\\s)(?!\\*\\*)(${labelGroup})(\\s*[：:])(\\s*)`, 'g');

  const transformPlain = (text: string) =>
    text
      .replace(listLabel, (_m, p1, p2, p3, p4, p5) => `${p1}${p2}**${p3}${p4}**${p5}`)
      .replace(lineLabel, (_m, p1, p2, p3, p4, p5) => `${p1}${p2}**${p3}${p4}**${p5}`);

  const fence = /```[\s\S]*?```/g;
  let out = '';
  let last = 0;
  for (const m of md.matchAll(fence)) {
    const start = m.index ?? 0;
    out += transformPlain(md.slice(last, start));
    out += m[0];
    last = start + m[0].length;
  }
  out += transformPlain(md.slice(last));
  return out;
}

export function ReportMarkdown(props: { content: string; compact?: boolean }) {
  const { content, compact } = props;

  const enhanced = useMemo(() => boldKeyLabels(content || ''), [content]);

  const h1 = compact ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl';
  const h2 = compact ? 'text-lg md:text-xl' : 'text-xl md:text-2xl';
  const h3 = compact ? 'text-base md:text-lg' : 'text-lg md:text-xl';
  const p = compact ? 'text-sm leading-6' : 'text-base leading-7';
  const li = compact ? 'text-sm leading-6' : 'text-base leading-7';

  return (
    <div className="text-gray-800">
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => (
            <h1 className={`${h1} font-extrabold text-gray-900 mb-4 pb-2 border-b border-white/40`} {...props} />
          ),
          h2: ({ node, ...props }) => <h2 className={`${h2} font-bold text-gray-900 mt-6 mb-3`} {...props} />,
          h3: ({ node, ...props }) => <h3 className={`${h3} font-bold text-gray-900 mt-5 mb-2`} {...props} />,
          p: ({ node, ...props }) => <p className={`${p} text-gray-800 mb-3`} {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-3 space-y-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-3 space-y-2" {...props} />,
          li: ({ node, ...props }) => <li className={`${li} text-gray-800`} {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold text-gray-900" {...props} />,
          em: ({ node, ...props }) => <em className="italic text-gray-700" {...props} />,
          a: ({ node, ...props }) => (
            <a className="text-pink-700 underline decoration-pink-300 underline-offset-4 hover:decoration-pink-500" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-pink-200 pl-4 py-2 my-4 text-gray-700 bg-white/55 backdrop-blur rounded-r"
              {...props}
            />
          ),
          hr: ({ node, ...props }) => <hr className="my-6 border-white/50" {...props} />,
          code: ({ node, inline, className, children, ...props }) => {
            if (inline) {
              return (
                <code
                  className="px-1 py-0.5 rounded border border-white/60 bg-white/70 text-pink-700 text-[0.92em]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={`block ${className || ''}`} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node, ...props }) => (
            <pre className="my-4 p-4 rounded-lg border border-white/60 bg-white/55 backdrop-blur overflow-x-auto text-sm" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-white/60 bg-white/45 backdrop-blur">
              <table className="min-w-full divide-y divide-white/50" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-white/60" {...props} />,
          th: ({ node, ...props }) => (
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider" {...props} />
          ),
          td: ({ node, ...props }) => <td className="px-4 py-2 whitespace-pre-wrap text-sm text-gray-700" {...props} />,
        }}
      >
        {enhanced}
      </ReactMarkdown>
    </div>
  );
}

