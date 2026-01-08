import React, { useEffect, useState } from 'react';
import { Sidebar, MobileHeader } from './components/Sidebar';
import { Generator } from './components/Generator';
import { History } from './components/History';
import { TemplateSelector } from './components/TemplateSelector';
import { AnalysisView } from './components/AnalysisView';
import { SettingsView } from './components/SettingsView';
import { PersonaView } from './components/PersonaView';
import { ProductView } from './components/ProductView';
import { AnalysisResult, AppSettings, GeneratedScript, ViewState, Persona, Product } from './types';
import { loadJson, saveJson } from './services/storage';
import { loadAppSettings, saveAppSettings } from './services/settings';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('generator');
  const [generatorPrefillTopic, setGeneratorPrefillTopic] = useState<string | null>(null);

  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [history, setHistory] = useState<GeneratedScript[]>(() => loadJson<GeneratedScript[]>('douscript_history', []));
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisResult[]>(() =>
    loadJson<AnalysisResult[]>('douscript_analysis_history', [])
  );
  const [personas, setPersonas] = useState<Persona[]>(() => loadJson<Persona[]>('douscript_personas', []));
  const [products, setProducts] = useState<Product[]>(() => loadJson<Product[]>('douscript_products', []));

  useEffect(() => {
    saveAppSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveJson('douscript_history', history);
  }, [history]);

  useEffect(() => {
    saveJson('douscript_analysis_history', analysisHistory);
  }, [analysisHistory]);

  useEffect(() => {
    saveJson('douscript_personas', personas);
  }, [personas]);

  useEffect(() => {
    saveJson('douscript_products', products);
  }, [products]);

  const handleSaveScript = (script: GeneratedScript) => {
    setHistory(prev => [script, ...prev]);
  };

  const handleDeleteScript = (id: string) => {
    setHistory(prev => prev.filter(s => s.id !== id));
  };

  const handleSaveAnalysis = (item: AnalysisResult) => {
    setAnalysisHistory(prev => {
      const filtered = prev.filter(h => !(h.type === item.type && h.url === item.url));
      return [item, ...filtered];
    });
  };

  const handleDeleteAnalysis = (id: string) => {
    setAnalysisHistory(prev => prev.filter(h => h.id !== id));
  };

  const handleSavePersona = (persona: Persona) => {
    setPersonas(prev => {
      const filtered = prev.filter(p => p.id !== persona.id);
      return [persona, ...filtered];
    });
  };

  const handleDeletePersona = (id: string) => {
    setPersonas(prev => prev.filter(p => p.id !== id));
  };

  const handleSaveProduct = (product: Product) => {
    setProducts(prev => {
      const filtered = prev.filter(p => p.id !== product.id);
      return [product, ...filtered];
    });
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const renderContent = () => {
    switch (currentView) {
      case 'generator':
        return (
          <Generator
            onSaveScript={handleSaveScript}
            settings={settings}
            onOpenSettings={() => setCurrentView('settings')}
            prefillTopic={generatorPrefillTopic}
            onPrefillConsumed={() => setGeneratorPrefillTopic(null)}
          />
        );
      case 'analysis':
        return (
          <AnalysisView
            settings={settings}
            history={analysisHistory}
            onSaveHistory={handleSaveAnalysis}
            onOpenSettings={() => setCurrentView('settings')}
            onCreateSimilar={(prefillTopic) => {
              setGeneratorPrefillTopic(prefillTopic);
              setCurrentView('generator');
            }}
            personas={personas}
            products={products}
          />
        );
      case 'history':
        return (
          <History
            scripts={history}
            analysisHistory={analysisHistory}
            onDeleteScript={handleDeleteScript}
            onDeleteAnalysis={handleDeleteAnalysis}
            onClearScripts={() => setHistory([])}
            onClearAnalysis={() => setAnalysisHistory([])}
          />
        );
      case 'templates':
        return <TemplateSelector />;
      case 'personas':
        return (
          <PersonaView
            personas={personas}
            onSave={handleSavePersona}
            onDelete={handleDeletePersona}
          />
        );
      case 'products':
        return (
          <ProductView
            products={products}
            onSave={handleSaveProduct}
            onDelete={handleDeleteProduct}
          />
        );
      case 'settings':
        return <SettingsView settings={settings} onChange={setSettings} />;
      default:
        return (
          <Generator
            onSaveScript={handleSaveScript}
            settings={settings}
            onOpenSettings={() => setCurrentView('settings')}
            prefillTopic={generatorPrefillTopic}
            onPrefillConsumed={() => setGeneratorPrefillTopic(null)}
          />
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-transparent">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      
      <div className="flex-1 md:ml-64 flex flex-col min-w-0">
        <MobileHeader currentView={currentView} onViewChange={setCurrentView} />
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;
