// src/components/DocumentsView.tsx — Browse Hermes artifacts (output files)
import { useState, useEffect } from 'react';
import { api } from '../api';

const OUTPUT_DIRS = [
  '/home/jason/.hermes/cron/output',
  '/home/jason/.hermes/audio_cache',
  '/home/jason/.hermes/cache/delegation',
];

export function DocumentsView() {
  const [currentDir, setCurrentDir] = useState(OUTPUT_DIRS[0]);
  const [entries, setEntries] = useState<any[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDir(dirPath: string) {
    setLoading(true);
    setError(null);
    setFileContent(null);
    setViewingFile(null);
    try {
      const result = await api.listDir(dirPath);
      if (result.ok && result.entries) {
        setEntries(result.entries.sort((a, b) => {
          if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
          return b.name.localeCompare(a.name);
        }));
        setCurrentDir(dirPath);
      } else {
        setError(result.error || 'Failed to list directory');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDir(currentDir); }, []);

  async function handleClick(entry: any) {
    if (entry.is_directory) {
      loadDir(entry.path);
    } else {
      // Only try to read text files
      if (entry.size && entry.size < 100000) {
        setViewingFile(entry.path);
        const result = await api.readFile(entry.path);
        if (result.ok) setFileContent(result.content || '');
        else setError(result.error || 'Failed to read file');
      }
    }
  }

  const parentDir = currentDir.split('/').slice(0, -1).join('/') || '/';

  return (
    <div className="documents-view">
      <div className="documents-header">
        <h2>📄 Documents</h2>
        <div className="documents-dirs">
          {OUTPUT_DIRS.map(d => (
            <button key={d} className={`dir-btn ${currentDir === d ? 'active' : ''}`}
              onClick={() => loadDir(d)}>{d.split('/').pop()}</button>
          ))}
        </div>
      </div>

      <div className="documents-breadcrumb">
        <span className="crumb" onClick={() => loadDir('/')}>📁 /</span>
        {currentDir.split('/').filter(Boolean).map((part, i, arr) => {
          const p = '/' + arr.slice(0, i + 1).join('/');
          return <span key={i}><span className="crumb-sep">/</span><span className="crumb" onClick={() => loadDir(p)}>{part}</span></span>;
        })}
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="documents-body">
        <div className="documents-list">
          {currentDir !== '/' && (
            <div className="doc-entry dir" onClick={() => loadDir(parentDir)}>
              <span className="doc-icon">📁</span>
              <span className="doc-name">..</span>
            </div>
          )}
          {loading ? (
            <div className="loading-spinner" />
          ) : (
            entries.map((e, i) => (
              <div key={i} className={`doc-entry ${e.is_directory ? 'dir' : 'file'}`}
                onClick={() => handleClick(e)}>
                <span className="doc-icon">{e.is_directory ? '📁' : '📄'}</span>
                <span className="doc-name">{e.name}</span>
                {!e.is_directory && e.size && <span className="doc-size">{(e.size / 1024).toFixed(1)}KB</span>}
              </div>
            ))
          )}
          {!loading && entries.length === 0 && <div className="empty-state">Directory is empty</div>}
        </div>

        {viewingFile && (
          <div className="documents-preview">
            <div className="preview-header">
              <span>{viewingFile.split('/').pop()}</span>
              <button className="preview-close" onClick={() => { setViewingFile(null); setFileContent(null); }}>✕</button>
            </div>
            <pre className="preview-content">{fileContent}</pre>
          </div>
        )}
      </div>
    </div>
  );
}