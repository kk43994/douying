import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Copy, Check, RotateCcw, X } from 'lucide-react';
import { Button } from './Button';

interface ScriptResultProps {
  content: string;
  title?: string;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
  onClose?: () => void;
}

export const ScriptResult: React.FC<ScriptResultProps> = ({ content, title = '生成结果', onRegenerate, showRegenerate = true, onClose }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dy-glass-strong rounded-xl flex flex-col h-full overflow-hidden animate-fade-in">
      <div className="p-4 border-b border-white/40 flex items-center justify-between bg-white/35 backdrop-blur">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          {title}
        </h3>
        <div className="flex gap-2">
          {showRegenerate && onRegenerate && (
            <Button variant="secondary" size="sm" onClick={onRegenerate} icon={<RotateCcw size={16} />}>
              重新生成
            </Button>
          )}
          <Button 
            variant={copied ? "primary" : "secondary"} 
            size="sm" 
            onClick={handleCopy} 
            icon={copied ? <Check size={16} /> : <Copy size={16} />}
          >
            {copied ? '已复制!' : '复制'}
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} icon={<X size={16} />}>
              关闭
            </Button>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white/30 backdrop-blur">
        <article className="prose prose-pink prose-sm sm:prose-base max-w-none">
          <ReactMarkdown
            components={{
                table: ({node, ...props}) => (
                    <div className="overflow-x-auto my-4 rounded-lg border border-white/50 bg-white/40 backdrop-blur">
                        <table className="min-w-full divide-y divide-white/50" {...props} />
                    </div>
                ),
                thead: ({node, ...props}) => <thead className="bg-white/60" {...props} />,
                th: ({node, ...props}) => <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" {...props} />,
                td: ({node, ...props}) => <td className="px-6 py-4 whitespace-pre-wrap text-sm text-gray-600" {...props} />,
                h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-xl font-semibold text-gray-800 mt-6 mb-3" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1 text-gray-600" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-pink-200 pl-4 py-1 my-4 italic text-gray-700 bg-white/60 backdrop-blur rounded-r" {...props} />,
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
};
