// src/components/TokenBudgetView.tsx — Token budget manager
import { useState, useEffect } from 'react';
import { api } from '../api';

export function TokenBudgetView() {
  const [config, setConfig] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getConfig(), api.getSessionStats()])
      .then(([c, s]) => { setConfig(c); setStats(s); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading...</p></div>;

  const maxSessions = config?.max_concurrent_sessions;
  const maxLive = config?.max_live_sessions;
  const toolLoop = config?.tool_loop_guardrails;
  const compression = config?.compression;

  return (
    <div className="budget-view">
      <div className="budget-header">
        <h2>⚡ Token Budget & Limits</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="budget-grid">
        <div className="budget-card">
          <div className="budget-card-value">{maxLive ?? '—'}</div>
          <div className="budget-card-label">Max Live Sessions</div>
        </div>
        <div className="budget-card">
          <div className="budget-card-value">{maxSessions ?? '∞'}</div>
          <div className="budget-card-label">Max Concurrent Sessions</div>
        </div>
        <div className="budget-card">
          <div className="budget-card-value">{stats?.total ?? 0}</div>
          <div className="budget-card-label">Total Sessions</div>
        </div>
        <div className="budget-card">
          <div className="budget-card-value">{stats?.messages ?? 0}</div>
          <div className="budget-card-label">Total Messages</div>
        </div>
      </div>

      <div className="budget-section">
        <h3>Compression Settings</h3>
        <div className="budget-row"><label>Enabled:</label><span>{compression?.enabled ? '✅' : '❌'}</span></div>
        <div className="budget-row"><label>Threshold:</label><span>{compression?.threshold ?? '—'} messages</span></div>
        <div className="budget-row"><label>Target Ratio:</label><span>{compression?.target_ratio ?? '—'}</span></div>
        <div className="budget-row"><label>Protect Last N:</label><span>{compression?.protect_last_n ?? '—'}</span></div>
        <div className="budget-row"><label>Hard Limit:</label><span>{compression?.hygiene_hard_message_limit ?? '—'}</span></div>
      </div>

      <div className="budget-section">
        <h3>Tool Loop Guardrails</h3>
        <div className="budget-row"><label>Warnings:</label><span>{toolLoop?.warnings_enabled ? '✅' : '❌'} (after {toolLoop?.warn_after ?? '—'} calls)</span></div>
        <div className="budget-row"><label>Hard Stop:</label><span>{toolLoop?.hard_stop_enabled ? '✅' : '❌'} (after {toolLoop?.hard_stop_after ?? '—'} calls)</span></div>
      </div>

      <div className="budget-section">
        <h3>Tool Output Limits</h3>
        <div className="budget-row"><label>Max Bytes:</label><span>{config?.tool_output?.max_bytes ?? '—'}</span></div>
        <div className="budget-row"><label>Max Lines:</label><span>{config?.tool_output?.max_lines ?? '—'}</span></div>
        <div className="budget-row"><label>File Read Max:</label><span>{config?.file_read_max_chars ?? '—'} chars</span></div>
      </div>

      <div className="budget-section">
        <h3>How to Reduce Costs</h3>
        <ul className="budget-tips">
          <li>Lower <code>compression.threshold</code> to compress sooner</li>
          <li>Set <code>max_concurrent_sessions</code> to limit parallel sessions</li>
          <li>Enable <code>tool_loop_guardrails.hard_stop_enabled</code> to prevent runaway tool loops</li>
          <li>Use <code>/compress</code> in chat to manually compress context</li>
          <li>Start new sessions with <code>/new</code> when switching topics</li>
        </ul>
      </div>
    </div>
  );
}