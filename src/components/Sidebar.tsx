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
  { id: 'profiles', label: 'Profiles', icon: '👤' },
  { id: 'soul', label: 'Soul.md', icon: '🧬' },
  { id: 'goals', label: 'Goals', icon: '🎯' },
  { id: 'personas', label: 'Personas', icon: '🎭' },
  { id: 'mcp', label: 'MCP', icon: '🔌' },
  { id: 'models', label: 'Models', icon: '🤖' },
  { id: 'spend', label: 'Spend', icon: '💰' },
  { id: 'documents', label: 'Documents', icon: '📄' },
  { id: 'subagents', label: 'Sub-agents', icon: '🤖' },
  { id: 'skill-workshop', label: 'Workshop', icon: '🔨' },
  { id: 'experts', label: 'Experts', icon: '🏛️' },
  { id: 'token-budget', label: 'Budget', icon: '⚡' },
  { id: 'multi-chat', label: 'Multi-Chat', icon: '💬' },
  { id: 'computer', label: 'Computer', icon: '🖥️' },
  { id: 'claude-bridge', label: 'Bridge', icon: '🌉' },
  { id: 'config', label: 'Config', icon: '🔧' },
  { id: 'webhooks', label: 'Webhooks', icon: '🔗' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ activeView, onViewChange, profiles, activeProfile, onProfileChange }: {
  activeView: View;
  onViewChange: (view: View) => void;
  profiles: Profile[];
  activeProfile: string;
  onProfileChange: (profile: string) => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">J</span>
        <span className="sidebar-title">Jarvis OS</span>
      </div>

      <div className="profile-selector" onClick={() => setProfileOpen(!profileOpen)}>
        <span className="profile-current">{activeProfile}</span>
        <span className="profile-arrow">{profileOpen ? '▲' : '▼'}</span>
        {profileOpen && (
          <div className="profile-dropdown">
            {profiles.map(p => (
              <div
                key={p.name}
                className={`profile-option ${p.name === activeProfile ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); onProfileChange(p.name); setProfileOpen(false); }}
              >
                <span>{p.name}</span>
                {p.gateway_running && <span className="dot green" />}
              </div>
            ))}
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? 'active' : ''}`}
            onClick={() => onViewChange(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}