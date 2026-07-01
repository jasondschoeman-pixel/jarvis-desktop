# Jarvis Desktop → Agentic OS Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Transform Jarvis Desktop from a 4-tab chat app into a full agentic OS control center — memory, skills, cron, sessions, config, and system status, all in one native desktop interface.

**Architecture:** Jarvis Desktop is an Electron + React + Vite app that connects to a remote Hermes dashboard (192.168.1.50:9120) via cookie-authenticated REST and a Hermes serve endpoint (192.168.1.50:9119) via WebSocket JSON-RPC. The plan adds new views that call existing Hermes dashboard REST endpoints and the API server (8642) Jobs API. No backend changes needed — all endpoints already exist.

**Tech Stack:** Electron 28, React 18, Vite 5, TypeScript, react-markdown, electron-updater

---

## Current State

### What's Built
- **Chat** (1518-line monolithic App.tsx) — streaming, markdown, thinking/reasoning, tool progress, file attachments, stop, sessions resume
- **Kanban** — 8-column board, create/complete tasks, board switcher
- **Sessions** — list + resume via WS session.resume
- **Settings** — connection info, update checker, profile list
- **Sidebar** — 4 nav items + profile switcher

### Available Hermes APIs (verified live)

**Dashboard (9120) — cookie auth:**
| Endpoint | Status | Data |
|----------|--------|------|
| `GET /api/profiles` | ✅ 200 | Profile list with model, provider, gateway status |
| `GET /api/sessions` | ✅ 200 | Session list (741KB, paginated) |
| `GET /api/sessions/stats` | ✅ 200 | `{total, active, archived, messages, by_source}` |
| `GET /api/skills` | ✅ 200 | All skills with name, description, category, enabled |
| `GET /api/config` | ✅ 200 | Full config.yaml (70+ keys) |
| `GET /api/memory` | ✅ 200 | Memory providers + active provider |
| `GET /api/webhooks` | ✅ 200 | Webhook subscriptions |
| `GET /api/status` | ✅ 200 | Gateway status, platform connections, active agents |
| `GET /api/dashboard/plugins` | ✅ 200 | Installed dashboard plugins |
| `GET /api/dashboard/themes` | ✅ 200 | Installed themes |
| `GET /api/cron` | ❌ 404 | Not exposed on dashboard |
| `GET /api/mcp` | ❌ 404 | Not exposed on dashboard |
| `GET /api/models` | ❌ 404 | Not exposed on dashboard |
| `GET /api/insights` | ❌ 404 | Not exposed on dashboard |

**API Server (8642) — bearer auth:**
| Endpoint | Status |
|----------|--------|
| `GET /health` | ✅ 200 |
| `GET /v1/capabilities` | ✅ (needs API_SERVER_KEY) |
| `GET /api/jobs` | ✅ (needs API_SERVER_KEY) |
| `POST /api/jobs` | ✅ (needs API_SERVER_KEY) |
| `PATCH /api/jobs/{id}` | ✅ |
| `DELETE /api/jobs/{id}` | ✅ |
| `POST /api/jobs/{id}/pause` | ✅ |
| `POST /api/jobs/{id}/resume` | ✅ |
| `POST /api/jobs/{id}/run` | ✅ |

**WebSocket (9119) — JSON-RPC 2.0:**
- `session.create`, `session.resume`, `session.list`
- `prompt.submit`, `image.attach_bytes`, `pdf.attach`, `file.attach`
- Events: `message.start/delta/complete`, `thinking.delta`, `tool.start/progress/complete`, `clarify.request`, `approval.request`, `background.complete`, `error`

### What's Missing (the gap to close)
| Feature | Priority | API Available? |
|---------|----------|----------------|
| Memory browser | High | ✅ /api/memory |
| Skills manager | High | ✅ /api/skills |
| Cron/Jobs UI | High | ✅ /api/jobs (8642) |
| System Status dashboard | High | ✅ /api/status + /api/sessions/stats |
| Config editor | Medium | ✅ /api/config |
| Session search | Medium | ✅ /api/sessions (paginated) |
| Profile manager | Medium | ✅ /api/profiles |
| Soul.md editor | Medium | Via WS (file read/write) or terminal |
| Webhooks panel | Low | ✅ /api/webhooks |
| Insights/analytics | Low | ❌ Not exposed (would need CLI `hermes insights`) |
| MCP servers | Low | ❌ Not exposed on dashboard REST |
| Model switcher | Low | ❌ Not exposed on dashboard REST |
| Sub-agents/delegation view | Future | Via WS (delegate_task is a tool) |
| Computer control | Future | Via WS (computer_use is a tool) |

