// src/components/McpView.tsx — MCP Servers manager
import { useState, useEffect } from 'react';
import { api } from '../api';
import type { McpServer } from '../types';

export function McpView() {
  const [servers, setServers] = useState<Record<string, McpServer>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(data => {
      setServers(data?.mcp_servers || {});
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  const serverNames = Object.keys(servers);

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading MCP servers...</p></div>;

  return (
    <div className="mcp-view">
      <div className="mcp-header">
        <h2>🔌 MCP Servers ({serverNames.length})</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="mcp-list">
        {serverNames.map(name => {
          const s = servers[name];
          const isRemote = !!s.url;
          return (
            <div key={name} className={`mcp-card ${s.enabled === false ? 'disabled' : ''}`}>
              <div className="mcp-card-header">
                <span className="mcp-name">{name}</span>
                <span className={`badge ${s.enabled !== false ? 'badge-green' : 'badge-gray'}`}>
                  {s.enabled !== false ? 'Enabled' : 'Disabled'}
                </span>
                <span className="badge badge-blue">{isRemote ? 'Remote' : 'Local'}</span>
              </div>
              <div className="mcp-card-body">
                {s.command && <div className="mcp-stat">⚡ {s.command} {s.args?.join(' ') || ''}</div>}
                {s.url && <div className="mcp-stat">🌐 {s.url.slice(0, 80)}</div>}
                {s.headers && <div className="mcp-stat">📋 {Object.keys(s.headers).length} headers</div>}
              </div>
            </div>
          );
        })}
        {serverNames.length === 0 && <div className="empty-state">No MCP servers configured</div>}
      </div>
    </div>
  );
}