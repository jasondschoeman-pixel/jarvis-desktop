// src/components/PersonasView.tsx — Pantheon: custom AI personas
import { useState, useEffect } from 'react';
import { api } from '../api';

export function PersonasView() {
  const [personalities, setPersonalities] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newPersona, setNewPersona] = useState({ name: '', systemPrompt: '', model: '' });

  useEffect(() => {
    api.getConfig().then(data => {
      setPersonalities(data?.personalities || {});
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  const personaNames = Object.keys(personalities);

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading personas...</p></div>;

  return (
    <div className="personas-view">
      <div className="personas-header">
        <h2>🎭 Personas ({personaNames.length})</h2>
        <button className="create-btn" onClick={() => setShowCreate(!showCreate)}>+ New Persona</button>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      {showCreate && (
        <div className="persona-create-form">
          <input placeholder="Persona name (e.g. Athena)" value={newPersona.name}
            onChange={e => setNewPersona({ ...newPersona, name: e.target.value })} />
          <textarea placeholder="System prompt — personality, rules, tone..." value={newPersona.systemPrompt}
            onChange={e => setNewPersona({ ...newPersona, systemPrompt: e.target.value })} rows={4} />
          <input placeholder="Model (e.g. glm-5.2, deepseek-v4-pro)" value={newPersona.model}
            onChange={e => setNewPersona({ ...newPersona, model: e.target.value })} />
          <button className="create-confirm-btn" onClick={() => {
            // Note: creation requires config write API — display for now
            setError('Persona creation requires config write API (not yet available via dashboard REST). Use Hermes CLI: hermes config set personalities.' + newPersona.name + ' ...');
          }}>Create</button>
        </div>
      )}

      <div className="personas-grid">
        {personaNames.map(name => {
          const p = personalities[name];
          return (
            <div key={name} className="persona-card">
              <div className="persona-card-header">
                <span className="persona-name">{name}</span>
                {p.model && <span className="badge badge-purple">{p.model}</span>}
              </div>
              {p.system_prompt && <div className="persona-prompt">{p.system_prompt.slice(0, 200)}...</div>}
              {p.description && <div className="persona-desc">{p.description}</div>}
            </div>
          );
        })}
        {personaNames.length === 0 && (
          <div className="empty-state">No personas configured. Create one to give Hermes a custom personality for specific tasks.</div>
        )}
      </div>
    </div>
  );
}