// src/hooks/useWebSocket.ts — WebSocket connection + chat logic
import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatMessage, PendingAttachment } from '../types';

const MAX_RECONNECT_ATTEMPTS = 10;

let msgCounter = 0;
function nextMsgId(prefix: string): string {
  msgCounter += 1;
  return `${prefix}-${msgCounter}-${Date.now()}`;
}

export function useWebSocket(activeProfile: string) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pendingCreateIdRef = useRef<string | null>(null);
  const pendingResumeIdRef = useRef<string | null>(null);
  const pendingListIdRef = useRef<string | null>(null);
  const activeProfileRef = useRef(activeProfile);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const streamingMsgIdRef = useRef<string | null>(null);
  const streamingRef = useRef(false);
  const loadSessionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAttachMapRef = useRef<Record<string, string>>({});

  const updateMessageById = useCallback((id: string, updater: (msg: ChatMessage) => ChatMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === id);
      if (idx === -1) return prev;
      const msgs = [...prev];
      msgs[idx] = updater(msgs[idx]);
      return msgs;
    });
  }, []);

  const debouncedLoadSessions = useCallback(() => {
    if (loadSessionsTimerRef.current) clearTimeout(loadSessionsTimerRef.current);
    loadSessionsTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) loadSessions();
    }, 3000);
  }, []);

  async function loadSessions() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const listId = nextMsgId('list');
      pendingListIdRef.current = listId;
      try {
        wsRef.current.send(JSON.stringify({
          jsonrpc: '2.0', id: listId, method: 'session.list',
          params: { profile: activeProfileRef.current, limit: 50 },
        }));
      } catch {
        pendingListIdRef.current = null;
        await loadSessionsViaRest();
      }
      return;
    }
    await loadSessionsViaRest();
  }

  async function loadSessionsViaRest() {
    try {
      const data = await window.jarvis.api.request('GET', '/api/sessions?limit=20&archived=exclude');
      if (!isMountedRef.current) return;
      if (data?.sessions) setSessions(data.sessions);
    } catch (err) { console.error('Failed to load sessions:', err); }
  }

  function handleWsMessage(raw: string) {
    try {
      const frame = JSON.parse(raw);

      if (frame.id != null) {
        if (frame.id === pendingCreateIdRef.current) {
          if (frame.result?.session_id) sessionIdRef.current = frame.result.session_id;
          pendingCreateIdRef.current = null;
        }
        if (frame.id === pendingResumeIdRef.current) {
          if (frame.result?.session_id) sessionIdRef.current = frame.result.session_id;
          if (frame.result?.messages) {
            const history: ChatMessage[] = [];
            for (const m of frame.result.messages) {
              if (m.role === 'user' || m.role === 'assistant') {
                history.push({
                  id: nextMsgId(`hist-${m.role}`), role: m.role,
                  content: m.text || m.content || '',
                  thinkingContent: m.reasoning || m.reasoning_content || '',
                  timestamp: m.timestamp || Date.now() / 1000, kind: 'text',
                });
              }
            }
            setMessages(history);
          }
          if (frame.error) {
            setMessages(prev => [...prev, {
              id: nextMsgId('resume-err'), role: 'system',
              content: `❌ Failed to resume: ${frame.error.message || 'Unknown error'}`,
              timestamp: Date.now() / 1000, error: frame.error.message,
            }]);
          }
          pendingResumeIdRef.current = null;
        }
        if (frame.id === pendingListIdRef.current) {
          if (frame.result?.sessions) {
            setSessions(frame.result.sessions.map((s: any) => ({
              id: s.id, title: s.title || '', preview: s.preview || '',
              model: '', message_count: s.message_count || 0,
              last_active: s.started_at || s.last_active || 0, archived: false,
            })));
          }
          pendingListIdRef.current = null;
        }
        const attId = pendingAttachMapRef.current[frame.id];
        if (attId) {
          if (frame.result?.attached) {
            setAttachments(prev => prev.map(a => a.id === attId ? { ...a, status: 'attached' } : a));
          } else if (frame.error) {
            setAttachments(prev => prev.map(a => a.id === attId ? { ...a, status: 'error', error: frame.error.message } : a));
          }
          delete pendingAttachMapRef.current[frame.id];
        }
        if (frame.error) {
          setMessages(prev => [...prev, {
            id: nextMsgId('rpc-err'), role: 'system',
            content: `❌ ${frame.error.message || 'Unknown error'} (code: ${frame.error.code})`,
            timestamp: Date.now() / 1000, error: frame.error.message,
          }]);
          setStreaming(false); streamingRef.current = false; streamingMsgIdRef.current = null;
        }
        return;
      }

      if (frame.method === 'event' && frame.params) {
        const event = frame.params;
        switch (event.type) {
          case 'message.start': {
            setStreaming(true); streamingRef.current = true;
            const msgId = nextMsgId('msg'); streamingMsgIdRef.current = msgId;
            setMessages(prev => [...prev, {
              id: msgId, role: 'assistant', content: '',
              timestamp: Date.now() / 1000, pending: true, kind: 'text',
            }]);
            break;
          }
          case 'message.delta':
            if (streamingMsgIdRef.current) {
              const text = event.payload?.text || event.payload?.content || '';
              updateMessageById(streamingMsgIdRef.current, (msg) => ({ ...msg, content: msg.content + text }));
            }
            break;
          case 'message.complete':
            if (streamingMsgIdRef.current) {
              updateMessageById(streamingMsgIdRef.current, (msg) => ({ ...msg, pending: false }));
            } else {
              setMessages(prev => {
                const msgs = [...prev];
                for (let i = msgs.length - 1; i >= 0; i--) {
                  if (msgs[i].role === 'assistant' && msgs[i].pending) { msgs[i] = { ...msgs[i], pending: false }; break; }
                }
                return msgs;
              });
            }
            streamingMsgIdRef.current = null;
            setStreaming(false); streamingRef.current = false;
            debouncedLoadSessions();
            break;
          case 'thinking.delta':
          case 'reasoning.delta': {
            const text = event.payload?.text || '';
            if (streamingMsgIdRef.current) {
              updateMessageById(streamingMsgIdRef.current, (msg) => ({
                ...msg, thinkingContent: (msg.thinkingContent || '') + text,
              }));
            }
            break;
          }
          case 'tool.start': {
            const startName = event.payload?.name || 'Tool';
            const startDesc = event.payload?.description || 'Running...';
            const startDescStr = typeof startDesc === 'string' ? startDesc : JSON.stringify(startDesc);
            setMessages(prev => [...prev, {
              id: nextMsgId('tool'), role: 'system',
              content: `🔧 ${startName}: ${startDescStr}`,
              timestamp: Date.now() / 1000, kind: 'tool',
              toolName: event.payload?.name, pending: true,
            }]);
            break;
          }
          case 'tool.progress': {
            const toolName = event.payload?.name;
            const progress = event.payload?.progress || '';
            setMessages(prev => {
              const msgs = [...prev];
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].kind === 'tool' && msgs[i].toolName === toolName && msgs[i].pending) {
                  msgs[i] = { ...msgs[i], content: `🔧 ${toolName}: ${progress}` }; break;
                }
              }
              return msgs;
            });
            break;
          }
          case 'tool.complete': {
            const toolName = event.payload?.name;
            setMessages(prev => {
              const msgs = [...prev];
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].kind === 'tool' && msgs[i].toolName === toolName && msgs[i].pending) {
                  let result = event.payload?.result;
                  if (result == null) result = '';
                  else if (typeof result !== 'string') { try { result = JSON.stringify(result); } catch { result = String(result); } }
                  const truncated = result.length > 200 ? result.slice(0, 200) + '...' : result;
                  msgs[i] = { ...msgs[i], content: `✅ ${toolName}: ${truncated || 'completed'}`, pending: false };
                  break;
                }
              }
              return msgs;
            });
            break;
          }
          case 'clarify.request':
            setMessages(prev => [...prev, {
              id: nextMsgId('clarify'), role: 'system',
              content: `❓ ${event.payload?.question || 'Agent needs clarification'}`,
              timestamp: Date.now() / 1000, kind: 'clarify',
            }]);
            setStreaming(false); streamingRef.current = false; streamingMsgIdRef.current = null;
            break;
          case 'approval.request':
            setMessages(prev => [...prev, {
              id: nextMsgId('approval'), role: 'system',
              content: `⚠️ Approval needed: ${event.payload?.command || 'Unknown command'}`,
              timestamp: Date.now() / 1000, kind: 'approval',
            }]);
            setStreaming(false); streamingRef.current = false; streamingMsgIdRef.current = null;
            break;
          case 'background.complete':
            setMessages(prev => [...prev, {
              id: nextMsgId('bg'), role: 'system',
              content: `🔄 Background task complete: ${event.payload?.result || ''}`,
              timestamp: Date.now() / 1000, kind: 'background',
            }]);
            break;
          case 'error':
            setMessages(prev => [...prev, {
              id: nextMsgId('err'), role: 'system',
              content: `❌ Error: ${event.payload?.message || 'Unknown error'}`,
              timestamp: Date.now() / 1000, error: event.payload?.message,
            }]);
            setStreaming(false); streamingRef.current = false; streamingMsgIdRef.current = null;
            break;
          case 'gateway.ready': break;
          case 'session.info':
            if (event.payload?.session_id && !sessionIdRef.current)
              sessionIdRef.current = event.payload.session_id;
            break;
          default:
            console.log('Unhandled event:', event.type, event.payload);
        }
      }
    } catch { /* Not JSON */ }
  }

  async function connectWs(profile?: string) {
    try {
      const result = await window.jarvis.ws.connect(profile);
      if (!result.ok) {
        if (isMountedRef.current) setError('WebSocket connection failed: ' + result.error);
        return;
      }
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }

      const socket = new WebSocket(result.wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!isMountedRef.current) return;
        setConnected(true); setError(null);
        reconnectAttemptsRef.current = 0;
        setStreaming(false); streamingRef.current = false; streamingMsgIdRef.current = null;
        const createId = `create-${nextMsgId('create')}`;
        pendingCreateIdRef.current = createId;
        socket.send(JSON.stringify({
          jsonrpc: '2.0', id: createId, method: 'session.create',
          params: { profile: profile || activeProfileRef.current },
        }));
        loadSessions();
      };

      socket.onmessage = (event) => handleWsMessage(event.data);

      socket.onclose = () => {
        if (!isMountedRef.current) return;
        setConnected(false);
        setStreaming(false); streamingRef.current = false; streamingMsgIdRef.current = null;
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          if (isMountedRef.current) setError('Connection lost — max reconnection attempts reached. Click Retry.');
          return;
        }
        const delay = Math.min(2000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        reconnectTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) connectWs(activeProfileRef.current);
        }, delay);
      };

      socket.onerror = () => { console.error('WebSocket error'); };
    } catch (err: any) {
      if (isMountedRef.current) setError('WebSocket error: ' + err.message);
    }
  }

  async function switchProfile(name: string) {
    activeProfileRef.current = name;
    setMessages([]);
    setStreaming(false); streamingRef.current = false; streamingMsgIdRef.current = null;
    sessionIdRef.current = null;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    reconnectAttemptsRef.current = 0;
    await connectWs(name);
  }

  function sendMessage() {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (streamingRef.current) return;
    if (!sessionIdRef.current) {
      setMessages(prev => [...prev, {
        id: nextMsgId('err'), role: 'system',
        content: '⚠️ No active session — please wait for connection to establish.',
        timestamp: Date.now() / 1000,
      }]);
      return;
    }
    const text = input.trim();
    setInput('');
    const attachedNames = attachments.filter(a => a.status === 'attached').map(a => a.name);
    const displayText = attachedNames.length > 0 ? `${text}\n\n[Attached: ${attachedNames.join(', ')}]` : text;
    setMessages(prev => [...prev, {
      id: nextMsgId('user'), role: 'user', content: displayText,
      timestamp: Date.now() / 1000, kind: 'text',
    }]);
    setAttachments([]); pendingAttachMapRef.current = {};
    try {
      wsRef.current.send(JSON.stringify({
        jsonrpc: '2.0', id: nextMsgId('chat'), method: 'prompt.submit',
        params: { text, session_id: sessionIdRef.current },
      }));
      setStreaming(true); streamingRef.current = true;
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: nextMsgId('send-err'), role: 'system',
        content: `❌ Failed to send message: ${err.message}`,
        timestamp: Date.now() / 1000, error: err.message,
      }]);
    }
  }

  function stopStreaming() {
    setStreaming(false); streamingRef.current = false; streamingMsgIdRef.current = null;
    setMessages(prev => prev.map(msg => msg.pending ? { ...msg, pending: false } : msg));
  }

  async function resumeSession(sessionId: string) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Cannot resume — WebSocket not connected'); return;
    }
    setResuming(true);
    try {
      const resumeId = nextMsgId('resume');
      pendingResumeIdRef.current = resumeId;
      wsRef.current.send(JSON.stringify({
        jsonrpc: '2.0', id: resumeId, method: 'session.resume',
        params: { session_id: sessionId, profile: activeProfileRef.current },
      }));
      setMessages([]); setStreaming(false); streamingRef.current = false;
      streamingMsgIdRef.current = null; setError(null);
    } catch (err: any) {
      if (isMountedRef.current) setError('Failed to resume session: ' + (err.message || 'unknown'));
    } finally { if (isMountedRef.current) setResuming(false); }
  }

  // File attachments
  const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp']);
  const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
  const MAX_FILE_BYTES = 50 * 1024 * 1024;

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(files: FileList | File[]) {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) { setError('Cannot attach files — WebSocket not connected'); return; }
    if (!sessionIdRef.current) { setError('No active session — wait for connection'); return; }
    for (const file of Array.from(files)) {
      const attId = nextMsgId('att');
      const isImage = IMAGE_TYPES.has(file.type) || file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const maxSize = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
      if (file.size > maxSize) {
        setMessages(prev => [...prev, {
          id: nextMsgId('att-err'), role: 'system',
          content: `❌ ${file.name} is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${maxSize / 1024 / 1024} MB`,
          timestamp: Date.now() / 1000,
        }]);
        continue;
      }
      let dataUrl: string;
      try { dataUrl = await readFileAsDataUrl(file); } catch (err: any) {
        setMessages(prev => [...prev, {
          id: nextMsgId('att-err'), role: 'system',
          content: `❌ Failed to read ${file.name}: ${err.message}`,
          timestamp: Date.now() / 1000,
        }]);
        continue;
      }
      const att: PendingAttachment = {
        id: attId, name: file.name, size: file.size, type: file.type,
        dataUrl, status: 'uploading', previewUrl: isImage ? dataUrl : undefined,
      };
      setAttachments(prev => [...prev, att]);
      const attachId = nextMsgId('attach');
      let method: string; let params: any;
      if (isImage) { method = 'image.attach_bytes'; params = { session_id: sessionIdRef.current, content_base64: dataUrl, filename: file.name }; }
      else if (isPdf) { method = 'pdf.attach'; params = { session_id: sessionIdRef.current, content_base64: dataUrl, filename: file.name }; }
      else { method = 'file.attach'; params = { session_id: sessionIdRef.current, path: file.name, data_url: dataUrl, name: file.name }; }
      try { wsRef.current.send(JSON.stringify({ jsonrpc: '2.0', id: attachId, method, params })); }
      catch (err: any) {
        setAttachments(prev => prev.map(a => a.id === attId ? { ...a, status: 'error', error: err.message } : a));
        continue;
      }
      pendingAttachMapRef.current[attachId] = attId;
    }
  }

  function removeAttachment(id: string) { setAttachments(prev => prev.filter(a => a.id !== id)); }

  // Init
  useEffect(() => {
    isMountedRef.current = true;
    (async () => {
      try {
        const loginResult = await window.jarvis.auth.login();
        if (!loginResult.ok) { setError('Login failed: ' + (loginResult.error || 'unknown')); setConnecting(false); return; }
        activeProfileRef.current = activeProfile;
        await connectWs();
        if (!isMountedRef.current) return;
        setConnecting(false);
      } catch (err: any) {
        if (!isMountedRef.current) return;
        setError(err.message || 'Connection failed'); setConnecting(false);
      }
    })();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
      if (loadSessionsTimerRef.current) { clearTimeout(loadSessionsTimerRef.current); loadSessionsTimerRef.current = null; }
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, []);

  return {
    connected, connecting, messages, setMessages, input, setInput, streaming,
    sessions, setSessions, error, setError, resuming, attachments,
    sendMessage, stopStreaming, resumeSession, switchProfile, handleFileSelect, removeAttachment,
    wsRef, sessionIdRef, loadSessions,
  };
}