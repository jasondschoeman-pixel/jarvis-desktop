// src/components/SessionsView.tsx — Enhanced with search + filtering
import { useState, useMemo } from 'react';
import type { Session } from '../types';

export function SessionsView({ sessions, refresh, onResume, resuming }: {
  sessions: Session[]; refresh: () => void;
  onResume: (sessionId: string) => void; resuming: boolean;
}) {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sessions.filter(s => {
      if (sourceFilter !== 'all' && s.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        s.title?.toLowerCase().includes(q) ||
        s.preview?.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [sessions, search, sourceFilter]);

  const sources = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => { if (s.source) set.add(s.source); });
    return ['all', ...Array.from(set)];
  }, [sessions]);

  return (
    <div className="sessions-view">
      <div className="sessions-header">
        <h2>Sessions ({filtered.length}{filtered.length !== sessions.length ? ` of ${sessions.length}` : ''})</h2>
        <div className="sessions-controls">
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="sessions-filter">
            {sources.map(s => <option key={s} value={s}>{s === 'all' ? 'All Sources' : s}</option>)}
          </select>
          <input
            type="text"
            placeholder="Search sessions..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="sessions-search"
          />
          <button className="refresh-btn" onClick={refresh}>↻</button>
        </div>
      </div>

      <div className="sessions-list">
        {filtered.map(s => (
          <div
            key={s.id}
            className="session-card clickable"
            onClick={() => !resuming && onResume(s.id)}
            style={{ opacity: resuming ? 0.5 : 1, cursor: resuming ? 'wait' : 'pointer' }}
          >
            <div className="session-title">{s.title || 'Untitled'}</div>
            <div className="session-preview">{s.preview}</div>
            <div className="session-meta">
              {s.source && <span className="session-source">{s.source}</span>}
              {s.model && <span>{s.model}</span>}
              <span>{s.message_count} msgs</span>
              <span>{new Date(s.last_active * 1000).toLocaleString()}</span>
            </div>
            {resuming && <div className="session-loading">Resuming...</div>}
            {!resuming && <div className="session-resume-hint">Click to resume →</div>}
          </div>
        ))}
        {filtered.length === 0 && sessions.length > 0 && (
          <div className="empty-state">No sessions match "{search}"</div>
        )}
        {sessions.length === 0 && (
          <div className="empty-state">No sessions found</div>
        )}
      </div>
    </div>
  );
}