// src/components/ChatView.tsx
import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, PendingAttachment } from '../types';

export function ChatView({
  messages, input, setInput, sendMessage, streaming, messagesEndRef, activeProfile,
  onStop, connected, attachments, onFileSelect, onRemoveAttachment,
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
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onFileSelect(e.target.files);
                e.target.value = '';
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