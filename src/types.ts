// src/types.ts — Shared TypeScript interfaces for Jarvis Desktop

export interface Profile {
  name: string;
  model: string | null;
  provider: string | null;
  gateway_running: boolean;
  skill_count: number;
  is_default: boolean;
  description: string;
}

export interface Session {
  id: string;
  title: string;
  preview: string;
  model: string;
  message_count: number;
  last_active: number;
  archived: boolean;
  source?: string;
}

export interface SessionStats {
  total: number;
  active_store: number;
  archived: number;
  messages: number;
  by_source: Record<string, number>;
}

export interface KanbanTask {
  id: string;
  status: string;
  assignee: string;
  title: string;
}

export interface KanbanBoard {
  slug: string;
  name: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinkingContent?: string;
  timestamp: number;
  pending?: boolean;
  error?: string;
  kind?: 'text' | 'tool' | 'clarify' | 'approval' | 'background';
  toolName?: string;
}

export interface PendingAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  status: 'uploading' | 'attached' | 'error';
  error?: string;
  previewUrl?: string;
}

export interface Skill {
  name: string;
  description: string;
  category: string | null;
  enabled: boolean;
}

export interface MemoryProvider {
  name: string;
  description: string;
  configured: boolean;
}

export interface MemoryInfo {
  active: string;
  providers: MemoryProvider[];
  builtin_files?: {
    memory: number;
    user: number;
  };
}

export interface CronJob {
  id: string;
  name?: string;
  prompt?: string;
  schedule: string;
  enabled: boolean;
  deliver?: string;
  last_run?: string;
  next_run?: string;
  model?: string;
  skills?: string[];
}

export interface StatusInfo {
  version: string;
  release_date: string;
  config_version: number;
  latest_config_version: number;
  can_update_hermes: boolean;
  gateway_running: boolean;
  gateway_state: string;
  gateway_platforms: Record<string, {
    state: string;
    updated_at: string | null;
    error_code: string | null;
    error_message: string | null;
  }>;
  gateway_exit_reason: string | null;
  gateway_updated_at: string;
  active_agents: number;
  gateway_busy: boolean;
  active_sessions: number;
  auth_required: boolean;
  auth_providers: string[];
}

export interface UpdateStatus {
  status: string;
  message: string;
  version?: string;
  percent?: number;
}

export type View = 'status' | 'chat' | 'memory' | 'skills' | 'jobs' | 'sessions' | 'kanban' | 'config' | 'webhooks' | 'settings';