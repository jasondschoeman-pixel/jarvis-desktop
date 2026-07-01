// src/components/Sidebar.tsx
import { useState } from 'react';
import type { View, Profile } from '../types';

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: 'status', label: 'Status', icon: '📊' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'skills', label: 'Skills', icon: '🎓' },
  { id: 'jobs', label: 'Jobs', icon: '⏰' },
  { id: 'sessions', label: 'Sessions', icon: '🕐' },
  { id: 'kanban', label: 'Kanban', icon: '📋' },
  { id: 'config', label: 'Config', icon: '🔧' },
  { id: 'webhooks', label: 'Webhooks', icon: '🔗' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({
  view, setView, profiles, activeProfile, switchProfile, connected,
}: {
  view: View; setView: (v: View) => void;
  profiles: Profile[]; activeProfile: string; switchProfile: (n: string) => void;
  connected: boolean;
}) {
  const [showProfiles, setShowProfiles] = useState(false);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">J</div>
        <span className="sidebar-title">Jarvis</span>
        <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-profiles">
        <button className="profile-selector" onClick={() => setShowProfiles(!showProfiles)}>
          <span className="profile-avatar">{activeProfile.charAt(0).toUpperCase()}</span>
          <span className="profile-name">{activeProfile}</span>
          <span className="chevron">{showProfiles ? '▼' : '▶'}</span>
        </button>
        {showProfiles && (
          <div className="profile-dropdown">
            {profiles.map(p => (
              <button
                key={p.name}
                className={`profile-option ${p.name === activeProfile ? 'active' : ''}`}
                onClick={() => { switchProfile(p.name); setShowProfiles(false); }}
              >
                <span className="profile-avatar small">{p.name.charAt(0).toUpperCase()}</span>
                <div className="profile-info">
                  <span className="profile-name">{p.name}</span>
                  <span className="profile-model">{p.model || 'no model'}</span>
                </div>
                {p.gateway_running && <span className="profile-online" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}