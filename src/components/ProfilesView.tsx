// src/components/ProfilesView.tsx — Profile Manager
import { useState, useEffect } from 'react';
import { api } from '../api';
import type { FullProfile } from '../types';

export function ProfilesView({ activeProfile, onSwitchProfile }: {
  activeProfile: string;
  onSwitchProfile: (profile: string) => void;
}) {
  const [profiles, setProfiles] = useState<FullProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newProfile, setNewProfile] = useState({ name: '', model: '', provider: 'ollama-cloud' });

  async function load() {
    try {
      const data = await api.getProfiles();
      setProfiles(data?.profiles || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newProfile.name) return;
    try {
      // Clone from default config
      const body: any = { name: newProfile.name };
      if (newProfile.model) body.model = newProfile.model;
      if (newProfile.provider) body.provider = newProfile.provider;
      await api.jarvis.api.request('POST', '/api/profiles', body);
      setNewProfile({ name: '', model: '', provider: 'ollama-cloud' });
      setShowCreate(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create profile');
    }
  }

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading profiles...</p></div>;

  return (
    <div className="profiles-view">
      <div className="profiles-header">
        <h2>Profiles ({profiles.length})</h2>
        <button className="create-btn" onClick={() => setShowCreate(!showCreate)}>+ New Profile</button>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      {showCreate && (
        <div className="profile-create-form">
          <input placeholder="Profile name (lowercase, hyphens)" value={newProfile.name}
            onChange={e => setNewProfile({ ...newProfile, name: e.target.value })} />
          <input placeholder="Model (e.g. glm-5.2)" value={newProfile.model}
            onChange={e => setNewProfile({ ...newProfile, model: e.target.value })} />
          <select value={newProfile.provider} onChange={e => setNewProfile({ ...newProfile, provider: e.target.value })}>
            <option value="ollama-cloud">ollama-cloud</option>
            <option value="openrouter">openrouter</option>
          </select>
          <button className="create-confirm-btn" onClick={handleCreate}>Create</button>
        </div>
      )}

      <div className="profiles-grid">
        {profiles.map(p => (
          <div key={p.name} className={`profile-card ${p.name === activeProfile ? 'active' : ''}`}
               onClick={() => onSwitchProfile(p.name)}>
            <div className="profile-card-header">
              <span className="profile-name">{p.name}</span>
              {p.is_default && <span className="badge badge-purple">Default</span>}
              {p.name === activeProfile && <span className="badge badge-green">Active</span>}
            </div>
            <div className="profile-card-body">
              <div className="profile-stat">🤖 {p.model || '—'}</div>
              <div className="profile-stat">📦 {p.provider || '—'}</div>
              <div className="profile-stat">🎓 {p.skill_count} skills</div>
              <div className="profile-stat">
                {p.gateway_running ? '🟢 Running' : '⚪ Stopped'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}