// src/components/SpendView.tsx — AI Spend & token usage tracker
import { useState, useEffect } from 'react';
import { api } from '../api';

export function SpendView() {
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [sessionStats, healthData] = await Promise.all([
          api.getSessionStats(),
          api.jarvis.jobs?.request('GET', '/health/detailed').catch(() => null),
        ]);
        setStats(sessionStats);
        setHealth(healthData);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading spend data...</p></div>;

  const totalSessions = stats?.total || 0;
  const totalMessages = stats?.messages || 0;
  const bySource = stats?.by_source || {};

  return (
    <div className="spend-view">
      <div className="spend-header">
        <h2>💰 AI Spend & Usage</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="spend-grid">
        <div className="spend-card">
          <div className="spend-card-value">{totalSessions}</div>
          <div className="spend-card-label">Total Sessions</div>
        </div>
        <div className="spend-card">
          <div className="spend-card-value">{totalMessages}</div>
          <div className="spend-card-label">Total Messages</div>
        </div>
        <div className="spend-card">
          <div className="spend-card-value">{health?.active_agents || 0}</div>
          <div className="spend-card-label">Active Agents</div>
        </div>
        <div className="spend-card">
          <div className="spend-card-value">{health?.gateway_state === 'running' ? '🟢' : '🔴'}</div>
          <div className="spend-card-label">Gateway</div>
        </div>
      </div>

      <div className="spend-section">
        <h3>Sessions by Source</h3>
        <div className="spend-bars">
          {Object.entries(bySource).map(([source, count]) => {
            const pct = totalSessions > 0 ? ((count as number) / totalSessions * 100).toFixed(1) : '0';
            return (
              <div key={source} className="spend-bar-row">
                <span className="spend-bar-label">{source}</span>
                <div className="spend-bar-track">
                  <div className="spend-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="spend-bar-count">{count as number}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="spend-section">
        <h3>Provider Info</h3>
        <div className="spend-provider-info">
          <p>📊 Detailed token/cost tracking requires the Hermes API server's insights endpoint, which is not available on the current dashboard.</p>
          <p>💡 To get per-model cost breakdowns, enable token analytics in dashboard config: <code>show_token_analytics: true</code></p>
        </div>
      </div>
    </div>
  );
}