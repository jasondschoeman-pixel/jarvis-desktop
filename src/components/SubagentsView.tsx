// src/components/SubagentsView.tsx — Sub-agent monitor
import { useState, useEffect } from 'react';
import { api } from '../api';

export function SubagentsView() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(data => {
      setConfig(data?.delegation);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading...</p></div>;

  const delegation = config || {};

  return (
    <div className="subagents-view">
      <div className="subagents-header">
        <h2>🤖 Sub-agents</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="subagents-card">
        <h3>Delegation Configuration</h3>
        <div className="subagent-stat-row"><label>Model:</label><span>{delegation.model || '—'}</span></div>
        <div className="subagent-stat-row"><label>Provider:</label><span>{delegation.provider || '—'}</span></div>
        <div className="subagent-stat-row"><label>API Mode:</label><span>{delegation.api_mode || '—'}</span></div>
        {delegation.base_url && <div className="subagent-stat-row"><label>Base URL:</label><span className="mono">{delegation.base_url}</span></div>}
      </div>

      <div className="subagents-card">
        <h3>Active Sub-agents</h3>
        <p className="subagents-empty">
          Sub-agent monitoring is not available via the current API.
          When you delegate tasks via chat (delegate_task), they'll appear here in real time.
        </p>
        <p className="subagents-desc">
          Sub-agents are spawned by Hermes to work on tasks in isolated contexts.
          Each gets its own conversation, terminal session, and toolset.
          Only the final summary is returned — intermediate results never enter your context.
        </p>
      </div>

      <div className="subagents-card">
        <h3>How to Use</h3>
        <p className="subagents-desc">In chat, ask Hermes to delegate:</p>
        <ul className="subagents-examples">
          <li><code>"Research X and Y in parallel"</code> — spawns 2 sub-agents</li>
          <li><code>"Debug this error, review the code"</code> — focused worker</li>
          <li><code>"Audit the codebase and report"</code> — background research</li>
        </ul>
        <p className="subagents-desc">Up to 3 sub-agents run concurrently. Results return automatically.</p>
      </div>
    </div>
  );
}