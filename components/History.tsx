import React, { useMemo, useState } from 'react';
import { Clock, ExternalLink, FileText, Trash2, User, Video } from 'lucide-react';
import { AnalysisResult, GeneratedScript } from '../types';
import { Button } from './Button';
import { Pagination } from './Pagination';
import { ScriptResult } from './ScriptResult';

interface HistoryProps {
  scripts: GeneratedScript[];
  analysisHistory: AnalysisResult[];
  onDeleteScript: (id: string) => void;
  onDeleteAnalysis: (id: string) => void;
  onClearScripts: () => void;
  onClearAnalysis: () => void;
}

const PAGE_SIZE = 10;

function extractMarkdownTitle(md: string): string | null {
  const match = md.match(/^#\\s+(.+)$/m);
  return match?.[1]?.trim() || null;
}

function previewText(md: string, maxLen: number): string {
  const cleaned = md
    .replace(/```[\\s\\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\\[[^\\]]*\\]\\([^)]*\\)/g, ' ')
    .replace(/\\[[^\\]]*\\]\\([^)]*\\)/g, ' ')
    .replace(/[>#*_~|-]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}...` : cleaned;
}

export const History: React.FC<HistoryProps> = ({
  scripts,
  analysisHistory,
  onDeleteScript,
  onDeleteAnalysis,
  onClearScripts,
  onClearAnalysis,
}) => {
  const [accountPage, setAccountPage] = useState(1);
  const [videoPage, setVideoPage] = useState(1);
  const [scriptPage, setScriptPage] = useState(1);

  const [selectedScript, setSelectedScript] = useState<GeneratedScript | null>(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisResult | null>(null);

  const accountItems = useMemo(
    () => [...analysisHistory].filter((h) => h.type === 'account').sort((a, b) => b.createdAt - a.createdAt),
    [analysisHistory]
  );
  const videoItems = useMemo(
    () => [...analysisHistory].filter((h) => h.type === 'video').sort((a, b) => b.createdAt - a.createdAt),
    [analysisHistory]
  );
  const scriptItems = useMemo(() => [...scripts].sort((a, b) => b.createdAt - a.createdAt), [scripts]);

  const accountTotalPages = Math.max(1, Math.ceil(accountItems.length / PAGE_SIZE));
  const videoTotalPages = Math.max(1, Math.ceil(videoItems.length / PAGE_SIZE));
  const scriptTotalPages = Math.max(1, Math.ceil(scriptItems.length / PAGE_SIZE));

  const safeAccountPage = Math.min(accountPage, accountTotalPages);
  const safeVideoPage = Math.min(videoPage, videoTotalPages);
  const safeScriptPage = Math.min(scriptPage, scriptTotalPages);

  const pagedAccounts = accountItems.slice((safeAccountPage - 1) * PAGE_SIZE, safeAccountPage * PAGE_SIZE);
  const pagedVideos = videoItems.slice((safeVideoPage - 1) * PAGE_SIZE, safeVideoPage * PAGE_SIZE);
  const pagedScripts = scriptItems.slice((safeScriptPage - 1) * PAGE_SIZE, safeScriptPage * PAGE_SIZE);

  const closeModal = () => {
    setSelectedScript(null);
    setSelectedAnalysis(null);
  };

  return (
    <div className="max-w-7xl mx-auto py-4 md:h-[calc(100vh-7.5rem)] px-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Clock className="text-pink-600" /> 历史记录
        </h2>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (confirm('确定清空全部「分析历史」吗？')) onClearAnalysis();
            }}
            disabled={analysisHistory.length === 0}
          >
            清空分析
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (confirm('确定清空全部「脚本历史」吗？')) onClearScripts();
            }}
            disabled={scripts.length === 0}
          >
            清空脚本
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Column 1: Recent Account Analysis */}
        <div className="md:col-span-1 md:h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">
          <div className="sticky top-0 z-10">
            <div className="text-base rounded px-4 py-2 font-semibold dy-glass flex items-center gap-2 text-gray-800">
              <User size={16} /> 最近分析的用户
            </div>
            <div className="bg-white/35 backdrop-blur border-x border-b border-white/40 rounded-b">
              <Pagination page={safeAccountPage} total={accountItems.length} pageSize={PAGE_SIZE} onPageChange={setAccountPage} />
            </div>
          </div>

          <div className="space-y-4">
            {pagedAccounts.length === 0 ? (
              <div className="text-center text-gray-400 py-10 text-sm">暂无记录</div>
            ) : (
              pagedAccounts.map((item) => (
                <div
                  key={item.id}
                  className="dy-glass rounded-lg hover:shadow-md transition-shadow group cursor-pointer"
                  onClick={() => setSelectedAnalysis(item)}
                >
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-pink-100/70 border border-white/60 flex items-center justify-center">
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-pink-700 text-sm font-bold">{item.title?.charAt(0) || 'U'}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{item.title}</h3>
                      <p className="text-xs text-gray-400">分析于：{new Date(item.createdAt).toLocaleString('zh-CN')}</p>
                      {item.stats && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          粉丝 {item.stats.followers ?? '-'} · 获赞 {item.stats.likes ?? '-'} · 作品 {item.stats.awemeCount ?? '-'} · IP{' '}
                          {item.stats.location ?? '未知'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-gray-400 hover:text-pink-600 p-1 rounded hover:bg-pink-50/70"
                        title="打开链接"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.url, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        <ExternalLink size={16} />
                      </button>
                      <button
                        className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50"
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteAnalysis(item.id);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="px-4 pb-4 text-xs text-gray-600 line-clamp-2">{previewText(item.content, 120)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: Recent Video Analysis */}
        <div className="md:col-span-1 md:h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">
          <div className="sticky top-0 z-10">
            <div className="text-base rounded px-4 py-2 font-semibold dy-glass flex items-center gap-2 text-gray-800">
              <Video size={16} /> 最近分析的单视频
            </div>
            <div className="bg-white/35 backdrop-blur border-x border-b border-white/40 rounded-b">
              <Pagination page={safeVideoPage} total={videoItems.length} pageSize={PAGE_SIZE} onPageChange={setVideoPage} />
            </div>
          </div>

          <div className="space-y-4">
            {pagedVideos.length === 0 ? (
              <div className="text-center text-gray-400 py-10 text-sm">暂无记录</div>
            ) : (
              pagedVideos.map((item) => (
                <div
                  key={item.id}
                  className="dy-glass rounded-lg hover:shadow-md transition-shadow group cursor-pointer"
                  onClick={() => setSelectedAnalysis(item)}
                >
                  <div className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex items-center justify-center">
                      {item.coverUrl ? (
                        <img src={item.coverUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-emerald-700 text-sm font-bold">{item.title?.charAt(0) || 'V'}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{item.title}</h3>
                      <p className="text-xs text-gray-400">分析于：{new Date(item.createdAt).toLocaleString('zh-CN')}</p>
                      {item.stats && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          赞 {item.stats.diggCount ?? '-'} · 评 {item.stats.commentCount ?? '-'} · 藏 {item.stats.collectCount ?? '-'} · 转{' '}
                          {item.stats.shareCount ?? '-'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-gray-400 hover:text-pink-600 p-1 rounded hover:bg-pink-50/70"
                        title="打开链接"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.url, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        <ExternalLink size={16} />
                      </button>
                      <button
                        className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50"
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteAnalysis(item.id);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="px-4 pb-4 text-xs text-gray-600 line-clamp-2">{previewText(item.content, 120)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Script Generations */}
        <div className="md:col-span-1 md:h-[calc(100vh-8rem)] overflow-y-auto custom-scrollbar">
          <div className="sticky top-0 z-10">
            <div className="text-base rounded px-4 py-2 font-semibold dy-glass flex items-center gap-2 text-gray-800">
              <FileText size={16} /> 文案历史记录
            </div>
            <div className="bg-white/35 backdrop-blur border-x border-b border-white/40 rounded-b">
              <Pagination page={safeScriptPage} total={scriptItems.length} pageSize={PAGE_SIZE} onPageChange={setScriptPage} />
            </div>
          </div>

          <div className="space-y-4">
            {pagedScripts.length === 0 ? (
              <div className="text-center text-gray-400 py-10 text-sm">暂无记录</div>
            ) : (
              pagedScripts.map((script) => {
                const title = extractMarkdownTitle(script.content) || script.title || '生成脚本';
                return (
                  <div key={script.id} className="dy-glass rounded-lg shadow hover:shadow-md transition-shadow group">
                    <button className="block w-full text-left p-4" onClick={() => setSelectedScript(script)}>
                      <h4 className="text-base font-semibold mb-2 line-clamp-2">{title}</h4>
                      <div className="mb-2 flex flex-wrap gap-1">
                        <span className="text-xs rounded px-2 py-1 bg-pink-600 text-white">{script.options.platform}</span>
                        <span className="text-xs rounded px-2 py-1 bg-slate-100 text-slate-700">{script.options.tone}</span>
                        <span className="text-xs rounded px-2 py-1 bg-slate-100 text-slate-700">{script.options.duration}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                        <span>生成于 {new Date(script.createdAt).toLocaleString('zh-CN')}</span>
                        <span>{script.options.language}</span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2 line-clamp-2">{script.options.topic}</p>
                      <div className="text-gray-600 text-sm line-clamp-3">{previewText(script.content, 180)}</div>
                    </button>
                    <div className="px-4 pb-4 flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteScript(script.id);
                        }}
                        className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {(selectedScript || selectedAnalysis) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={closeModal}>
          <div className="max-w-5xl w-full h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {selectedScript && (
              <ScriptResult
                title={extractMarkdownTitle(selectedScript.content) || '文案内容'}
                content={selectedScript.content}
                showRegenerate={false}
                onClose={closeModal}
              />
            )}
            {selectedAnalysis && (
              <ScriptResult
                title={`${selectedAnalysis.type === 'account' ? '账号分析' : '单视频分析'}：${selectedAnalysis.title}`}
                content={selectedAnalysis.content}
                showRegenerate={false}
                onClose={closeModal}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
