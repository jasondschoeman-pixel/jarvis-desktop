// src/App.tsx — Jarvis Desktop Agentic OS
import { useState, useEffect, useRef } from 'react';
import type { View, Profile, KanbanTask, KanbanBoard, UpdateStatus, StatusInfo } from './types';
import { useWebSocket } from './hooks/useWebSocket';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { KanbanView } from './components/KanbanView';
import { SessionsView } from './components/SessionsView';
import { SettingsView } from './components/SettingsView';
import { StatusView } from './components/StatusView';
import { MemoryView } from './components/MemoryView';
import { SkillsView } from './components/SkillsView';
import { JobsView } from './components/JobsView';
import { ConfigView } from './components/ConfigView';
import { WebhooksView } from './components/WebhooksView';

export default function App() {
  const [view, setView] = useState<View>('status');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState('default');
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>([]);
  const [kanbanBoards, setKanbanBoards] = useState<KanbanBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState('default');
  const [kanbanStats, setKanbanStats] = useState<Record<string, number>>({});
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const ws = useWebSocket(activeProfile);
  const { connected, connecting, messages, setMessages, input, setInput, streaming,
    sessions, error, setError, resuming, attachments,
    sendMessage, stopStreaming, resumeSession, switchProfile, handleFileSelect, removeAttachment,
    loadSessions } = ws;

  // Init: fetch profiles + auto-updater
  useEffect(() => {
    (async () => {
      try {
        const profilesData = await window.jarvis.api.request('GET', '/api/profiles');
        if (profilesData?.profiles) setProfiles(profilesData.profiles);
      } catch (err) {
        console.error('Failed to fetch profiles:', err);
      }
    })();

    let cleanupUpdate: (() => void) | undefined;
    if (window.jarvis.update) {
      cleanupUpdate = window.jarvis.update.onStatus((data: any) => setUpdateStatus(data));
    }
    return () => { if (cleanupUpdate) cleanupUpdate(); };
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Keyboard shortcuts: Ctrl+1..9 to switch views
  useEffect(() => {
    const views: View[] = ['status', 'chat', 'memory', 'skills', 'jobs', 'sessions', 'kanban', 'config', 'webhooks'];
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < views.length) {
          e.preventDefault();
          setView(views[idx]);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Load kanban when view changes
  useEffect(() => {
    if (view === 'kanban') loadKanban();
  }, [view, activeBoard]);

  async function loadKanban() {
    try {
      const [boardsData, tasksData, statsData] = await Promise.all([
        window.jarvis.kanban.request('GET', '/api/boards'),
        window.jarvis.kanban.request('GET', `/api/tasks?board=${activeBoard}`),
        window.jarvis.kanban.request('GET', `/api/stats?board=${activeBoard}`),
      ]);
      if (boardsData?.boards) setKanbanBoards(boardsData.boards);
      if (tasksData?.tasks) setKanbanTasks(tasksData.tasks);
      if (statsData?.stats) setKanbanStats(statsData.stats);
    } catch (err) {
      console.error('Failed to load kanban:', err);
    }
  }

  function handleSwitchProfile(name: string) {
    setActiveProfile(name);
    switchProfile(name);
  }

  if (connecting) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>Connecting to Jarvis...</p>
      </div>
    );
  }

  if (error && !connected) {
    return (
      <div className="app-error">
        <h2>Connection Error</h2>
        <p>{error}</p>
        <button onClick={() => {
          setError(null);
          window.location.reload();
        }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        view={view}
        setView={setView}
        profiles={profiles}
        activeProfile={activeProfile}
        switchProfile={handleSwitchProfile}
        connected={connected}
      />

      <div className="main-content">
        {view === 'status' && <StatusView />}
        {view === 'chat' && (
          <ChatView
            messages={messages}
            input={input}
            setInput={setInput}
            sendMessage={sendMessage}
            streaming={streaming}
            messagesEndRef={messagesEndRef}
            activeProfile={activeProfile}
            onStop={stopStreaming}
            connected={connected}
            attachments={attachments}
            onFileSelect={handleFileSelect}
            onRemoveAttachment={removeAttachment}
          />
        )}
        {view === 'kanban' && (
          <KanbanView
            tasks={kanbanTasks}
            boards={kanbanBoards}
            activeBoard={activeBoard}
            setActiveBoard={setActiveBoard}
            stats={kanbanStats}
            refresh={loadKanban}
          />
        )}
        {view === 'sessions' && (
          <SessionsView
            sessions={sessions}
            refresh={() => loadSessions()}
            onResume={resumeSession}
            resuming={resuming}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            profiles={profiles}
            activeProfile={activeProfile}
            statusInfo={null}
            updateStatus={updateStatus}
            onCheckUpdate={() => window.jarvis.update?.check()}
            onInstallUpdate={() => window.jarvis.update?.install()}
          />
        )}
        {view === 'memory' && <MemoryView />}
        {view === 'skills' && <SkillsView />}
        {view === 'jobs' && <JobsView />}
        {view === 'config' && <ConfigView />}
        {view === 'webhooks' && <WebhooksView />}
      </div>
    </div>
  );
}