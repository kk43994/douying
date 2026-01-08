import React from 'react';
import { PenTool, History, Layout, Settings, Sparkles, BarChart2, User, Package } from 'lucide-react';
import { ViewState } from '../types';

interface SidebarProps {
  currentView: ViewState;
  onViewChange: (view: ViewState) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  const menuItems = [
    { id: 'generator', label: '脚本生成', icon: <PenTool size={20} /> },
    { id: 'analysis', label: 'AI 账号/视频分析', icon: <BarChart2 size={20} /> },
    { id: 'personas', label: '人设档案', icon: <User size={20} /> },
    { id: 'products', label: '我的产品', icon: <Package size={20} /> },
    { id: 'history', label: '历史记录', icon: <History size={20} /> },
    { id: 'templates', label: '爆款模板', icon: <Layout size={20} /> },
  ];

  return (
    <aside className="w-64 dy-glass border-r border-white/40 h-screen flex flex-col fixed left-0 top-0 z-10 hidden md:flex">
      <div className="p-6 flex items-center gap-3 border-b border-white/40">
        <div className="bg-pink-600 p-2 rounded-lg shadow-sm shadow-pink-200/40">
          <Sparkles className="text-white w-6 h-6" />
        </div>
        <span className="text-xl font-bold text-gray-800 tracking-tight">天雨学长AI编导</span>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id as ViewState)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              currentView === item.id
                ? 'bg-pink-50/70 text-pink-700'
                : 'text-gray-700 hover:bg-white/50 hover:text-gray-900'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/40 space-y-2">
        <button
          onClick={() => onViewChange('settings')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
            currentView === 'settings'
              ? 'bg-pink-50/70 text-pink-700'
              : 'text-gray-700 hover:bg-white/50 hover:text-gray-900'
          }`}
        >
          <Settings size={20} />
          设置
        </button>
      </div>
    </aside>
  );
};

export const MobileHeader: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
    return (
        <div className="md:hidden dy-glass-strong border-b border-white/40 p-4 flex items-center justify-between sticky top-0 z-20">
             <div className="flex items-center gap-2">
                <div className="bg-pink-600 p-1.5 rounded-lg shadow-sm shadow-pink-200/40">
                    <Sparkles className="text-white w-5 h-5" />
                </div>
                <span className="text-lg font-bold text-gray-800">天雨学长AI编导</span>
            </div>
            <div className="flex gap-3 overflow-x-auto">
                 <button onClick={() => onViewChange('generator')} className={currentView === 'generator' ? 'text-pink-600' : 'text-gray-500'}>
                    <PenTool size={22} />
                 </button>
                 <button onClick={() => onViewChange('analysis')} className={currentView === 'analysis' ? 'text-pink-600' : 'text-gray-500'}>
                    <BarChart2 size={22} />
                 </button>
                 <button onClick={() => onViewChange('personas')} className={currentView === 'personas' ? 'text-pink-600' : 'text-gray-500'}>
                    <User size={22} />
                 </button>
                 <button onClick={() => onViewChange('products')} className={currentView === 'products' ? 'text-pink-600' : 'text-gray-500'}>
                    <Package size={22} />
                 </button>
                 <button onClick={() => onViewChange('history')} className={currentView === 'history' ? 'text-pink-600' : 'text-gray-500'}>
                    <History size={22} />
                 </button>
                 <button onClick={() => onViewChange('settings')} className={currentView === 'settings' ? 'text-pink-600' : 'text-gray-500'}>
                    <Settings size={22} />
                 </button>
            </div>
        </div>
    )
}
