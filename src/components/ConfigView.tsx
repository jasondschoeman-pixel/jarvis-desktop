// src/components/ConfigView.tsx
import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';

export function ConfigView() {
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await api.getConfig();
        if (!mounted) return;
        setConfig(data);
        // Expand first few sections by default
        const sections: Record<string, boolean> = {};
        Object.keys(data || {}).slice(0, 5).forEach(k => sections[k] = true);
        setExpandedSections(sections);
        setError(null);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load config');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const sections = useMemo(() => {
    if (!config) return [];
    const q = search.toLowerCase();
    return Object.keys(config)
      .filter(k => !q || k.toLowerCase().includes(q))
      .sort()
      .map(key => ({ key, value: config[key] }));
  }, [config, search]);

  function toggleSection(key: string) {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function renderValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') return `{${Object.keys(value).length} keys}`;
    return String(value);
  }

  function valueClass(value: any): string {
    if (value === null || value === undefined) return 'config-null';
    if (typeof value === 'boolean') return value ? 'config-bool-true' : 'config-bool-false';
    if (typeof value === 'number') return 'config-number';
    if (typeof value === 'string') return 'config-string';
    return 'config-other';
  }

  if (loading && !config) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading config...</p></div>;

  return (
    <div className="config-view">
      <div className="config-header">
        <h2>Config ({Object.keys(config || {}).length} keys)</h2>
        <input
          type="text"
          placeholder="Search config..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="config-search"
        />
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="config-sections">
        {sections.map(({ key, value }) => {
          const isExpanded = expandedSections[key];
          const hasNested = value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;

          return (
            <div key={key} className="config-section-item">
              <div
                className={`config-key-row ${hasNested ? 'expandable' : ''}`}
                onClick={() => hasNested && toggleSection(key)}
              >
                {hasNested && <span className="config-chevron">{isExpanded ? '▼' : '▶'}</span>}
                <span className="config-key">{key}</span>
                <span className={`config-value ${valueClass(value)}`}>
                  {hasNested ? `${Object.keys(value).length} keys` : renderValue(value)}
                </span>
              </div>

              {isExpanded && hasNested && (
                <div className="config-nested">
                  {Object.entries(value).map(([subKey, subValue]) => (
                    <div key={subKey} className="config-sub-row">
                      <span className="config-sub-key">{subKey}</span>
                      <span className={`config-value ${valueClass(subValue)}`}>{renderValue(subValue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}