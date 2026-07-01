// src/components/ClaudeBridgeView.tsx — Claude Code bridge status
import { useState, useEffect } from 'react';
import { api } from '../api';

export function ClaudeBridgeView() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(data => {
      setConfig(data);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading...</p></div>;

  const memory = config?.memory || {};
  const context = config?.context || {};

  return (
    <div className="bridge-view">
      <div className="bridge-header">
        <h2>🌉 Claude Code Bridge</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="bridge-section">
        <h3>Shared Memory</h3>
        <p>The bridge syncs memory between Hermes and Claude Code so both agents share context.</p>
        <div className="bridge-row"><label>Memory Enabled:</label><span>{memory.memory_enabled ? '✅' : '❌'}</span></div>
        <div className="bridge-row"><label>User Profile Enabled:</label><span>{memory.user_profile_enabled ? '✅' : '❌'}</span></div>
        <div className="bridge-row"><label>Write Approval:</label><span>{memory.write_approval || '—'}</span></div>
        <div className="bridge-row"><label>Memory Char Limit:</label><span>{memory.memory_char_limit ?? '—'}</span></div>
        <div className="bridge-row"><label>User Char Limit:</label><span>{memory.user_char_limit ?? '—'}</span></div>
      </div>

      <div className="bridge-section">
        <h3>Context Engine</h3>
        <div className="bridge-row"><label>Engine:</label><span>{context.engine || '—'}</span></div>
        <div className="bridge-row"><label>Memory:</label><span>{context.memory_enabled ? '✅' : '❌'}</span></div>
        <div className="bridge-row"><label>User Profile:</label><span>{context.user_profile_enabled ? '✅' : '❌'}</span></div>
      </div>

      <div className="bridge-section">
        <h3>How the Bridge Works</h3>
        <p>The Claude Code Bridge enables bi-directional memory sync:</p>
        <ol className="bridge-list">
          <li>Hermes writes to <code>memory.md</code> and <code>user_profile.md</code></li>
          <li>Claude Code reads these files as part of its system prompt</li>
          <li>When Claude Code updates memory, Hermes picks it up on next session</li>
          <li>Both agents share the same understanding of who you are and what you're working on</li>
        </ol>
        <p>To set up the bridge, Claude Code needs access to the same <code>~/.hermes/</code> directory,
          either locally or via SSH mount.</p>
      </div>

      <div className="bridge-section">
        <h3>Hindsight (Long-term Memory)</h3>
        <div className="bridge-row"><label>API URL:</label><span className="mono">{config?.hindsight?.api_url || '—'}</span></div>
        <p>Hindsight provides knowledge graph storage with entity resolution and multi-strategy retrieval.
          Both Hermes and Claude Code can query it for cross-session context.</p>
      </div>

      <div className="bridge-section">
        <h3>Setup Instructions</h3>
        <ol className="bridge-list">
          <li>Ensure Claude Code runs on the same machine or has <code>~/.hermes/</code> mounted</li>
          <li>Point Claude Code's memory to <code>~/.hermes/memory.md</code></li>
          <li>Use the same Hindsight API URL in both agents</li>
          <li>Test with: ask Hermes something, then ask Claude Code about the same topic</li>
        </ol>
      </div>
    </div>
  );
}