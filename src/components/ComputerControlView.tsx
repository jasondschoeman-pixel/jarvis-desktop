// src/components/ComputerControlView.tsx — Computer control status
import { useState, useEffect } from 'react';
import { api } from '../api';

export function ComputerControlView() {
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

  const computerUse = config?.computer_use || {};
  const browser = config?.browser || {};

  return (
    <div className="computer-view">
      <div className="computer-header">
        <h2>🖥️ Computer Control</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="computer-section">
        <h3>Computer Use</h3>
        <div className="computer-row"><label>CUA Telemetry:</label><span>{computerUse.cua_telemetry ? '✅' : '❌'}</span></div>
      </div>

      <div className="computer-section">
        <h3>Browser Settings</h3>
        <div className="computer-row"><label>Engine:</label><span>{browser.engine || 'default'}</span></div>
        <div className="computer-row"><label>Inactivity Timeout:</label><span>{browser.inactivity_timeout ?? '—'}s</span></div>
        <div className="computer-row"><label>Command Timeout:</label><span>{browser.command_timeout ?? '—'}s</span></div>
        <div className="computer-row"><label>Record Sessions:</label><span>{browser.record_sessions ? '✅' : '❌'}</span></div>
        <div className="computer-row"><label>Allow Private URLs:</label><span>{browser.allow_private_urls ? '✅' : '❌'}</span></div>
      </div>

      <div className="computer-section">
        <h3>Terminal Settings</h3>
        <div className="computer-row"><label>Backend:</label><span>{config?.terminal?.backend || '—'}</span></div>
        <div className="computer-row"><label>Timeout:</label><span>{config?.terminal?.timeout ?? '—'}s</span></div>
        <div className="computer-row"><label>Daemon Grace:</label><span>{config?.terminal?.daemon_term_grace_seconds ?? '—'}s</span></div>
      </div>

      <div className="computer-section">
        <h3>How It Works</h3>
        <p>Hermes can control your computer through two mechanisms:</p>
        <ul className="computer-list">
          <li><strong>Browser:</strong> Navigates web pages, clicks elements, fills forms, reads content</li>
          <li><strong>Terminal:</strong> Executes shell commands, reads/writes files, manages processes</li>
        </ul>
        <p>Both require approval for destructive actions. The <code>approvals.mode</code> setting controls whether
          you're asked before each action or if safe actions are auto-approved.</p>
      </div>

      <div className="computer-section">
        <h3>Approval Settings</h3>
        <div className="computer-row"><label>Mode:</label><span>{config?.approvals?.mode || '—'}</span></div>
        <div className="computer-row"><label>Timeout:</label><span>{config?.approvals?.timeout ?? '—'}s</span></div>
        <div className="computer-row"><label>Cron Mode:</label><span>{config?.approvals?.cron_mode || '—'}</span></div>
      </div>
    </div>
  );
}