// src/components/SettingsView.tsx
import type { Profile, UpdateStatus, StatusInfo } from '../types';

export function SettingsView({ profiles, activeProfile, statusInfo, updateStatus, onCheckUpdate, onInstallUpdate }: {
  profiles: Profile[]; activeProfile: string; statusInfo: StatusInfo | null;
  updateStatus: UpdateStatus | null;
  onCheckUpdate: () => void; onInstallUpdate: () => void;
}) {
  return (
    <div className="settings-view">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>Connection</h3>
        <div className="settings-row">
          <span>Dashboard URL</span>
          <code>http://192.168.1.50:9120</code>
        </div>
        <div className="settings-row">
          <span>Status</span>
          <span className={statusInfo?.gateway_running ? 'text-green' : 'text-red'}>
            {statusInfo?.gateway_running ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="settings-row">
          <span>Version</span>
          <code>{statusInfo?.version || 'unknown'}</code>
        </div>
      </section>

      <section className="settings-section">
        <h3>Updates</h3>
        <div className="settings-row">
          <span>App Version</span>
          <code>v1.3.1</code>
        </div>
        {updateStatus && (
          <div className={`settings-row update-banner update-${updateStatus.status}`}>
            <span>{updateStatus.message}</span>
            {updateStatus.status === 'ready' && (
              <button className="update-install-btn" onClick={onInstallUpdate}>
                Restart & Install
              </button>
            )}
          </div>
        )}
        <div className="settings-row">
          <span>Check for updates manually</span>
          <button className="update-check-btn" onClick={onCheckUpdate}>
            Check Now
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Profiles</h3>
        {profiles.map(p => (
          <div key={p.name} className={`settings-row ${p.name === activeProfile ? 'active' : ''}`}>
            <div className="profile-detail">
              <span className="profile-name">{p.name}</span>
              <span className="profile-model">{p.model || 'no model'} / {p.provider || 'no provider'}</span>
            </div>
            <span className={`badge ${p.gateway_running ? 'badge-green' : 'badge-gray'}`}>
              {p.gateway_running ? 'Online' : 'Offline'}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}