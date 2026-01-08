import React, { useState } from 'react';
import { Product } from '../types';
import { Button } from './Button';
import { Plus, Edit2, Trash2, Package, Tag, Target, Zap, DollarSign, Save, X, AlertCircle } from 'lucide-react';

interface ProductViewProps {
  products: Product[];
  onSave: (product: Product) => void;
  onDelete: (id: string) => void;
}

const EMPTY_PRODUCT: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  image: '',
  category: '',
  description: '',
  features: [],
  price: '',
  targetAudience: '',
  painPoints: [],
};

export const ProductView: React.FC<ProductViewProps> = ({ products, onSave, onDelete }) => {
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState(EMPTY_PRODUCT);
  const [featureInput, setFeatureInput] = useState('');
  const [painPointInput, setPainPointInput] = useState('');

  const handleNew = () => {
    setEditingProduct(null);
    setFormData(EMPTY_PRODUCT);
    setFeatureInput('');
    setPainPointInput('');
    setMode('edit');
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      image: product.image || '',
      category: product.category,
      description: product.description,
      features: product.features,
      price: product.price || '',
      targetAudience: product.targetAudience,
      painPoints: product.painPoints,
    });
    setFeatureInput('');
    setPainPointInput('');
    setMode('edit');
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      alert('请填写产品名称');
      return;
    }

    const now = Date.now();
    const product: Product = {
      id: editingProduct?.id || now.toString(),
      ...formData,
      createdAt: editingProduct?.createdAt || now,
      updatedAt: now,
    };
    onSave(product);
    setMode('list');
  };

  const handleAddFeature = () => {
    if (featureInput.trim() && !formData.features.includes(featureInput.trim())) {
      setFormData({ ...formData, features: [...formData.features, featureInput.trim()] });
      setFeatureInput('');
    }
  };

  const handleRemoveFeature = (feature: string) => {
    setFormData({ ...formData, features: formData.features.filter(f => f !== feature) });
  };

  const handleAddPainPoint = () => {
    if (painPointInput.trim() && !formData.painPoints.includes(painPointInput.trim())) {
      setFormData({ ...formData, painPoints: [...formData.painPoints, painPointInput.trim()] });
      setPainPointInput('');
    }
  };

  const handleRemovePainPoint = (painPoint: string) => {
    setFormData({ ...formData, painPoints: formData.painPoints.filter(p => p !== painPoint) });
  };

  const renderList = () => (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <Package className="text-green-600" size={28} />
            我的产品
          </h2>
          <p className="text-gray-500 mt-1">管理你的产品信息，让AI更好地为你带货种草</p>
        </div>
        <Button onClick={handleNew} icon={<Plus size={18} />}>
          添加产品
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="dy-glass rounded-xl p-12 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="text-gray-400" size={40} />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">还没有添加产品</h3>
          <p className="text-gray-500 mb-6">添加产品信息后，AI可以帮你生成更精准的带货文案</p>
          <Button onClick={handleNew} icon={<Plus size={18} />}>
            添加第一个产品
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map(product => (
            <div key={product.id} className="dy-glass rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-40 bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <Package className="text-green-300" size={48} />
                )}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 truncate flex-1">{product.name}</h3>
                  {product.price && (
                    <span className="text-green-600 font-medium text-sm ml-2">{product.price}</span>
                  )}
                </div>
                {product.category && (
                  <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full mb-2">
                    {product.category}
                  </span>
                )}
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{product.description || '暂无描述'}</p>

                {product.features.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {product.features.slice(0, 3).map((f, i) => (
                      <span key={i} className="px-2 py-0.5 bg-green-50 text-green-600 text-xs rounded-full">
                        {f}
                      </span>
                    ))}
                    {product.features.length > 3 && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">
                        +{product.features.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-4 border-t border-white/40">
                  <Button variant="secondary" className="flex-1 text-sm" onClick={() => handleEdit(product)} icon={<Edit2 size={14} />}>
                    编辑
                  </Button>
                  <Button
                    variant="secondary"
                    className="text-sm text-red-600 hover:bg-red-50"
                    onClick={() => {
                      if (confirm('确定删除这个产品吗？')) {
                        onDelete(product.id);
                      }
                    }}
                    icon={<Trash2 size={14} />}
                  >
                    删除
                  </Button>
                </div>
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
          className="text-gray-500 hover:text-green-600 transition-colors"
        >
          <X size={24} />
        </button>
        <h2 className="text-2xl font-bold text-gray-900">
          {editingProduct ? '编辑产品' : '添加产品'}
        </h2>
      </div>

      <div className="dy-glass-strong rounded-xl p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Package size={16} className="text-green-600" /> 产品名称 *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="例如：显瘦神裤、美白精华"
              className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Tag size={16} className="text-green-600" /> 产品类别
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="例如：服装、护肤品、数码"
              className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <DollarSign size={16} className="text-green-600" /> 价格
            </label>
            <input
              type="text"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="例如：¥199、99-299元"
              className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Target size={16} className="text-green-600" /> 目标人群
            </label>
            <input
              type="text"
              value={formData.targetAudience}
              onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
              placeholder="例如：25-35岁职场女性"
              className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">产品图片URL（可选）</label>
          <input
            type="text"
            value={formData.image}
            onChange={(e) => setFormData({ ...formData, image: e.target.value })}
            placeholder="https://..."
            className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">产品描述</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="详细描述产品的特点、用途、优势..."
            rows={3}
            className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Zap size={16} className="text-green-600" /> 产品卖点
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={featureInput}
              onChange={(e) => setFeatureInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddFeature())}
              placeholder="输入卖点后按回车添加"
              className="flex-1 p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            <Button variant="secondary" onClick={handleAddFeature}>添加</Button>
          </div>
          {formData.features.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.features.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-600 rounded-full text-sm">
                  {f}
                  <button onClick={() => handleRemoveFeature(f)} className="hover:text-green-800">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <AlertCircle size={16} className="text-orange-500" /> 解决的痛点
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={painPointInput}
              onChange={(e) => setPainPointInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddPainPoint())}
              placeholder="输入痛点后按回车添加"
              className="flex-1 p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            <Button variant="secondary" onClick={handleAddPainPoint}>添加</Button>
          </div>
          {formData.painPoints.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {formData.painPoints.map((p, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-sm">
                  {p}
                  <button onClick={() => handleRemovePainPoint(p)} className="hover:text-orange-800">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-4 pt-6 border-t border-gray-200">
          <Button onClick={handleSave} icon={<Save size={18} />} className="flex-1 bg-green-600 hover:bg-green-700">
            保存产品
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
