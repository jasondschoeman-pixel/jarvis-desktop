// src/components/MemoryView.tsx
import { useState, useEffect } from 'react';
import { api } from '../api';
import type { MemoryInfo } from '../types';

export function MemoryView() {
  const [memory, setMemory] = useState<MemoryInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await api.getMemory();
        if (!mounted) return;
        setMemory(data);
        setError(null);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load memory');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading && !memory) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading memory...</p></div>;

  return (
    <div className="memory-view">
      <div className="memory-header">
        <h2>Memory</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      {/* Active Provider */}
      <section className="status-section">
        <h3>Active Provider</h3>
        <div className="memory-active-card">
          <span className="memory-active-name">{memory?.active || 'none'}</span>
          <span className="badge badge-green">Active</span>
        </div>
      </section>

      {/* Builtin Files */}
      {memory?.builtin_files && (
        <section className="status-section">
          <h3>Builtin Memory Files</h3>
          <div className="status-grid">
            <div className="status-card">
              <span className="status-label">memory.md</span>
              <span className="status-value">{memory.builtin_files.memory} chars</span>
            </div>
            <div className="status-card">
              <span className="status-label">user_profile.md</span>
              <span className="status-value">{memory.builtin_files.user} chars</span>
            </div>
          </div>
        </section>
      )}

      {/* All Providers */}
      <section className="status-section">
        <h3>All Providers ({memory?.providers?.length || 0})</h3>
        <div className="memory-providers">
          {memory?.providers?.map(p => (
            <div key={p.name} className={`memory-provider-card ${p.configured ? 'configured' : 'not-configured'} ${p.name === memory.active ? 'active' : ''}`}>
              <div className="memory-provider-header">
                <span className="memory-provider-name">{p.name}</span>
                <div className="memory-provider-badges">
                  {p.name === memory.active && <span className="badge badge-green">Active</span>}
                  {p.configured ? (
                    <span className="badge badge-blue">Configured</span>
                  ) : (
                    <span className="badge badge-gray">Not Configured</span>
                  )}
                </div>
              </div>
              <div className="memory-provider-desc">{p.description}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}