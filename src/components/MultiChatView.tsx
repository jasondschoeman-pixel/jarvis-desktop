// src/components/MultiChatView.tsx — Side-by-side profile comparison chat
import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api';

interface ChatMsg { role: string; content: string; }

export function MultiChatView() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selectedLeft, setSelectedLeft] = useState('default');
  const [selectedRight, setSelectedRight] = useState('pepper_pots');
  const [input, setInput] = useState('');
  const [leftMsgs, setLeftMsgs] = useState<ChatMsg[]>([]);
  const [rightMsgs, setRightMsgs] = useState<ChatMsg[]>([]);
  const [leftLoading, setLeftLoading] = useState(false);
  const [rightLoading, setRightLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load profiles on mount
  useState(() => {
    api.getProfiles().then(data => {
      const names = (data?.profiles || []).map((p: any) => p.name);
      setProfiles(names);
      if (names.length > 0) setSelectedLeft(names[0]);
      if (names.length > 1) setSelectedRight(names[1]);
    });
  });

  async function sendToProfile(profile: string, message: string, setMsgs: (fn: (prev: ChatMsg[]) => ChatMsg[]) => void, setLoading: (v: boolean) => void) {
    setLoading(true);
    setMsgs(prev => [...prev, { role: 'user', content: message }]);
    try {
      const result = await api.jarvis.jobs.request('POST', '/v1/chat/completions', {
        model: 'hermes-agent',
        messages: [{ role: 'user', content: message }],
        profile,
        stream: false,
      });
      const reply = result?.choices?.[0]?.message?.content || 'No response';
      setMsgs(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: any) {
      setMsgs(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    if (!input.trim()) return;
    const msg = input;
    setInput('');
    setError(null);
    sendToProfile(selectedLeft, msg, setLeftMsgs, setLeftLoading);
    sendToProfile(selectedRight, msg, setRightMsgs, setRightLoading);
  }

  return (
    <div className="multichat-view">
      <div className="multichat-header">
        <h2>💬 Multi-Profile Chat</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="multichat-grid">
        <div className="multichat-panel">
          <select value={selectedLeft} onChange={e => { setSelectedLeft(e.target.value); setLeftMsgs([]); }} className="multichat-select">
            {profiles.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="multichat-messages">
            {leftMsgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            ))}
            {leftLoading && <div className="msg-loading">Thinking...</div>}
          </div>
        </div>

        <div className="multichat-panel">
          <select value={selectedRight} onChange={e => { setSelectedRight(e.target.value); setRightMsgs([]); }} className="multichat-select">
            {profiles.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="multichat-messages">
            {rightMsgs.map((m, i) => (
              <div key={i} className={`msg ${m.role}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            ))}
            {rightLoading && <div className="msg-loading">Thinking...</div>}
          </div>
        </div>
      </div>

      <div className="multichat-input">
        <input
          type="text"
          placeholder="Send to both profiles..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button onClick={handleSend} disabled={leftLoading || rightLoading}>Send</button>
      </div>
    </div>
  );
}