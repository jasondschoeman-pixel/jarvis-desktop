// src/components/ModelsView.tsx — Model switcher + catalog
import { useState, useEffect } from 'react';
import { api } from '../api';

export function ModelsView({ activeProfile }: { activeProfile: string }) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.getConfig().then(data => {
      setConfig(data);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading models...</p></div>;

  const currentModel = config?.model || '—';
  const catalog = config?.model_catalog || {};
  const providers = config?.providers || {};
  const customProviders = config?.custom_providers || [];
  const fallbacks = config?.fallback_providers || [];

  const q = search.toLowerCase();
  const customFiltered = customProviders.filter((p: any) => !q || p.name?.toLowerCase().includes(q));
  const fallbackFiltered = fallbacks.filter((p: any) => !q || p.model?.toLowerCase().includes(q) || p.provider?.toLowerCase().includes(q));

  return (
    <div className="models-view">
      <div className="models-header">
        <h2>🤖 Models</h2>
        <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="models-search" />
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="models-current">
        <h3>Current Configuration</h3>
        <div className="model-current-row">
          <span className="model-label">Active Model:</span>
          <span className="badge badge-purple">{currentModel}</span>
        </div>
        <div className="model-current-row">
          <span className="model-label">Profile:</span>
          <span className="badge badge-blue">{activeProfile}</span>
        </div>
      </div>

      <div className="models-section">
        <h3>Custom Providers ({customFiltered.length})</h3>
        <div className="models-grid">
          {customFiltered.map((p: any, i: number) => (
            <div key={i} className="model-card">
              <div className="model-card-name">{p.name}</div>
              <div className="model-card-url">{p.base_url}</div>
              {p.models && <div className="model-card-models">{p.models.join(', ')}</div>}
            </div>
          ))}
          {customFiltered.length === 0 && <div className="empty-state">No custom providers</div>}
        </div>
      </div>

      <div className="models-section">
        <h3>Fallback Chain ({fallbackFiltered.length})</h3>
        <div className="models-fallback-list">
          {fallbackFiltered.map((f: any, i: number) => (
            <div key={i} className="fallback-row">
              <span className="fallback-num">{i + 1}</span>
              <span className="fallback-provider">{f.provider}</span>
              <span className="badge badge-teal">{f.model}</span>
            </div>
          ))}
          {fallbackFiltered.length === 0 && <div className="empty-state">No fallbacks configured</div>}
        </div>
      </div>

      <div className="models-section">
        <h3>Model Catalog</h3>
        <div className="model-catalog-info">
          <div className="model-stat">Enabled: {catalog.enabled ? '✅' : '❌'}</div>
          <div className="model-stat">TTL: {catalog.ttl_hours}h</div>
          <div className="model-stat">URL: {catalog.url}</div>
        </div>
      </div>
    </div>
  );
}