---

## Architecture: Phase Split

### Phase 1 — Foundation (refactor + status)
Refactor the monolithic App.tsx into a proper component structure, add a system status dashboard, and set up the API layer for new views.

### Phase 2 — Memory & Skills
Memory browser (view, search, edit memory.md) and Skills manager (browse, filter, enable/disable, view SKILL.md content).

### Phase 3 — Jobs & Cron
Cron job manager — list, create, pause/resume, run now, delete, view last output. Talks to API server on 8642.

### Phase 4 — Sessions & Search
Enhanced sessions view with full-text search, filtering by source/profile, message counts, archive/delete.

### Phase 5 — Config & Profile Management
Form-based config editor (like the web dashboard's), profile switcher with create/clone, soul.md editor.

### Phase 6 — Polish & Integration
Kanban improvements, webhooks panel, keyboard shortcuts, theme polish, notification toasts.

---

## Phase 1: Foundation

### Task 1.1: Create directory structure

**Objective:** Split the monolithic App.tsx into proper component files.

**Files:**
- Create: `src/types.ts` — shared TypeScript interfaces
- Create: `src/api.ts` — API client class wrapping window.jarvis
- Create: `src/hooks/useWebSocket.ts` — WS connection hook
- Create: `src/components/Sidebar.tsx` — extract Sidebar
- Create: `src/components/ChatView.tsx` — extract ChatView
- Create: `src/components/KanbanView.tsx` — extract KanbanView
- Create: `src/components/SessionsView.tsx` — extract SessionsView
- Create: `src/components/SettingsView.tsx` — extract SettingsView
- Create: `src/components/StatusView.tsx` — new system status view
- Create: `src/components/views/` — view container components
- Modify: `src/App.tsx` — slim down to router + state management
- Modify: `src/styles/app.css` — add new view styles

**Step 1:** Create `src/types.ts` with all interfaces extracted from App.tsx (Profile, Session, KanbanTask, KanbanBoard, ChatMessage, PendingAttachment, plus new types for Status, Skill, MemoryInfo, CronJob, ConfigSection).

**Step 2:** Create `src/api.ts` — a singleton API client:

```typescript
// src/api.ts
export class HermesAPI {
  private get jarvis() { return window.jarvis; }

  // Dashboard REST (9120)
  async getProfiles() { return this.jarvis.api.request('GET', '/api/profiles'); }
  async getSessions(limit = 50, offset = 0) { return this.jarvis.api.request('GET', `/api/sessions?limit=${limit}&offset=${offset}`); }
  async getSessionStats() { return this.jarvis.api.request('GET', '/api/sessions/stats'); }
  async getSkills() { return this.jarvis.api.request('GET', '/api/skills'); }
  async getConfig() { return this.jarvis.api.request('GET', '/api/config'); }
  async getMemory() { return this.jarvis.api.request('GET', '/api/memory'); }
  async getStatus() { return this.jarvis.api.request('GET', '/api/status'); }
  async getWebhooks() { return this.jarvis.api.request('GET', '/api/webhooks'); }

  // API Server (8642) — needs separate IPC handler
  async getJobs() { return this.jarvis.jobs.request('GET', '/api/jobs'); }
  async createJob(body: any) { return this.jarvis.jobs.request('POST', '/api/jobs', body); }
  async updateJob(id: string, body: any) { return this.jarvis.jobs.request('PATCH', `/api/jobs/${id}`, body); }
  async deleteJob(id: string) { return this.jarvis.jobs.request('DELETE', `/api/jobs/${id}`); }
  async pauseJob(id: string) { return this.jarvis.jobs.request('POST', `/api/jobs/${id}/pause`); }
  async resumeJob(id: string) { return this.jarvis.jobs.request('POST', `/api/jobs/${id}/resume`); }
  async runJobNow(id: string) { return this.jarvis.jobs.request('POST', `/api/jobs/${id}/run`); }
}

export const api = new HermesAPI();
```

**Step 3:** Extract Sidebar, ChatView, KanbanView, SessionsView, SettingsView into individual files. Move all existing code verbatim — no behavior changes.

**Step 4:** Create `src/hooks/useWebSocket.ts` — extract the WS connection logic into a reusable hook:

```typescript
// src/hooks/useWebSocket.ts
export function useWebSocket(profile: string) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // ... all the WS logic from App.tsx, refactored
  return { connected, messages, setMessages, streaming, sessionId: sessionIdRef, ws: wsRef, sendMessage, resumeSession, switchProfile, handleFileSelect, stopStreaming };
}
```

**Step 5:** Slim App.tsx down to:

```typescript
export default function App() {
  const [view, setView] = useState<View>('chat');
  const [activeProfile, setActiveProfile] = useState('default');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const ws = useWebSocket(activeProfile);

  // Init: login, fetch profiles, connect WS
  // Render Sidebar + active view
}
```

**Step 6:** Verify the app still works identically — chat, kanban, sessions, settings all functional.

**Step 7:** Commit.

```bash
git add -A && git commit -m "refactor: split monolithic App.tsx into component structure"
```

---

### Task 1.2: Add API server IPC handler for Jobs API

**Objective:** The Electron main process needs a new IPC handler to talk to the API server on port 8642 for the Jobs API.

**Files:**
- Modify: `electron/main.js` — add `jobs:request` IPC handler
- Modify: `electron/preload.js` — expose `window.jarvis.jobs`

**Step 1:** Add to `electron/main.js`:

```javascript
const API_SERVER_URL = 'http://192.168.1.50:8642';
let apiServerKey = null;

// Try to get API_SERVER_KEY from the dashboard config
async function fetchApiServerKey() {
  try {
    const result = await apiWithCookies('192.168.1.50', 9120, dashboardCookies, 'GET', '/api/config');
    // API_SERVER_KEY may be in config or env — check if exposed
    // Fallback: read from .env on the server via a dashboard endpoint
    if (result?.api_server_key) apiServerKey = result.api_server_key;
  } catch (err) {
    console.error('Failed to fetch API server key:', err.message);
  }
}

ipcMain.handle('jobs:request', async (event, { method, path, body }) => {
  try {
    const url = new URL(path, API_SERVER_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiServerKey || ''}`,
      },
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  } catch (err) {
    return { error: err.message };
  }
});
```

**Step 2:** Add to `electron/preload.js`:

```javascript
jobs: {
  request: (method, path, body) => ipcRenderer.invoke('jobs:request', { method, path, body }),
},
```

**Step 3:** Call `fetchApiServerKey()` after login in `app.whenReady()`.

**Step 4:** Verify by testing `GET /api/jobs` returns 200 from the renderer.

**Step 5:** Commit.

---

### Task 1.3: Add StatusView (system dashboard)

**Objective:** A new view showing live system status — gateway state, platform connections, active sessions, agent count, model info, version.

**Files:**
- Create: `src/components/StatusView.tsx`
- Modify: `src/App.tsx` — add 'status' to View type and nav items
- Modify: `src/styles/app.css` — status view styles

**Step 1:** Create `src/components/StatusView.tsx`:

```typescript
// src/components/StatusView.tsx
import { useState, useEffect } from 'react';
import { api } from '../api';

