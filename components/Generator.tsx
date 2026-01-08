import React, { useEffect, useState } from 'react';
import { Wand2, Youtube, Video, Hash } from 'lucide-react';
import { AppSettings, GeneratedScript, PlatformType, ScriptOptions, ScriptTone } from '../types';
import { generateVideoScript } from '../services/aiService';
import { Button } from './Button';
import { ScriptResult } from './ScriptResult';

interface GeneratorProps {
  onSaveScript: (script: GeneratedScript) => void;
  settings: AppSettings;
  onOpenSettings?: () => void;
  prefillTopic?: string | null;
  onPrefillConsumed?: () => void;
}

export const Generator: React.FC<GeneratorProps> = ({ onSaveScript, settings, onOpenSettings, prefillTopic, onPrefillConsumed }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  
  const [options, setOptions] = useState<ScriptOptions>({
    topic: '',
    tone: ScriptTone.PROFESSIONAL,
    platform: PlatformType.DOUYIN,
    duration: '30-60 秒',
    language: '中文',
  });

  useEffect(() => {
    if (prefillTopic && prefillTopic.trim()) {
      setOptions((prev) => ({ ...prev, topic: prefillTopic }));
      onPrefillConsumed?.();
    }
  }, [prefillTopic, onPrefillConsumed]);

  const handleGenerate = async () => {
    if (!options.topic.trim()) return;
    if (!settings.apiKey.trim()) {
      alert('请先在「设置」中配置 API Key。');
      onOpenSettings?.();
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const generatedContent = await generateVideoScript(options, settings);
      setResult(generatedContent);
      
      // Auto save to history
      const newScript: GeneratedScript = {
        id: Date.now().toString(),
        title: options.topic.slice(0, 50) + (options.topic.length > 50 ? '...' : ''),
        content: generatedContent,
        createdAt: Date.now(),
        options: { ...options }
      };
      onSaveScript(newScript);

    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : '脚本生成失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const platformIcons = {
    [PlatformType.DOUYIN]: <Video size={18} />,
    [PlatformType.REDNOTE]: <Hash size={18} />,
    [PlatformType.YOUTUBE_SHORTS]: <Youtube size={18} />,
  };

  return (
    <div className="h-[calc(100vh-80px)] md:h-screen flex flex-col md:flex-row gap-6 p-4 md:p-8 max-w-7xl mx-auto">
      
      {/* LEFT: Input Section */}
      <div className={`flex-1 flex flex-col gap-6 transition-all duration-300 ${result ? 'md:max-w-md' : 'max-w-2xl mx-auto w-full'}`}>
        <div className="dy-glass-strong rounded-xl p-6 md:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">创作新脚本</h1>
            <p className="text-gray-500">输入您的主题，AI 将为您构建爆款短视频结构。</p>
          </div>

          <div className="space-y-6">
            
            {/* Topic Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                视频主题是什么？
              </label>
              <textarea
                className="w-full h-32 p-4 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:border-pink-500 resize-none transition-shadow outline-none"
                placeholder="例如：东京 5 家隐藏咖啡馆，或者 新手如何制作酸种面包..."
                value={options.topic}
                onChange={(e) => setOptions({ ...options, topic: e.target.value })}
              />
            </div>

            {/* Platform Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">发布平台</label>
              <div className="grid grid-cols-3 gap-3">
                {Object.values(PlatformType).map((platform) => (
                  <button
                    key={platform}
                    onClick={() => setOptions({ ...options, platform })}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${
                      options.platform === platform
                        ? 'bg-pink-50/70 border-pink-500 text-pink-700 ring-1 ring-pink-500'
                        : 'bg-white/60 border-white/50 text-gray-700 hover:bg-white/70 hover:border-white/70'
                    }`}
                  >
                    <span className="mb-2 text-pink-600">{platformIcons[platform]}</span>
                    <span className="text-xs font-medium text-center">{platform}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tone & Language Row */}
            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">视频风格</label>
                <select
                  className="w-full p-2.5 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  value={options.tone}
                  onChange={(e) => setOptions({ ...options, tone: e.target.value as ScriptTone })}
                >
                  {Object.values(ScriptTone).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">输出语言</label>
                <select
                  className="w-full p-2.5 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:outline-none"
                  value={options.language}
                  onChange={(e) => setOptions({ ...options, language: e.target.value })}
                >
                  <option value="中文">中文</option>
                  <option value="English">English</option>
                  <option value="Japanese">日本語</option>
                  <option value="Spanish">Español</option>
                </select>
              </div>
            </div>

             {/* Duration Selection (Simple Tags) */}
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">目标时长</label>
                <div className="flex flex-wrap gap-2">
                    {['15 秒', '30-60 秒', '2 分钟', '长视频'].map((dur) => (
                        <button
                            key={dur}
                            onClick={() => setOptions({...options, duration: dur})}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                options.duration === dur 
                                ? 'bg-pink-100/70 border-pink-200 text-pink-800'
                                : 'bg-white/60 border-white/50 text-gray-700 hover:bg-white/75'
                            }`}
                        >
                            {dur}
                        </button>
                    ))}
                </div>
             </div>

            <Button 
              className="w-full py-3 text-lg shadow-pink-200/50" 
              onClick={handleGenerate} 
              isLoading={loading}
              disabled={!options.topic.trim()}
              icon={<Wand2 size={20} />}
            >
              立即生成脚本
            </Button>

          </div>
        </div>
      </div>

      {/* RIGHT: Output Section */}
      {result && (
        <div className="flex-1 min-h-[500px] animate-fade-in-up">
           <ScriptResult content={result} onRegenerate={handleGenerate} />
        </div>
      )}
      
      {!result && !loading && (
          <div className="hidden md:flex flex-1 items-center justify-center border-2 border-dashed border-white/50 rounded-xl bg-white/40 backdrop-blur text-gray-500">
              <div className="text-center">
                  <Wand2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>AI 生成的脚本将显示在这里</p>
              </div>
          </div>
      )}

       {/* Mobile loading placeholder */}
       {loading && !result && (
         <div className="md:hidden flex-1 min-h-[200px] flex items-center justify-center bg-white/50 backdrop-blur rounded-xl border border-white/50">
             <div className="text-center text-pink-700">
                 <div className="animate-spin mb-2 mx-auto w-6 h-6 border-2 border-current border-t-transparent rounded-full"></div>
                 <p className="text-sm">正在撰写...</p>
             </div>
         </div>
       )}

    </div>
  );
};
