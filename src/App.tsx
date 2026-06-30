import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Types ──────────────────────────────────────────────────────────────────

interface Profile {
  name: string;
  model: string | null;
  provider: string | null;
  gateway_running: boolean;
  skill_count: number;
  is_default: boolean;
  description: string;
}

interface Session {
  id: string;
  title: string;
  preview: string;
  model: string;
  message_count: number;
  last_active: number;
  archived: boolean;
}

interface KanbanTask {
  id: string;
  status: string;
  assignee: string;
  title: string;
}

interface KanbanBoard {
  slug: string;
  name: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinkingContent?: string;  // Separate field for reasoning/thinking text
  timestamp: number;
  pending?: boolean;
  error?: string;
  kind?: 'text' | 'tool' | 'clarify' | 'approval' | 'background';
  toolName?: string;
}

interface PendingAttachment {
  id: string;
  name: string;
  size: number;
  type: string;       // mime type
  dataUrl: string;    // base64 data URL
  status: 'uploading' | 'attached' | 'error';
  error?: string;
  previewUrl?: string; // for image thumbnails
}

type View = 'chat' | 'kanban' | 'sessions' | 'settings';

const MAX_RECONNECT_ATTEMPTS = 10;

// ── API Helpers ────────────────────────────────────────────────────────────

declare global {
  interface Window {
    jarvis: {
      auth: { login: () => Promise<any> };
      api: { request: (method: string, path: string, body?: any) => Promise<any> };
      kanban: { request: (method: string, path: string, body?: any) => Promise<any> };
      ws: { connect: (profile?: string) => Promise<any> };
      update: {
        check: () => Promise<any>;
        install: () => Promise<any>;
        onStatus: (callback: (data: any) => void) => () => void;
      };
    };
  }
}

// ── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>('chat');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState('default');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>([]);
  const [kanbanBoards, setKanbanBoards] = useState<KanbanBoard[]>([]);
  const [activeBoard, setActiveBoard] = useState('default');
  const [kanbanStats, setKanbanStats] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{ status: string; message: string; version?: string; percent?: number } | null>(null);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [resuming, setResuming] = useState(false);  // Loading state for session resume
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingCreateIdRef = useRef<string | null>(null);
  const pendingResumeIdRef = useRef<string | null>(null);  // Track session.resume response
  const pendingListIdRef = useRef<string | null>(null);  // Track session.list response
  const activeProfileRef = useRef('default');
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const streamingMsgIdRef = useRef<string | null>(null);  // Bug 1 fix: track streaming message by ID
  const msgCounterRef = useRef(0);  // Bug 11 fix: unique IDs
  const loadSessionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAttachMapRef = useRef<Record<string, string>>({});  // attachId → attId

  // Bug 11 fix: unique message ID generator
  function nextMsgId(prefix: string): string {
    msgCounterRef.current += 1;
    return `${prefix}-${msgCounterRef.current}-${Date.now()}`;
  }

  // ── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    init();

    // Auto-updater: listen for status events from main process
    let cleanupUpdate: (() => void) | undefined;
    if (window.jarvis.update) {
      cleanupUpdate = window.jarvis.update.onStatus((data) => {
        setUpdateStatus(data);
      });
    }

    // Bug 8 fix: cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (cleanupUpdate) cleanupUpdate();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (loadSessionsTimerRef.current) {
        clearTimeout(loadSessionsTimerRef.current);
        loadSessionsTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;  // Prevent reconnect attempt on intentional close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  async function init() {
    try {
      // Login
      const loginResult = await window.jarvis.auth.login();
      if (!loginResult.ok) {
        setError('Login failed: ' + (loginResult.error || 'unknown'));
        setConnecting(false);
        return;
      }

      // Fetch profiles
      const profilesData = await window.jarvis.api.request('GET', '/api/profiles');
      if (profilesData?.profiles) {
        setProfiles(profilesData.profiles);
      }

      // Set default profile ref
      activeProfileRef.current = activeProfile;

      // Fetch status
      const statusData = await window.jarvis.api.request('GET', '/api/status');
      setStatusInfo(statusData);

      // Connect WebSocket — socket.onopen will call loadSessions() for the active profile
      await connectWs();

      // Bug 7 fix: Don't set connected=true here — socket.onopen handles it
      if (!isMountedRef.current) return;
      setConnecting(false);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Connection failed');
      setConnecting(false);
    }
  }

  async function connectWs(profile?: string) {
    try {
      const result = await window.jarvis.ws.connect(profile);
      if (!result.ok) {
        if (isMountedRef.current) setError('WebSocket connection failed: ' + result.error);
        return;
      }

      if (wsRef.current) {
        wsRef.current.onclose = null;  // Bug 8 fix: prevent reconnect from old socket
        wsRef.current.close();
      }

      const socket = new WebSocket(result.wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        console.log('WebSocket connected');
        if (!isMountedRef.current) return;
        setConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        // Bug 14 fix: reset streaming flag on new connection
        setStreaming(false);
        streamingRef.current = false;
        streamingMsgIdRef.current = null;
        // Create a new session with the active profile
        const createId = `create-${nextMsgId('create')}`;
        pendingCreateIdRef.current = createId;
        socket.send(JSON.stringify({
          jsonrpc: '2.0',
          id: createId,
          method: 'session.create',
          params: { profile: profile || activeProfileRef.current },
        }));
        // Load sessions for this profile now that WS is connected
        loadSessions();
      };

      socket.onmessage = (event) => {
        handleWsMessage(event.data);
      };

      socket.onclose = () => {
        console.log('WebSocket closed');
        if (!isMountedRef.current) return;
        setConnected(false);
        // Bug 14 fix: reset streaming on disconnect
        setStreaming(false);
        streamingRef.current = false;
        streamingMsgIdRef.current = null;

        // Bug 9 fix: max reconnect attempts
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error('Max reconnect attempts reached, giving up');
          if (isMountedRef.current) {
            setError('Connection lost — max reconnection attempts reached. Click Retry.');
          }
          return;
        }

        // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(2000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
        reconnectTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) connectWs(activeProfileRef.current);
        }, delay);
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
      };
    } catch (err: any) {
      if (isMountedRef.current) {
        setError('WebSocket error: ' + err.message);
      }
    }
  }

  // Bug 1 fix: update message by ID instead of array position
  const updateMessageById = useCallback((id: string, updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === id);
      if (idx === -1) return prev;
      const msgs = [...prev];
      msgs[idx] = updater(msgs[idx]);
      return msgs;
    });
  }, []);

  // Bug 12 fix: debounced session loading
  const debouncedLoadSessions = useCallback(() => {
    if (loadSessionsTimerRef.current) clearTimeout(loadSessionsTimerRef.current);
    loadSessionsTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) loadSessions();
    }, 3000);
  }, []);

  function handleWsMessage(raw: string) {
    try {
      const frame = JSON.parse(raw);

      // JSON-RPC response (has id) — check for session.create or session.resume response
      if (frame.id != null) {
        if (frame.id === pendingCreateIdRef.current) {
          if (frame.result?.session_id) {
            sessionIdRef.current = frame.result.session_id;
            console.log('Session created:', sessionIdRef.current);
          }
          pendingCreateIdRef.current = null;
        }
        // Capture the new live session_id from session.resume response
        if (frame.id === pendingResumeIdRef.current) {
          if (frame.result?.session_id) {
            sessionIdRef.current = frame.result.session_id;
            console.log('Session resumed, live session_id:', sessionIdRef.current);
          }
          // session.resume returns messages in the result — load them into chat
          if (frame.result?.messages) {
            const history: ChatMessage[] = [];
            for (const m of frame.result.messages) {
              if (m.role === 'user' || m.role === 'assistant') {
                history.push({
                  id: nextMsgId(`hist-${m.role}`),
                  role: m.role,
                  // Server uses 'text' not 'content' for message text
                  content: m.text || m.content || '',
                  // Server uses 'reasoning'/'reasoning_content' for thinking
                  thinkingContent: m.reasoning || m.reasoning_content || '',
                  timestamp: m.timestamp || Date.now() / 1000,
                  kind: 'text',
                });
              }
            }
            setMessages(history);
          }
          if (frame.error) {
            setMessages(prev => [...prev, {
              id: nextMsgId('resume-err'),
              role: 'system',
              content: `❌ Failed to resume: ${frame.error.message || 'Unknown error'}`,
              timestamp: Date.now() / 1000,
              error: frame.error.message,
            }]);
          }
          pendingResumeIdRef.current = null;
        }
        // Capture session.list response (profile-scoped sessions)
        if (frame.id === pendingListIdRef.current) {
          if (frame.result?.sessions) {
            // Map WS session format to our Session interface
            const mapped: Session[] = frame.result.sessions.map((s: any) => ({
              id: s.id,
              title: s.title || '',
              preview: s.preview || '',
              model: '',
              message_count: s.message_count || 0,
              last_active: s.started_at || s.last_active || 0,
              archived: false,
            }));
            setSessions(mapped);
          }
          pendingListIdRef.current = null;
        }
        // Handle file/image attachment responses
        const attId = pendingAttachMapRef.current[frame.id];
        if (attId) {
          if (frame.result?.attached) {
            setAttachments(prev => prev.map(a =>
              a.id === attId ? { ...a, status: 'attached' } : a
            ));
          } else if (frame.error) {
            setAttachments(prev => prev.map(a =>
              a.id === attId ? { ...a, status: 'error', error: frame.error.message } : a
            ));
            setMessages(prev => [...prev, {
              id: nextMsgId('att-err'),
              role: 'system',
              content: `❌ Attachment failed: ${frame.error.message}`,
              timestamp: Date.now() / 1000,
            }]);
          }
          delete pendingAttachMapRef.current[frame.id];
        }
        // Show JSON-RPC errors to the user
        if (frame.error) {
          setMessages(prev => [...prev, {
            id: nextMsgId('rpc-err'),
            role: 'system',
            content: `❌ ${frame.error.message || 'Unknown error'} (code: ${frame.error.code})`,
            timestamp: Date.now() / 1000,
            error: frame.error.message,
          }]);
          setStreaming(false);
          streamingRef.current = false;
          streamingMsgIdRef.current = null;
        }
        return;
      }

      // Event
      if (frame.method === 'event' && frame.params) {
        const event = frame.params;
        switch (event.type) {
          case 'message.start': {
            setStreaming(true);
            streamingRef.current = true;
            const msgId = nextMsgId('msg');
            streamingMsgIdRef.current = msgId;  // Bug 1 fix: track by ID
            setMessages(prev => [...prev, {
              id: msgId,
              role: 'assistant',
              content: '',
              timestamp: Date.now() / 1000,
              pending: true,
              kind: 'text',
            }]);
            break;
          }

          case 'message.delta':
            // Bug 1 fix: update by streamingMsgIdRef, not array position
            if (streamingMsgIdRef.current) {
              const text = event.payload?.text || event.payload?.content || '';
              updateMessageById(streamingMsgIdRef.current, (msg) => ({
                ...msg,
                content: msg.content + text,
              }));
            }
            break;

          case 'message.complete':
            // Bug 1 fix: update by streamingMsgIdRef
            if (streamingMsgIdRef.current) {
              updateMessageById(streamingMsgIdRef.current, (msg) => ({
                ...msg,
                pending: false,
              }));
            } else {
              // Fallback: mark any still-pending assistant message as complete
              setMessages(prev => {
                const msgs = [...prev];
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i].role === 'assistant' && msgs[i].pending) {
                    msgs[i] = { ...msgs[i], pending: false };
                    break;
                  }
                }
                return msgs;
              });
            }
            streamingMsgIdRef.current = null;
            setStreaming(false);
            streamingRef.current = false;
            // Bug 12 fix: debounced session refresh
            debouncedLoadSessions();
            break;

          // Bug 3 fix: handle thinking/reasoning deltas — store in separate field
          case 'thinking.delta':
          case 'reasoning.delta': {
            const text = event.payload?.text || '';
            if (streamingMsgIdRef.current) {
              updateMessageById(streamingMsgIdRef.current, (msg) => ({
                ...msg,
                thinkingContent: (msg.thinkingContent || '') + text,
              }));
            }
            break;
          }

          case 'tool.start':
            setMessages(prev => [...prev, {
              id: nextMsgId('tool'),
              role: 'system',
              content: `🔧 ${event.payload?.name || 'Tool'}: ${event.payload?.description || 'Running...'}`,
              timestamp: Date.now() / 1000,
              kind: 'tool',
              toolName: event.payload?.name,
              pending: true,
            }]);
            break;

          // Bug 4 fix: handle tool.progress
          case 'tool.progress': {
            const toolName = event.payload?.name;
            const progress = event.payload?.progress || '';
            // Update the most recent matching tool message
            setMessages(prev => {
              const msgs = [...prev];
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].kind === 'tool' && msgs[i].toolName === toolName && msgs[i].pending) {
                  msgs[i] = {
                    ...msgs[i],
                    content: `🔧 ${toolName}: ${progress}`,
                  };
                  break;
                }
              }
              return msgs;
            });
            break;
          }

          case 'tool.complete': {
            const toolName = event.payload?.name;
            // Update the most recent matching tool message to completed
            setMessages(prev => {
              const msgs = [...prev];
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].kind === 'tool' && msgs[i].toolName === toolName && msgs[i].pending) {
                  const result = event.payload?.result || '';
                  const truncated = result.length > 200 ? result.slice(0, 200) + '...' : result;
                  msgs[i] = {
                    ...msgs[i],
                    content: `✅ ${toolName}: ${truncated || 'completed'}`,
                    pending: false,
                  };
                  break;
                }
              }
              return msgs;
            });
            break;
          }

          // Bug 5 fix: handle clarify and approval requests
          case 'clarify.request':
            setMessages(prev => [...prev, {
              id: nextMsgId('clarify'),
              role: 'system',
              content: `❓ ${event.payload?.question || 'Agent needs clarification'}`,
              timestamp: Date.now() / 1000,
              kind: 'clarify',
            }]);
            setStreaming(false);
            streamingRef.current = false;
            streamingMsgIdRef.current = null;
            break;

          case 'approval.request':
            setMessages(prev => [...prev, {
              id: nextMsgId('approval'),
              role: 'system',
              content: `⚠️ Approval needed: ${event.payload?.command || 'Unknown command'}`,
              timestamp: Date.now() / 1000,
              kind: 'approval',
            }]);
            setStreaming(false);
            streamingRef.current = false;
            streamingMsgIdRef.current = null;
            break;

          // Bug 6 fix: handle background task completion
          case 'background.complete':
            setMessages(prev => [...prev, {
              id: nextMsgId('bg'),
              role: 'system',
              content: `🔄 Background task complete: ${event.payload?.result || ''}`,
              timestamp: Date.now() / 1000,
              kind: 'background',
            }]);
            break;

          case 'error':
            setMessages(prev => [...prev, {
              id: nextMsgId('err'),
              role: 'system',
              content: `❌ Error: ${event.payload?.message || 'Unknown error'}`,
              timestamp: Date.now() / 1000,
              error: event.payload?.message,
            }]);
            setStreaming(false);
            streamingRef.current = false;
            streamingMsgIdRef.current = null;
            break;

          case 'gateway.ready':
            console.log('Gateway ready');
            break;

          // Bug 2 fix: read session_id from event.payload, not event
          case 'session.info':
            if (event.payload?.session_id && !sessionIdRef.current) {
              sessionIdRef.current = event.payload.session_id;
              console.log('Session ID from info event:', sessionIdRef.current);
            }
            break;

          default:
            console.log('Unhandled event type:', event.type, event.payload);
        }
      }
    } catch (err) {
      // Not JSON, ignore
    }
  }

  // ── Load Data ────────────────────────────────────────────────────────────

  // Load sessions via WebSocket (profile-scoped) with REST fallback
  async function loadSessions() {
    // Try WebSocket first (supports profile scoping)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const listId = nextMsgId('list');
      pendingListIdRef.current = listId;
      try {
        wsRef.current.send(JSON.stringify({
          jsonrpc: '2.0',
          id: listId,
          method: 'session.list',
          params: {
            profile: activeProfileRef.current,
            limit: 50,
          },
        }));
      } catch (err) {
        console.error('Failed to send session.list:', err);
        pendingListIdRef.current = null;
        // Fallback to REST API
        await loadSessionsViaRest();
      }
      return;
    }
    // Fallback to REST API if WebSocket not connected
    await loadSessionsViaRest();
  }

  async function loadSessionsViaRest() {
    try {
      const data = await window.jarvis.api.request('GET', '/api/sessions?limit=20&archived=exclude');
      if (!isMountedRef.current) return;
      if (data?.sessions) setSessions(data.sessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }

  // ── Resume Session ──────────────────────────────────────────────────────

  async function resumeSession(sessionId: string) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Cannot resume — WebSocket not connected');
      return;
    }

    setResuming(true);
    try {
      // Send session.resume on WebSocket — the response handler captures
      // the new live session_id AND loads message history from the result
      const resumeId = nextMsgId('resume');
      pendingResumeIdRef.current = resumeId;
      wsRef.current.send(JSON.stringify({
        jsonrpc: '2.0',
        id: resumeId,
        method: 'session.resume',
        params: {
          session_id: sessionId,
          profile: activeProfileRef.current,
        },
      }));

      // Clear current messages (history will be loaded by the response handler)
      setMessages([]);
      setStreaming(false);
      streamingRef.current = false;
      streamingMsgIdRef.current = null;
      setView('chat');
      setError(null);
    } catch (err: any) {
      if (isMountedRef.current) {
        setError('Failed to resume session: ' + (err.message || 'unknown'));
      }
    } finally {
      if (isMountedRef.current) setResuming(false);
    }
  }

  async function loadKanban() {
    try {
      const [boardsData, tasksData, statsData] = await Promise.all([
        window.jarvis.kanban.request('GET', '/api/boards'),
        window.jarvis.kanban.request('GET', `/api/tasks?board=${activeBoard}`),
        window.jarvis.kanban.request('GET', `/api/stats?board=${activeBoard}`),
      ]);
      if (!isMountedRef.current) return;
      if (boardsData?.boards) setKanbanBoards(boardsData.boards);
      if (tasksData?.tasks) setKanbanTasks(tasksData.tasks);
      if (statsData?.stats) setKanbanStats(statsData.stats);
    } catch (err) {
      console.error('Failed to load kanban:', err);
    }
  }

  // ── Profile Switch ───────────────────────────────────────────────────────

  async function switchProfile(name: string) {
    setActiveProfile(name);
    activeProfileRef.current = name;
    setMessages([]);
    setStreaming(false);
    streamingRef.current = false;
    streamingMsgIdRef.current = null;
    sessionIdRef.current = null;
    // Clear pending reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    await connectWs(name);
  }

  // ── Send Message ────────────────────────────────────────────────────────

  const streamingRef = useRef(false);  // Sync ref to prevent race conditions

  function sendMessage() {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (streamingRef.current) return;  // Use ref, not state — prevents double-send race
    if (!sessionIdRef.current) {
      setMessages(prev => [...prev, {
        id: nextMsgId('err'),
        role: 'system',
        content: '⚠️ No active session — please wait for connection to establish.',
        timestamp: Date.now() / 1000,
      }]);
      return;
    }

    const text = input.trim();
    setInput('');

    // Build display text (include attachment names if any)
    const attachedNames = attachments
      .filter(a => a.status === 'attached')
      .map(a => a.name);
    const displayText = attachedNames.length > 0
      ? `${text}\n\n[Attached: ${attachedNames.join(', ')}]`
      : text;

    setMessages(prev => [...prev, {
      id: nextMsgId('user'),
      role: 'user',
      content: displayText,
      timestamp: Date.now() / 1000,
      kind: 'text',
    }]);

    // Clear attachments after sending
    setAttachments([]);
    pendingAttachMapRef.current = {};

    const request = {
      jsonrpc: '2.0',
      id: nextMsgId('chat'),
      method: 'prompt.submit',
      params: {
        text,
        session_id: sessionIdRef.current,
      },
    };

    // Bug 13 fix: try/catch around ws.send()
    try {
      wsRef.current.send(JSON.stringify(request));
      setStreaming(true);
      streamingRef.current = true;  // Keep ref in sync
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: nextMsgId('send-err'),
        role: 'system',
        content: `❌ Failed to send message: ${err.message}`,
        timestamp: Date.now() / 1000,
        error: err.message,
      }]);
    }
  }

  // Bug 15 fix: stop/cancel streaming
  function stopStreaming() {
    setStreaming(false);
    streamingRef.current = false;
    streamingMsgIdRef.current = null;
    // Mark any pending messages as complete
    setMessages(prev => prev.map(msg =>
      msg.pending ? { ...msg, pending: false } : msg
    ));
  }

  // ── File Attachments ─────────────────────────────────────────────────────

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp']);
  const MAX_IMAGE_BYTES = 25 * 1024 * 1024;  // 25 MB
  const MAX_FILE_BYTES = 50 * 1024 * 1024;   // 50 MB

  async function handleFileSelect(files: FileList | File[]) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Cannot attach files — WebSocket not connected');
      return;
    }
    if (!sessionIdRef.current) {
      setError('No active session — wait for connection');
      return;
    }

    for (const file of Array.from(files)) {
      const attId = nextMsgId('att');
      const isImage = IMAGE_TYPES.has(file.type) || file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

      // Size check
      const maxSize = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
      if (file.size > maxSize) {
        setMessages(prev => [...prev, {
          id: nextMsgId('att-err'),
          role: 'system',
          content: `❌ ${file.name} is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${maxSize / 1024 / 1024} MB`,
          timestamp: Date.now() / 1000,
        }]);
        continue;
      }

      // Read file as data URL
      let dataUrl: string;
      try {
        dataUrl = await readFileAsDataUrl(file);
      } catch (err: any) {
        setMessages(prev => [...prev, {
          id: nextMsgId('att-err'),
          role: 'system',
          content: `❌ Failed to read ${file.name}: ${err.message}`,
          timestamp: Date.now() / 1000,
        }]);
        continue;
      }

      // Add to pending attachments (with preview for images)
      const att: PendingAttachment = {
        id: attId,
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl,
        status: 'uploading',
        previewUrl: isImage ? dataUrl : undefined,
      };
      setAttachments(prev => [...prev, att]);

      // Send the appropriate WS method
      const attachId = nextMsgId('attach');
      let method: string;
      let params: any;

      if (isImage) {
        method = 'image.attach_bytes';
        params = {
          session_id: sessionIdRef.current,
          content_base64: dataUrl,
          filename: file.name,
        };
      } else if (isPdf) {
        method = 'pdf.attach';
        params = {
          session_id: sessionIdRef.current,
          content_base64: dataUrl,
          filename: file.name,
        };
      } else {
        method = 'file.attach';
        params = {
          session_id: sessionIdRef.current,
          path: file.name,
          data_url: dataUrl,
          name: file.name,
        };
      }

      try {
        wsRef.current.send(JSON.stringify({
          jsonrpc: '2.0',
          id: attachId,
          method,
          params,
        }));
      } catch (err: any) {
        setAttachments(prev => prev.map(a =>
          a.id === attId ? { ...a, status: 'error', error: err.message } : a
        ));
        continue;
      }

      // We'll update the attachment status when the WS response comes back
      // Store the attachId → attId mapping so the response handler can find it
      pendingAttachMapRef.current[attachId] = attId;
    }
  }

  function removeAttachment(id: string) {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }

  // ── Auto-scroll ─────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Load kanban when view changes ────────────────────────────────────────

  useEffect(() => {
    if (view === 'kanban') loadKanban();
  }, [view, activeBoard]);

  // ── Render ──────────────────────────────────────────────────────────────

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
          setConnecting(true);
          reconnectAttemptsRef.current = 0;
          init();
        }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <Sidebar
        view={view}
        setView={setView}
        profiles={profiles}
        activeProfile={activeProfile}
        switchProfile={switchProfile}
        connected={connected}
      />

      {/* Main Content */}
      <div className="main-content">
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
          <SessionsView sessions={sessions} refresh={loadSessions} onResume={resumeSession} resuming={resuming} />
        )}
        {view === 'settings' && (
          <SettingsView
            profiles={profiles}
            activeProfile={activeProfile}
            statusInfo={statusInfo}
            updateStatus={updateStatus}
            onCheckUpdate={() => window.jarvis.update?.check()}
            onInstallUpdate={() => window.jarvis.update?.install()}
          />
        )}
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function Sidebar({
  view, setView, profiles, activeProfile, switchProfile, connected
}: {
  view: View; setView: (v: View) => void;
  profiles: Profile[]; activeProfile: string; switchProfile: (n: string) => void;
  connected: boolean;
}) {
  const [showProfiles, setShowProfiles] = useState(false);

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: 'chat', label: 'Chat', icon: '💬' },
    { id: 'kanban', label: 'Kanban', icon: '📋' },
    { id: 'sessions', label: 'Sessions', icon: '🕐' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">J</div>
        <span className="sidebar-title">Jarvis</span>
        <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
      </div>

      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-profiles">
        <button className="profile-selector" onClick={() => setShowProfiles(!showProfiles)}>
          <span className="profile-avatar">
            {activeProfile.charAt(0).toUpperCase()}
          </span>
          <span className="profile-name">{activeProfile}</span>
          <span className="chevron">{showProfiles ? '▼' : '▶'}</span>
        </button>
        {showProfiles && (
          <div className="profile-dropdown">
            {profiles.map(p => (
              <button
                key={p.name}
                className={`profile-option ${p.name === activeProfile ? 'active' : ''}`}
                onClick={() => { switchProfile(p.name); setShowProfiles(false); }}
              >
                <span className="profile-avatar small">
                  {p.name.charAt(0).toUpperCase()}
                </span>
                <div className="profile-info">
                  <span className="profile-name">{p.name}</span>
                  <span className="profile-model">{p.model || 'no model'}</span>
                </div>
                {p.gateway_running && <span className="profile-online" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chat View ──────────────────────────────────────────────────────────────

function ChatView({
  messages, input, setInput, sendMessage, streaming, messagesEndRef, activeProfile,
  onStop, connected, attachments, onFileSelect, onRemoveAttachment
}: {
  messages: ChatMessage[]; input: string; setInput: (s: string) => void;
  sendMessage: () => void; streaming: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>; activeProfile: string;
  onStop: () => void; connected: boolean;
  attachments: PendingAttachment[];
  onFileSelect: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
}) {
  const [showThinking, setShowThinking] = useState<Record<string, boolean>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function copyMessage(content: string, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(content).catch(() => {});
  }

  return (
    <div className="chat-view">
      <div className="chat-header">
        <h2>Chat — {activeProfile}</h2>
      </div>

      <div
        className={`messages-container ${isDragging ? 'dragging' : ''}`}
        onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current <= 0) { setIsDragging(false); dragCounterRef.current = 0; } }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dragCounterRef.current = 0;
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFileSelect(e.dataTransfer.files);
          }
        }}
      >
        {messages.length === 0 && (
          <div className="empty-chat">
            <p>Send a message to start chatting with {activeProfile}</p>
          </div>
        )}
        {messages.map(msg => {
          // Messages with thinking content show a collapsible reasoning section
          if (msg.thinkingContent) {
            const isExpanded = showThinking[msg.id] ?? false;
            return (
              <div key={msg.id} className={`message ${msg.role} thinking-message`}>
                <div className="message-avatar">
                  {msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️'}
                </div>
                <div className="message-content">
                  {msg.thinkingContent && (
                    <>
                      <div
                        className="message-role clickable"
                        onClick={() => setShowThinking(prev => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                      >
                        {isExpanded ? '▼' : '▶'} Reasoning {msg.pending && !msg.content && <span className="typing-indicator">▊</span>}
                      </div>
                      {isExpanded && (
                        <div className="message-text thinking-content">{msg.thinkingContent}</div>
                      )}
                    </>
                  )}
                  {msg.content && (
                    <>
                      <div className="message-role">
                        {msg.role}
                        {msg.role === 'assistant' && !msg.pending && (
                          <button className="copy-btn" onClick={(e) => copyMessage(msg.content, e)} title="Copy">
                            📋
                          </button>
                        )}
                      </div>
                      <div className={`message-text ${msg.role === 'assistant' && !msg.pending ? 'markdown' : 'plain'}`}>
                        {msg.role === 'assistant' && !msg.pending
                          ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          : msg.content
                        }
                      </div>
                    </>
                  )}
                  {msg.pending && msg.content && <span className="typing-indicator">▊</span>}
                  {msg.error && <div className="message-error">{msg.error}</div>}
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`message ${msg.role} ${msg.kind || ''}`}>
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚙️'}
              </div>
              <div className="message-content">
                <div className="message-role">
                  {msg.role}
                  {msg.role === 'assistant' && !msg.pending && (
                    <button className="copy-btn" onClick={(e) => copyMessage(msg.content, e)} title="Copy">
                      📋
                    </button>
                  )}
                </div>
                <div
                  className={`message-text ${msg.role === 'assistant' && !msg.pending ? 'markdown' : 'plain'}`}
                >
                  {msg.role === 'assistant' && !msg.pending
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    : msg.content
                  }
                </div>
                {msg.pending && <span className="typing-indicator">▊</span>}
                {msg.error && <div className="message-error">{msg.error}</div>}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="composer">
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="attachment-chips">
            {attachments.map(att => (
              <div key={att.id} className={`attachment-chip ${att.status}`}>
                {att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} className="chip-thumb" />
                ) : (
                  <span className="chip-icon">
                    {att.type.startsWith('image/') ? '🖼️' : att.type === 'application/pdf' ? '📄' : '📎'}
                  </span>
                )}
                <span className="chip-name">{att.name}</span>
                {att.status === 'uploading' && <span className="chip-status">⏳</span>}
                {att.status === 'attached' && <span className="chip-status">✅</span>}
                {att.status === 'error' && <span className="chip-status" title={att.error}>❌</span>}
                <button className="chip-remove" onClick={() => onRemoveAttachment(att.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="composer-row">
          {/* Hidden file input */}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onFileSelect(e.target.files);
                e.target.value = '';  // Reset so same file can be selected again
              }
            }}
          />
          <button
            className="attach-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming || !connected}
            title="Attach files"
          >
            📎
          </button>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connected ? "Type a message..." : "Connecting..."}
            rows={3}
            disabled={streaming || !connected}
          />
          {streaming ? (
            <button className="stop-button" onClick={onStop}>
              ⏹ Stop
            </button>
          ) : (
            <button
              className="send-button"
              onClick={sendMessage}
              disabled={(!input.trim() && attachments.length === 0) || !connected}
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Kanban View ────────────────────────────────────────────────────────────

function KanbanView({
  tasks, boards, activeBoard, setActiveBoard, stats, refresh
}: {
  tasks: KanbanTask[]; boards: KanbanBoard[];
  activeBoard: string; setActiveBoard: (b: string) => void;
  stats: Record<string, number>; refresh: () => void;
}) {
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const columns = [
    { key: 'triage', label: 'Triage', color: '#a29bfe' },
    { key: 'todo', label: 'To Do', color: '#6c5ce7' },
    { key: 'ready', label: 'Ready', color: '#00cec9' },
    { key: 'running', label: 'Running', color: '#fdcb6e' },
    { key: 'blocked', label: 'Blocked', color: '#d63031' },
    { key: 'done', label: 'Done', color: '#00b894' },
    { key: 'scheduled', label: 'Scheduled', color: '#74b9ff' },
    { key: 'archived', label: 'Archived', color: '#636e72' },
  ];

  async function createTask() {
    if (!newTaskTitle.trim()) return;
    try {
      await window.jarvis.kanban.request('POST', '/api/tasks', {
        title: newTaskTitle,
        board: activeBoard,
      });
      setNewTaskTitle('');
      refresh();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }

  async function completeTask(taskId: string) {
    try {
      await window.jarvis.kanban.request('POST', `/api/tasks/${taskId}/complete`);
      refresh();
    } catch (err) {
      console.error('Failed to complete task:', err);
    }
  }

  return (
    <div className="kanban-view">
      <div className="kanban-header">
        <h2>Kanban Board</h2>
        <div className="kanban-controls">
          <select value={activeBoard} onChange={e => setActiveBoard(e.target.value)}>
            {boards.map(b => (
              <option key={b.slug} value={b.slug}>{b.name}</option>
            ))}
          </select>
          <button className="refresh-btn" onClick={refresh}>↻</button>
        </div>
      </div>

      {Object.keys(stats).length > 0 && (
        <div className="kanban-stats">
          {Object.entries(stats).map(([key, val]) => (
            <div key={key} className="stat-chip">
              <span className="stat-label">{key}</span>
              <span className="stat-value">{val}</span>
            </div>
          ))}
        </div>
      )}

      <div className="kanban-create">
        <input
          type="text"
          value={newTaskTitle}
          onChange={e => setNewTaskTitle(e.target.value)}
          placeholder="New task title..."
          onKeyDown={e => e.key === 'Enter' && createTask()}
        />
        <button onClick={createTask}>Add Task</button>
      </div>

      <div className="kanban-columns">
        {columns.map(col => {
          const colTasks = tasks.filter(t => t.status === col.key);
          return (
            <div key={col.key} className="kanban-column">
              <div className="column-header" style={{ borderTopColor: col.color }}>
                <span className="column-title">{col.label}</span>
                <span className="column-count">{colTasks.length}</span>
              </div>
              <div className="column-tasks">
                {colTasks.map(task => (
                  <div key={task.id} className="kanban-card">
                    <div className="card-title">{task.title}</div>
                    <div className="card-meta">
                      <span className="card-assignee">{task.assignee}</span>
                      <span className="card-id">{task.id.slice(0, 10)}</span>
                    </div>
                    {col.key !== 'done' && col.key !== 'archived' && (
                      <button
                        className="card-action"
                        onClick={() => completeTask(task.id)}
                        title="Mark done"
                      >
                        ✓
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sessions View ──────────────────────────────────────────────────────────

function SessionsView({ sessions, refresh, onResume, resuming }: {
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

// ── Settings View ───────────────────────────────────────────────────────────

function SettingsView({ profiles, activeProfile, statusInfo, updateStatus, onCheckUpdate, onInstallUpdate }: {
  profiles: Profile[]; activeProfile: string; statusInfo: any;
  updateStatus: { status: string; message: string; version?: string; percent?: number } | null;
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
          <code>v1.2.2</code>
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