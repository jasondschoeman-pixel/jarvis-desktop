// src/components/WebhooksView.tsx
import { useState, useEffect } from 'react';
import { api } from '../api';

export function WebhooksView() {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await api.getWebhooks();
        if (!mounted) return;
        const list = Array.isArray(data) ? data : (data?.webhooks || data?.subscriptions || []);
        setWebhooks(list);
        setError(null);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load webhooks');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  if (loading && webhooks.length === 0) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading webhooks...</p></div>;

  return (
    <div className="webhooks-view">
      <div className="webhooks-header">
        <h2>Webhooks ({webhooks.length})</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="webhooks-list">
        {webhooks.map((hook, i) => (
          <div key={hook.id || i} className="webhook-card">
            <div className="webhook-card-header">
              <span className="webhook-name">{hook.name || hook.event || hook.id || `Webhook ${i + 1}`}</span>
              {hook.enabled !== undefined && (
                <span className={`badge ${hook.enabled ? 'badge-green' : 'badge-gray'}`}>
                  {hook.enabled ? 'Active' : 'Disabled'}
                </span>
              )}
            </div>
            {hook.url && <div className="webhook-url">{hook.url}</div>}
            {hook.event && <div className="webhook-event">Event: {hook.event}</div>}
            {hook.target && <div className="webhook-target">Target: {hook.target}</div>}
          </div>
        ))}
        {webhooks.length === 0 && !loading && (
          <div className="empty-state">No webhooks configured</div>
        )}
      </div>
    </div>
  );
}