// src/components/StatusView.tsx
import { useState, useEffect } from 'react';
import { api } from '../api';
import type { StatusInfo, SessionStats } from '../types';

export function StatusView() {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [s, st] = await Promise.all([api.getStatus(), api.getSessionStats()]);
        if (!mounted) return;
        setStatus(s);
        setStats(st);
        setError(null);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load status');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  if (loading && !status) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading status...</p></div>;

  return (
    <div className="status-view">
      <div className="status-header">
        <h2>System Status</h2>
        {loading && <span className="refresh-indicator">↻</span>}
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      {/* Gateway */}
      <section className="status-section">
        <h3>Gateway</h3>
        <div className="status-grid">
          <div className="status-card">
            <span className="status-label">State</span>
            <span className={`status-value ${status?.gateway_running ? 'text-green' : 'text-red'}`}>
              {status?.gateway_running ? '🟢 Running' : '🔴 Stopped'}
            </span>
          </div>
          <div className="status-card">
            <span className="status-label">Version</span>
            <span className="status-value">{status?.version || 'unknown'}</span>
          </div>
          <div className="status-card">
            <span className="status-label">Active Agents</span>
            <span className="status-value">{status?.active_agents ?? 0}</span>
          </div>
          <div className="status-card">
            <span className="status-label">Active Sessions</span>
            <span className="status-value">{status?.active_sessions ?? 0}</span>
          </div>
          <div className="status-card">
            <span className="status-label">Gateway Busy</span>
            <span className={`status-value ${status?.gateway_busy ? 'text-yellow' : 'text-green'}`}>
              {status?.gateway_busy ? '⚠️ Yes' : '✅ No'}
            </span>
          </div>
          {status?.can_update_hermes && (
            <div className="status-card highlight">
              <span className="status-label">Update Available</span>
              <span className="status-value text-yellow">⬆ Yes</span>
            </div>
          )}
        </div>
      </section>

      {/* Platforms */}
      <section className="status-section">
        <h3>Platforms</h3>
        <div className="platform-grid">
          {Object.entries(status?.gateway_platforms || {}).map(([name, p]) => (
            <div key={name} className={`platform-card ${p.state}`}>
              <div className="platform-card-header">
                <span className="platform-name">{name}</span>
                <span className={`platform-state ${p.state}`}>{p.state}</span>
              </div>
              {p.error_message && <div className="platform-error">{p.error_message}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Session Stats */}
      {stats && (
        <section className="status-section">
          <h3>Sessions</h3>
          <div className="status-grid">
            <div className="status-card">
              <span className="status-label">Total</span>
              <span className="status-value">{stats.total}</span>
            </div>
            <div className="status-card">
              <span className="status-label">Messages</span>
              <span className="status-value">{stats.messages}</span>
            </div>
            <div className="status-card">
              <span className="status-label">Archived</span>
              <span className="status-value">{stats.archived}</span>
            </div>
          </div>
          {Object.keys(stats.by_source || {}).length > 0 && (
            <div className="source-breakdown">
              <h4>By Source</h4>
              <div className="source-list">
                {Object.entries(stats.by_source).map(([source, count]) => (
                  <div key={source} className="source-row">
                    <span className="source-name">{source}</span>
                    <span className="source-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}