export function StatusView() {
  const [status, setStatus] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, st] = await Promise.all([api.getStatus(), api.getSessionStats()]);
        setStatus(s);
        setStats(st);
      } catch (err) {
        console.error('Status load failed:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 5000); // auto-refresh every 5s
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="loading">Loading status...</div>;

  return (
    <div className="status-view">
      <h2>System Status</h2>

      {/* Gateway state */}
      <section className="status-section">
        <h3>Gateway</h3>
        <div className="status-grid">
          <div className="status-card">
            <span className="status-label">State</span>
            <span className={`status-value ${status?.gateway_state === 'running' ? 'text-green' : 'text-red'}`}>
              {status?.gateway_state || 'unknown'}
            </span>
          </div>
          <div className="status-card">
            <span className="status-label">Version</span>
            <span className="status-value">{status?.version}</span>
          </div>
          <div className="status-card">
            <span className="status-label">Active Agents</span>
            <span className="status-value">{status?.active_agents}</span>
          </div>
          <div className="status-card">
            <span className="status-label">Active Sessions</span>
            <span className="status-value">{status?.active_sessions}</span>
          </div>
        </div>
      </section>

      {/* Platform connections */}
      <section className="status-section">
        <h3>Platforms</h3>
        <div className="platform-grid">
          {Object.entries(status?.gateway_platforms || {}).map(([name, p]: [string, any]) => (
            <div key={name} className={`platform-card ${p.state}`}>
              <span className="platform-name">{name}</span>
              <span className={`platform-state ${p.state}`}>{p.state}</span>
              {p.error_message && <span className="platform-error">{p.error_message}</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Session stats */}
      {stats && (
        <section className="status-section">
          <h3>Sessions</h3>
          <div className="status-grid">
            <div className="status-card">
              <span className="status-label">Total</span>
              <span className="status-value">{stats.total}</span>
            </div>
            <div className="status-card">
              <span className="status-label">Messages</span>
              <span className="status-value">{stats.messages}</span>
            </div>
            <div className="status-card">
              <span className="status-label">Archived</span>
              <span className="status-value">{stats.archived}</span>
            </div>
          </div>
          <div className="source-breakdown">
            <h4>By Source</h4>
            {Object.entries(stats.by_source || {}).map(([source, count]) => (
              <div key={source} className="source-row">
                <span>{source}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

**Step 2:** Add to sidebar nav items: `{ id: 'status', label: 'Status', icon: '📊' }` as the first item.

**Step 3:** Add to App.tsx view router:
```typescript
{view === 'status' && <StatusView />}
```

**Step 4:** Add CSS styles for status cards, platform grid, source breakdown.

**Step 5:** Verify — launch app, click Status tab, see live data refreshing every 5s.

**Step 6:** Commit.

---

## Phase 2: Memory & Skills

### Task 2.1: Memory Browser View

**Objective:** Browse Hermes memory — see active provider, configured providers, view memory.md content, view user profile, search Hindsight.

**Files:**
- Create: `src/components/MemoryView.tsx`
- Modify: `src/App.tsx` — add 'memory' to View type and nav
- Modify: `src/styles/app.css`

**Step 1:** Create `src/components/MemoryView.tsx`:

Shows:
- Active memory provider (highlighted)
- All configured providers with their status
- Memory content (fetched from memory file via WS file.read or a new IPC handler that reads `~/.hermes/memory.md` and `~/.hermes/user_profile.md` on the server)
- Hindsight search box (calls `hindsight_recall` via a new IPC handler or WS method)

Since we can't directly read files on the remote server via the dashboard REST API, we need a new IPC handler:

```javascript
// electron/main.js — add a file-read proxy via the dashboard
ipcMain.handle('file:read', async (event, { path }) => {
  // Use the dashboard's built-in file browser if available
  // Or send a WS message to the serve endpoint to read a file
  // For now, we can read memory via the memory API endpoint
  return await apiWithCookies('192.168.1.50', 9120, dashboardCookies, 'GET', `/api/memory`);
});
```

Actually — the `/api/memory` endpoint already returns the active provider and configured providers. For memory content, we need to use the WS `file.read` method or add a terminal command. Let's use what we have:

**Memory view shows:**
1. **Active Provider card** — which memory backend is active (Hindsight, Honcho, etc.)
2. **Provider list** — all configured providers with status badges
3. **Memory search** — text input that sends a `hindsight_recall` or `session_search` via WS
4. **Memory content** — display the raw memory.md and user_profile.md content (fetched via a new dashboard endpoint or WS file read)

For the memory content, we'll add a WS method call:

```typescript
// In MemoryView, use the existing WS connection to read files
ws.send(JSON.stringify({
  jsonrpc: '2.0', id: nextId(),
  method: 'file.read',
  params: { path: 'memory.md' }
}));
```

**Step 2:** Add to sidebar: `{ id: 'memory', label: 'Memory', icon: '🧠' }`

**Step 3:** Add to App.tsx:
```typescript
{view === 'memory' && <MemoryView ws={ws} />}
```

**Step 4:** CSS for memory cards, provider list, search results.

**Step 5:** Verify — see active provider (Hindsight), provider list, search works.

**Step 6:** Commit.

---

### Task 2.2: Skills Manager View

**Objective:** Browse all installed skills, filter by category, search by name, view full SKILL.md content, toggle enabled/disabled.

**Files:**
- Create: `src/components/SkillsView.tsx`
- Modify: `src/App.tsx` — add 'skills' to View type and nav
- Modify: `src/styles/app.css`

**Step 1:** The `/api/skills` endpoint returns skills as:
```json
[{ "name": "...", "description": "...", "category": null, "enabled": true }]
```

Create `src/components/SkillsView.tsx`:

```typescript
import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function SkillsView() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillContent, setSkillContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getSkills();
        setSkills(data?.skills || data || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q)
    );
  }, [skills, search]);

  const categories = useMemo(() => {
    const cats = new Map<string, Skill[]>();
    for (const s of skills) {
      const cat = s.category || 'uncategorized';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(s);
    }
    return cats;
  }, [skills]);

  // View skill content — send WS file.read for the SKILL.md
  async function viewSkill(skill: Skill) {
    setSelectedSkill(skill);
    setSkillContent('Loading...');
    // Use WS to read the skill file
    // Or use a REST endpoint if available
    // The dashboard might expose /api/skills/<name> for content
    try {
      const content = await api.getSkillContent(skill.name);
      setSkillContent(content);
    } catch {
      setSkillContent('Could not load skill content');
    }
  }

  return (
    <div className="skills-view">
      <div className="skills-header">
        <h2>Skills ({skills.length})</h2>
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="skills-search"
        />
      </div>

      <div className="skills-layout">
        {/* Skill list */}
        <div className="skills-list">
          {filtered.map(skill => (
            <div
              key={skill.name}
              className={`skill-card ${selectedSkill?.name === skill.name ? 'selected' : ''}`}
              onClick={() => viewSkill(skill)}
            >
              <div className="skill-name">{skill.name}</div>
              <div className="skill-desc">{skill.description?.slice(0, 80)}...</div>
              <div className="skill-meta">
                {skill.category && <span className="skill-cat">{skill.category}</span>}
                <span className={`skill-enabled ${skill.enabled ? 'on' : 'off'}`}>
                  {skill.enabled ? '✓' : '✗'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Skill detail */}
        {selectedSkill && (
          <div className="skill-detail">
            <h3>{selectedSkill.name}</h3>
            <div className="skill-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{skillContent}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2:** Add `getSkillContent` to API client. The dashboard might not expose individual skill content — check if `/api/skills/<name>` exists, otherwise use WS `file.read` to read `skills/<category>/<name>/SKILL.md`.

**Step 3:** Add to sidebar: `{ id: 'skills', label: 'Skills', icon: '🎓' }`

**Step 4:** Add to App.tsx, add CSS (two-pane layout: list + detail).

**Step 5:** Verify — see all skills, search filters live, click to view content.

**Step 6:** Commit.

---

## Phase 3: Jobs & Cron

### Task 3.1: Cron Jobs Manager

**Objective:** Full cron job management — list all jobs, create new jobs, pause/resume, run now, delete, view last output.

**Files:**
- Create: `src/components/JobsView.tsx`
- Modify: `src/App.tsx` — add 'jobs' to View type and nav
- Modify: `src/styles/app.css`
- Uses: `window.jarvis.jobs` IPC handler (from Task 1.2)

**Step 1:** Create `src/components/JobsView.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { api } from '../api';

export function JobsView() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Create form state
  const [newJob, setNewJob] = useState({
    name: '', prompt: '', schedule: '0 9 * * *', deliver: 'origin',
  });

  async function load() {
    try {
      const data = await api.getJobs();
      setJobs(data?.jobs || data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function createJob() {
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
    } catch (err) { console.error(err); }
  }

  return (
    <div className="jobs-view">
      <div className="jobs-header">
        <h2>Cron Jobs ({jobs.length})</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="create-btn">+ New Job</button>
      </div>

      {showCreate && (
        <div className="job-create-form">
          <input placeholder="Job name" value={newJob.name}
            onChange={e => setNewJob({...newJob, name: e.target.value})} />
          <textarea placeholder="Prompt (self-contained)..." value={newJob.prompt}
            onChange={e => setNewJob({...newJob, prompt: e.target.value})} rows={4} />
          <input placeholder="Schedule (cron or '30m', 'every 2h')" value={newJob.schedule}
            onChange={e => setNewJob({...newJob, schedule: e.target.value})} />
          <select value={newJob.deliver} onChange={e => setNewJob({...newJob, deliver: e.target.value})}>
            <option value="origin">Origin (current chat)</option>
            <option value="local">Local (save only)</option>
            <option value="telegram">Telegram Home</option>
          </select>
          <button onClick={createJob}>Create</button>
        </div>
      )}

      <div className="jobs-list">
        {jobs.map(job => (
          <div key={job.id} className={`job-card ${job.enabled ? '' : 'disabled'}`}>
            <div className="job-header">
              <span className="job-name">{job.name || job.id}</span>
              <span className="job-schedule">{job.schedule}</span>
            </div>
            <div className="job-prompt">{job.prompt?.slice(0, 120)}...</div>
            <div className="job-meta">
              <span>Deliver: {job.deliver}</span>
              {job.last_run && <span>Last: {new Date(job.last_run).toLocaleString()}</span>}
              {job.next_run && <span>Next: {new Date(job.next_run).toLocaleString()}</span>}
            </div>
            <div className="job-actions">
              {job.enabled ? (
                <button onClick={() => api.pauseJob(job.id).then(load)}>⏸ Pause</button>
              ) : (
                <button onClick={() => api.resumeJob(job.id).then(load)}>▶ Resume</button>
              )}
              <button onClick={() => api.runJobNow(job.id).then(load)}>⚡ Run Now</button>
              <button onClick={() => { if(confirm('Delete?')) api.deleteJob(job.id).then(load); }}>🗑 Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2:** Add to sidebar: `{ id: 'jobs', label: 'Jobs', icon: '⏰' }`

**Step 3:** Add to App.tsx, add CSS.

**Step 4:** Verify — see existing cron jobs, create/pause/run/delete works.

**Step 5:** Commit.

---

## Phase 4: Sessions & Search

### Task 4.1: Enhanced Sessions View

**Objective:** Upgrade the sessions view with full-text search, source filtering, pagination, message preview, delete, rename.

**Files:**
- Modify: `src/components/SessionsView.tsx`
- Modify: `src/styles/app.css`

**Step 1:** Add search bar, source filter dropdown (telegram, discord, cli, cron, tui), pagination (limit/offset).

**Step 2:** Add session stats summary at top (total, by source).

**Step 3:** Add right-click context menu: resume, rename, delete, export.

**Step 4:** Verify — search filters sessions, source filter works, pagination loads more.

**Step 5:** Commit.

---

## Phase 5: Config & Profile Management

### Task 5.1: Config Editor View

**Objective:** Form-based config editor that reads `/api/config` and allows editing key fields (model, provider, terminal, memory, etc.).

**Files:**
- Create: `src/components/ConfigView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles/app.css`

**Step 1:** Create ConfigView that:
- Loads config from `/api/config`
- Groups fields by section (model, terminal, memory, delegation, etc.)
- Renders booleans as toggles, known enums as dropdowns, everything else as text inputs
- Save button sends `PATCH /api/config` or `PUT /api/config`

**Step 2:** Add to sidebar: `{ id: 'config', label: 'Config', icon: '🔧' }`

**Step 3:** Verify — load config, edit a field, save, confirm change persisted.

**Step 4:** Commit.

---

### Task 5.2: Profile Manager

**Objective:** Enhanced profile switching with create/clone, view details, model info per profile.

**Files:**
- Modify: `src/components/Sidebar.tsx` — enhance profile dropdown
- Create: `src/components/ProfileManager.tsx`

**Step 1:** Add create profile button in profile dropdown (calls `POST /api/profiles` or equivalent).

**Step 2:** Show model + provider + gateway status per profile in a richer card layout.

**Step 3:** Add clone profile option.

**Step 4:** Verify — create a test profile, switch to it, confirm isolation.

**Step 5:** Commit.

---

## Phase 6: Polish & Integration

### Task 6.1: Keyboard shortcuts

**Objective:** Global keyboard shortcuts for common actions.

- `Ctrl+1` through `Ctrl+9` — switch views
- `Ctrl+K` — command palette (search across all views)
- `Ctrl+N` — new chat session
- `Ctrl+Shift+K` — toggle kanban
- `Escape` — close modals/panels

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/App.tsx`

**Step 1-3:** Create hook, wire into App, test each shortcut.

**Step 4:** Commit.

---

### Task 6.2: Notification toasts

**Objective:** Toast notifications for events — job completed, error, update available.

**Files:**
- Create: `src/components/Toasts.tsx`
- Create: `src/hooks/useToasts.ts`
- Modify: `src/App.tsx`

**Step 1-3:** Create toast system, wire into WS events and job status changes.

**Step 4:** Commit.

---

### Task 6.3: Webhooks panel

**Objective:** View and manage webhook subscriptions.

**Files:**
- Create: `src/components/WebhooksView.tsx`
- Modify: `src/App.tsx`

**Step 1:** Create WebhooksView that loads from `/api/webhooks`, shows subscriptions, allows create/delete/test.

**Step 2:** Add to sidebar: `{ id: 'webhooks', label: 'Webhooks', icon: '🔗' }`

**Step 3:** Commit.

---

### Task 6.4: Final polish

**Objective:** Visual consistency, loading states, error handling, responsive layout.

- Add loading skeletons for all views
- Add error boundaries per view
- Ensure all views handle empty state gracefully
- Update sidebar to show badges (e.g., job count, session count)
- Update version number to 2.0.0

**Step 1-4:** Polish each view, test edge cases.

**Step 5:** Commit + tag.

```bash
git add -A && git commit -m "feat: Jarvis Desktop 2.0 — Agentic OS"
git tag v2.0.0
```

---

## New Sidebar Layout (Target)

```
┌─────────────────────────┐
│ J  Jarvis        ●     │
├─────────────────────────┤
│ 📊 Status               │
│ 💬 Chat                 │
│ 🧠 Memory               │
│ 🎓 Skills               │
│ ⏰ Jobs                 │
│ 🕐 Sessions             │
│ 📋 Kanban               │
│ 🔧 Config               │
│ 🔗 Webhooks             │
│ ⚙️ Settings             │
├─────────────────────────┤
│ [default]          ▶    │
└─────────────────────────┘
```

## New IPC Handlers Needed

| Handler | Purpose | Port |
|---------|---------|------|
| `jobs:request` | Jobs API CRUD | 8642 |
| `file:read` | Read files on server (memory.md, SKILL.md) | via WS 9119 |

## API Endpoints to Verify During Implementation

| Endpoint | Needed For | Status |
|----------|-----------|--------|
| `GET /api/skills` | Skills list | ✅ Working |
| `GET /api/skills/<name>` | Skill content | ❓ Test during impl |
| `GET /api/memory` | Memory info | ✅ Working |
| `GET /api/config` | Config editor | ✅ Working |
| `PATCH /api/config` | Config save | ❓ Test during impl |
| `GET /api/jobs` | Jobs list | ✅ Working (8642) |
| `POST /api/jobs` | Create job | ✅ Working (8642) |
| `GET /api/webhooks` | Webhooks list | ✅ Working |

## Build & Deploy

After each phase:
1. `cd /home/jason/jarvis-desktop && npm run build:win`
2. `gh release create vX.Y.Z dist/*.exe dist/latest.yml --notes "..."`
3. Desktop auto-updates on next launch

---

## Estimated Effort

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1. Foundation | 3 tasks | 2-3 hours |
| 2. Memory & Skills | 2 tasks | 1-2 hours |
| 3. Jobs & Cron | 1 task | 1 hour |
| 4. Sessions & Search | 1 task | 1 hour |
| 5. Config & Profile | 2 tasks | 1-2 hours |
| 6. Polish | 4 tasks | 2-3 hours |
| **Total** | **13 tasks** | **8-12 hours** |