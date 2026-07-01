// src/components/JobsView.tsx
import { useState, useEffect } from 'react';
import { api } from '../api';
import type { CronJob } from '../types';

interface JobResponse {
  jobs: RawJob[];
}

interface RawJob {
  id: string;
  name?: string;
  prompt?: string;
  skills?: string[];
  model?: string;
  provider?: string;
  enabled: boolean;
  state: string;
  deliver?: string;
  script?: string | null;
  profile_name?: string;
  created_at?: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  schedule?: { kind: string; expr: string; display: string };
  schedule_display?: string;
  repeat?: { times: number | null; completed: number };
  paused_at?: string | null;
  paused_reason?: string | null;
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export function JobsView() {
  const [jobs, setJobs] = useState<RawJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newJob, setNewJob] = useState({ name: '', prompt: '', schedule: '0 9 * * *', deliver: 'origin' });

  async function load() {
    try {
      const data = await api.getJobs();
      const jobList = data?.jobs || (Array.isArray(data) ? data : []);
      setJobs(jobList);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createJob() {
    if (!newJob.name || !newJob.prompt) return;
    try {
      await api.createJob({
        name: newJob.name,
        prompt: newJob.prompt,
        schedule: newJob.schedule,
        deliver: newJob.deliver,
      });
      setNewJob({ name: '', prompt: '', schedule: '0 9 * * *', deliver: 'origin' });
      setShowCreate(false);
      load();
    } catch (err: any) {
      setError(err.message || 'Failed to create job');
    }
  }

  async function handlePause(id: string) { try { await api.pauseJob(id); load(); } catch (e: any) { setError(e.message); } }
  async function handleResume(id: string) { try { await api.resumeJob(id); load(); } catch (e: any) { setError(e.message); } }
  async function handleRun(id: string) { try { await api.runJobNow(id); load(); } catch (e: any) { setError(e.message); } }
  async function handleDelete(id: string) {
    if (!confirm('Delete this job?')) return;
    try { await api.deleteJob(id); load(); } catch (e: any) { setError(e.message); }
  }

  if (loading && jobs.length === 0) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading jobs...</p></div>;

  return (
    <div className="jobs-view">
      <div className="jobs-header">
        <h2>Cron Jobs ({jobs.length})</h2>
        <button className="create-btn" onClick={() => setShowCreate(!showCreate)}>+ New Job</button>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      {showCreate && (
        <div className="job-create-form">
          <input
            placeholder="Job name"
            value={newJob.name}
            onChange={e => setNewJob({ ...newJob, name: e.target.value })}
          />
          <textarea
            placeholder="Prompt (must be self-contained — the job runs in a fresh session with no conversation context)"
            value={newJob.prompt}
            onChange={e => setNewJob({ ...newJob, prompt: e.target.value })}
            rows={4}
          />
          <input
            placeholder="Schedule (cron expr or '30m', 'every 2h')"
            value={newJob.schedule}
            onChange={e => setNewJob({ ...newJob, schedule: e.target.value })}
          />
          <select value={newJob.deliver} onChange={e => setNewJob({ ...newJob, deliver: e.target.value })}>
            <option value="origin">Origin (current chat)</option>
            <option value="local">Local (save only)</option>
            <option value="telegram">Telegram Home</option>
          </select>
          <button className="create-confirm-btn" onClick={createJob}>Create Job</button>
        </div>
      )}

      <div className="jobs-list">
        {jobs.map(job => (
          <div key={job.id} className={`job-card ${job.enabled ? '' : 'disabled'}`}>
            <div className="job-card-header">
              <span className="job-name">{job.name || job.id}</span>
              <span className={`job-state job-state-${job.state}`}>{job.state}</span>
            </div>

            <div className="job-card-schedule">
              ⏰ {job.schedule_display || job.schedule?.display || '—'}
              {job.repeat?.completed != null && <span className="job-runs"> · {job.repeat.completed} runs</span>}
            </div>

            <div className="job-card-prompt">
              {job.prompt?.slice(0, 150)}{job.prompt && job.prompt.length > 150 ? '...' : ''}
            </div>

            <div className="job-card-meta">
              <span>📦 {job.profile_name || 'default'}</span>
              {job.model && <span>🤖 {job.model}</span>}
              <span>📍 {job.deliver || 'origin'}</span>
              {job.last_status && (
                <span className={`job-last-status job-last-${job.last_status}`}>
                  {job.last_status === 'ok' ? '✅' : '❌'} {job.last_status}
                </span>
              )}
            </div>

            <div className="job-card-times">
              <span>Last: {formatTime(job.last_run_at)}</span>
              <span>Next: {formatTime(job.next_run_at)}</span>
            </div>

            {job.last_error && <div className="job-card-error">⚠️ {job.last_error}</div>}

            <div className="job-actions">
              {job.enabled ? (
                <button className="job-btn pause" onClick={() => handlePause(job.id)}>⏸ Pause</button>
              ) : (
                <button className="job-btn resume" onClick={() => handleResume(job.id)}>▶ Resume</button>
              )}
              <button className="job-btn run" onClick={() => handleRun(job.id)}>⚡ Run Now</button>
              <button className="job-btn delete" onClick={() => handleDelete(job.id)}>🗑 Delete</button>
            </div>
          </div>
        ))}

        {jobs.length === 0 && !loading && (
          <div className="empty-state">No cron jobs found</div>
        )}
      </div>
    </div>
  );
}