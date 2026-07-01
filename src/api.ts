// src/api.ts — API client wrapping window.jarvis IPC bridge

declare global {
  interface Window {
    jarvis: {
      auth: { login: () => Promise<any> };
      api: { request: (method: string, path: string, body?: any) => Promise<any> };
      kanban: { request: (method: string, path: string, body?: any) => Promise<any> };
      jobs: { request: (method: string, path: string, body?: any) => Promise<any> };
      files: {
        read: (filePath: string) => Promise<{ ok: boolean; content?: string; error?: string; size?: number; path?: string }>;
        write: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string; size?: number; path?: string }>;
        list: (dirPath: string) => Promise<{ ok: boolean; entries?: any[]; error?: string }>;
      };
      ws: { connect: (profile?: string) => Promise<any> };
      update: {
        check: () => Promise<any>;
        install: () => Promise<any>;
        onStatus: (callback: (data: any) => void) => () => void;
      };
    };
  }
}

export class HermesAPI {
  get jarvis() { return window.jarvis; }

  // Dashboard REST (9120) — cookie auth via IPC
  async getProfiles() { return this.jarvis.api.request('GET', '/api/profiles'); }
  async getSessions(limit = 50, offset = 0, source?: string) {
    let path = `/api/sessions?limit=${limit}&offset=${offset}`;
    if (source) path += `&source=${source}`;
    return this.jarvis.api.request('GET', path);
  }
  async getSessionStats() { return this.jarvis.api.request('GET', '/api/sessions/stats'); }
  async getSkills() { return this.jarvis.api.request('GET', '/api/skills'); }
  async getConfig() { return this.jarvis.api.request('GET', '/api/config'); }
  async getMemory() { return this.jarvis.api.request('GET', '/api/memory'); }
  async getStatus() { return this.jarvis.api.request('GET', '/api/status'); }
  async getWebhooks() { return this.jarvis.api.request('GET', '/api/webhooks'); }

  // API Server (8642) — bearer auth via IPC
  async getJobs() { return this.jarvis.jobs?.request('GET', '/api/jobs'); }
  async createJob(body: any) { return this.jarvis.jobs?.request('POST', '/api/jobs', body); }
  async updateJob(id: string, body: any) { return this.jarvis.jobs?.request('PATCH', `/api/jobs/${id}`, body); }
  async deleteJob(id: string) { return this.jarvis.jobs?.request('DELETE', `/api/jobs/${id}`); }
  async pauseJob(id: string) { return this.jarvis.jobs?.request('POST', `/api/jobs/${id}/pause`); }
  async resumeJob(id: string) { return this.jarvis.jobs?.request('POST', `/api/jobs/${id}/resume`); }
  async runJobNow(id: string) { return this.jarvis.jobs?.request('POST', `/api/jobs/${id}/run`); }

  // Kanban proxy (3456)
  async getKanbanBoards() { return this.jarvis.kanban.request('GET', '/api/boards'); }
  async getKanbanTasks(board: string) { return this.jarvis.kanban.request('GET', `/api/tasks?board=${board}`); }
  async getKanbanStats(board: string) { return this.jarvis.kanban.request('GET', `/api/stats?board=${board}`); }
  async createKanbanTask(title: string, board: string) { return this.jarvis.kanban.request('POST', '/api/tasks', { title, board }); }
  async completeKanbanTask(taskId: string) { return this.jarvis.kanban.request('POST', `/api/tasks/${taskId}/complete`); }

  // File operations (direct filesystem via IPC)
  async readFile(filePath: string) { return this.jarvis.files.read(filePath); }
  async writeFile(filePath: string, content: string) { return this.jarvis.files.write(filePath, content); }
  async listDir(dirPath: string) { return this.jarvis.files.list(dirPath); }
}

export const api = new HermesAPI();