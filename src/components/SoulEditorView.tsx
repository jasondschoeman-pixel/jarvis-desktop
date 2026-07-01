// src/components/SoulEditorView.tsx — SOUL.md identity file editor
import { useState, useEffect } from 'react';
import { api } from '../api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SOUL_PATHS = [
  '/home/jason/.hermes/SOUL.md',
  '/home/jason/.hermes/profiles/default/SOUL.md',
];

export function SoulEditorView({ activeProfile }: { activeProfile: string }) {
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [filePath, setFilePath] = useState(SOUL_PATHS[0]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState(false);

  async function loadFile(path: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.readFile(path);
      if (result.ok && result.content !== undefined) {
        setContent(result.content);
        setOriginalContent(result.content);
        setFilePath(path);
      } else {
        setError(result.error || 'Failed to read file');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Try the profile-specific path first, fall back to default
    const profilePath = `/home/jason/.hermes/profiles/${activeProfile}/SOUL.md`;
    api.readFile(profilePath).then(result => {
      if (result.ok && result.content) {
        setContent(result.content);
        setOriginalContent(result.content);
        setFilePath(profilePath);
        setLoading(false);
      } else {
        loadFile(SOUL_PATHS[0]);
      }
    });
  }, [activeProfile]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api.writeFile(filePath, content);
      if (result.ok) {
        setOriginalContent(content);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.error || 'Failed to save');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = content !== originalContent;

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading SOUL.md...</p></div>;

  return (
    <div className="soul-view">
      <div className="soul-header">
        <h2>🧬 SOUL.md <span className="soul-path">{filePath}</span></h2>
        <div className="soul-actions">
          <button className={`soul-tab ${!preview ? 'active' : ''}`} onClick={() => setPreview(false)}>Edit</button>
          <button className={`soul-tab ${preview ? 'active' : ''}`} onClick={() => setPreview(true)}>Preview</button>
          {dirty && <span className="soul-dirty">● Modified</span>}
          {saved && <span className="soul-saved">✅ Saved</span>}
          <button className="save-btn" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      {preview ? (
        <div className="soul-preview markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      ) : (
        <textarea
          className="soul-editor"
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          placeholder="Edit your agent's identity file..."
        />
      )}
    </div>
  );
}