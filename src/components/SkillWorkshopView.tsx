// src/components/SkillWorkshopView.tsx — Skill browser + viewer
import { useState, useEffect } from 'react';
import { api } from '../api';
import type { Skill } from '../types';

const SKILLS_BASE = '/home/jason/.hermes/skills';

export function SkillWorkshopView() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [skillContent, setSkillContent] = useState<string | null>(null);
  const [skillLoading, setSkillLoading] = useState(false);

  useEffect(() => {
    api.getSkills().then(data => {
      setSkills(data || []);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  async function viewSkill(name: string) {
    setSelectedSkill(name);
    setSkillLoading(true);
    setSkillContent(null);
    try {
      const result = await api.readFile(`${SKILLS_BASE}/${name}/SKILL.md`);
      if (result.ok) setSkillContent(result.content);
      else setError(result.error);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSkillLoading(false);
    }
  }

  const q = search.toLowerCase();
  const filtered = skills.filter(s => !q || s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q));

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading skills...</p></div>;

  return (
    <div className="workshop-view">
      <div className="workshop-header">
        <h2>🔨 Skill Workshop ({filtered.length})</h2>
        <input type="text" placeholder="Search skills..." value={search} onChange={e => setSearch(e.target.value)} className="workshop-search" />
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="workshop-body">
        <div className="workshop-list">
          {filtered.map(s => (
            <div key={s.name} className={`workshop-item ${selectedSkill === s.name ? 'active' : ''}`}
              onClick={() => viewSkill(s.name)}>
              <span className={`workshop-badge ${s.enabled ? 'on' : 'off'}`}>{s.enabled ? '✅' : '⭕'}</span>
              <span className="workshop-name">{s.name}</span>
              {s.category && <span className="workshop-cat">{s.category}</span>}
            </div>
          ))}
        </div>

        <div className="workshop-detail">
          {selectedSkill ? (
            skillLoading ? <div className="loading-spinner" /> :
            <div>
              <h3>{selectedSkill}</h3>
              <pre className="skill-content">{skillContent}</pre>
            </div>
          ) : (
            <div className="empty-state">Select a skill to view its SKILL.md</div>
          )}
        </div>
      </div>
    </div>
  );
}