// src/components/SessionsView.tsx
import type { Session } from '../types';

export function SessionsView({ sessions, refresh, onResume, resuming }: {
  sessions: Session[]; refresh: () => void;
  onResume: (sessionId: string) => void; resuming: boolean;
}) {
  return (
    <div className="sessions-view">
      <div className="sessions-header">
        <h2>Recent Sessions</h2>
        <button className="refresh-btn" onClick={refresh}>↻</button>
      </div>
      <div className="sessions-list">
        {sessions.map(s => (
          <div
            key={s.id}
            className="session-card clickable"
            onClick={() => !resuming && onResume(s.id)}
            style={{ opacity: resuming ? 0.5 : 1, cursor: resuming ? 'wait' : 'pointer' }}
          >
            <div className="session-title">{s.title || 'Untitled'}</div>
            <div className="session-preview">{s.preview}</div>
            <div className="session-meta">
              <span>{s.model}</span>
              <span>{s.message_count} messages</span>
              <span>{new Date(s.last_active * 1000).toLocaleString()}</span>
            </div>
            {resuming && <div className="session-loading">Resuming...</div>}
            {!resuming && <div className="session-resume-hint">Click to resume →</div>}
          </div>
        ))}
        {sessions.length === 0 && (
          <div className="empty-state">No sessions found</div>
        )}
      </div>
    </div>
  );
}