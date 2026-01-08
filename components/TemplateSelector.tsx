import React from 'react';
import { Layout, ShoppingBag, BookOpen, Film, PartyPopper, Briefcase } from 'lucide-react';

export const TemplateSelector: React.FC = () => {
    const templates = [
        { title: "好物种草", icon: <ShoppingBag className="w-6 h-6 text-pink-500"/>, desc: "突出产品核心卖点，提高转化率。", color: "bg-pink-50" },
        { title: "干货/教程", icon: <BookOpen className="w-6 h-6 text-blue-500"/>, desc: "手把手教学步骤，提供价值感。", color: "bg-blue-50" },
        { title: "故事/Vlog", icon: <Film className="w-6 h-6 text-purple-500"/>, desc: "个人叙事风格，建立情感共鸣。", color: "bg-purple-50" },
        { title: "活动预热", icon: <PartyPopper className="w-6 h-6 text-yellow-500"/>, desc: "为即将到来的活动制造期待感。", color: "bg-yellow-50" },
        { title: "企业动态", icon: <Briefcase className="w-6 h-6 text-gray-600"/>, desc: "专业正式的公司新闻发布格式。", color: "bg-gray-100" },
    ];

    return (
        <div className="max-w-5xl mx-auto p-6 md:p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">脚本模板</h2>
            <p className="text-gray-500 mb-8">使用预设结构快速开始创作常见类型的视频。</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((tpl, idx) => (
                    <div key={idx} className="dy-glass rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer group hover:-translate-y-1">
                        <div className={`w-12 h-12 rounded-lg ${tpl.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                            {tpl.icon}
                        </div>
                        <h3 className="font-semibold text-gray-900 mb-2">{tpl.title}</h3>
                        <p className="text-sm text-gray-500">{tpl.desc}</p>
                        <div className="mt-4 pt-4 border-t border-white/40 flex justify-end">
                             <span className="text-pink-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">使用模板 &rarr;</span>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-12 p-8 bg-gradient-to-r from-pink-500 to-fuchsia-600 rounded-2xl text-white text-center shadow-lg shadow-pink-200/40">
                <h3 className="text-2xl font-bold mb-2">更多模板即将推出</h3>
                <p className="text-pink-100">我们正在持续分析全网爆款趋势，为您添加更多结构。</p>
            </div>
        </div>
    )
}
