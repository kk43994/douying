import React, { useState } from 'react';
import { Persona } from '../types';
import { Button } from './Button';
import { Plus, Edit2, Trash2, User, Tag, Target, MessageSquare, Palette, Save, X } from 'lucide-react';

interface PersonaViewProps {
  personas: Persona[];
  onSave: (persona: Persona) => void;
  onDelete: (id: string) => void;
}

const EMPTY_PERSONA: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  avatar: '',
  description: '',
  tone: '',
  targetAudience: '',
  contentStyle: '',
  keywords: [],
};

export const PersonaView: React.FC<PersonaViewProps> = ({ personas, onSave, onDelete }) => {
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [formData, setFormData] = useState(EMPTY_PERSONA);
  const [keywordInput, setKeywordInput] = useState('');

  const handleNew = () => {
    setEditingPersona(null);
    setFormData(EMPTY_PERSONA);
    setKeywordInput('');
    setMode('edit');
  };

  const handleEdit = (persona: Persona) => {
    setEditingPersona(persona);
    setFormData({
      name: persona.name,
      avatar: persona.avatar || '',
      description: persona.description,
      tone: persona.tone,
      targetAudience: persona.targetAudience,
      contentStyle: persona.contentStyle,
      keywords: persona.keywords,
    });
    setKeywordInput('');
    setMode('edit');
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('请填写人设名称');
      return;
    }

    const now = Date.now();
    const persona: Persona = {
      id: editingPersona?.id || now.toString(),
      ...formData,
      createdAt: editingPersona?.createdAt || now,
      updatedAt: now,
    };
    onSave(persona);
    setMode('list');
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !formData.keywords.includes(keywordInput.trim())) {
      setFormData({ ...formData, keywords: [...formData.keywords, keywordInput.trim()] });
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setFormData({ ...formData, keywords: formData.keywords.filter(k => k !== keyword) });
  };

  const renderList = () => (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <User className="text-pink-600" size={28} />
            人设档案
          </h2>
          <p className="text-gray-500 mt-1">管理你的内容创作人设，让AI更懂你的风格</p>
        </div>
        <Button onClick={handleNew} icon={<Plus size={18} />}>
          新建人设
        </Button>
      </div>

      {personas.length === 0 ? (
        <div className="dy-glass rounded-xl p-12 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="text-gray-400" size={40} />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">还没有人设档案</h3>
          <p className="text-gray-500 mb-6">创建人设档案，让AI生成的文案更符合你的风格</p>
          <Button onClick={handleNew} icon={<Plus size={18} />}>
            创建第一个人设
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {personas.map(persona => (
            <div key={persona.id} className="dy-glass rounded-xl p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0 shadow-sm shadow-pink-200/40">
                  {persona.avatar ? (
                    <img src={persona.avatar} alt={persona.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    persona.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{persona.name}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">{persona.description || '暂无描述'}</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <MessageSquare size={14} className="text-pink-500" />
                  <span className="truncate">风格：{persona.tone || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Target size={14} className="text-green-500" />
                  <span className="truncate">受众：{persona.targetAudience || '-'}</span>
                </div>
              </div>

              {persona.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {persona.keywords.slice(0, 4).map((kw, i) => (
                    <span key={i} className="px-2 py-0.5 bg-pink-50/70 text-pink-700 text-xs rounded-full">
                      {kw}
                    </span>
                  ))}
                  {persona.keywords.length > 4 && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                      +{persona.keywords.length - 4}
                    </span>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-white/40">
                <Button variant="secondary" className="flex-1 text-sm" onClick={() => handleEdit(persona)} icon={<Edit2 size={14} />}>
                  编辑
                </Button>
                <Button
                  variant="secondary"
                  className="text-sm text-red-600 hover:bg-red-50"
                  onClick={() => {
                    if (confirm('确定删除这个人设档案吗？')) {
                      onDelete(persona.id);
                    }
                  }}
                  icon={<Trash2 size={14} />}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderEdit = () => (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => setMode('list')}
          className="text-gray-500 hover:text-pink-600 transition-colors"
        >
          <X size={24} />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">
          {editingPersona ? '编辑人设档案' : '新建人设档案'}
        </h2>
      </div>

      <div className="dy-glass-strong rounded-xl p-8 space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <User size={16} className="text-pink-600" /> 人设名称 *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="例如：励志创业女孩、专业测评博主"
            className="w-full p-3 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">头像URL（可选）</label>
          <input
            type="text"
            value={formData.avatar}
            onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
            placeholder="https://..."
            className="w-full p-3 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <MessageSquare size={16} className="text-pink-600" /> 人设描述
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="详细描述这个人设的背景、经历、特点..."
            rows={3}
            className="w-full p-3 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Palette size={16} className="text-pink-600" /> 说话风格/语气
          </label>
          <input
            type="text"
            value={formData.tone}
            onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
            placeholder="例如：真诚温暖、幽默犀利、专业严谨"
            className="w-full p-3 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Target size={16} className="text-pink-600" /> 目标受众
          </label>
          <input
            type="text"
            value={formData.targetAudience}
            onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
            placeholder="例如：20-35岁女性、创业者、宝妈群体"
            className="w-full p-3 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">内容风格</label>
          <input
            type="text"
            value={formData.contentStyle}
            onChange={(e) => setFormData({ ...formData, contentStyle: e.target.value })}
            placeholder="例如：励志故事、干货分享、生活vlog"
            className="w-full p-3 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Tag size={16} className="text-pink-600" /> 关键词标签
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddKeyword())}
              placeholder="输入关键词后按回车添加"
              className="flex-1 p-3 rounded-lg border border-gray-300 bg-white/70 backdrop-blur focus:ring-2 focus:ring-pink-500 focus:border-pink-500 outline-none"
            />
            <Button variant="secondary" onClick={handleAddKeyword}>添加</Button>
          </div>
          {formData.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.keywords.map((kw, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-pink-50/70 text-pink-700 rounded-full text-sm">
                  {kw}
                  <button onClick={() => handleRemoveKeyword(kw)} className="hover:text-pink-800">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-4 pt-6 border-t border-white/40">
          <Button onClick={handleSave} icon={<Save size={18} />} className="flex-1">
            保存人设
          </Button>
          <Button variant="secondary" onClick={() => setMode('list')} className="flex-1">
            取消
          </Button>
        </div>
      </div>
    </div>
  );

  return mode === 'edit' ? renderEdit() : renderList();
};
