// src/components/SkillsView.tsx
import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import type { Skill } from '../types';

export function SkillsView() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await api.getSkills();
        if (!mounted) return;
        const list = Array.isArray(data) ? data : (data?.skills || []);
        setSkills(list);
        setError(null);
      } catch (err: any) {
        if (mounted) setError(err.message || 'Failed to load skills');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q)
    );
  }, [skills, search]);

  const categories = useMemo(() => {
    const cats = new Map<string, Skill[]>();
    for (const s of filtered) {
      const cat = s.category || 'uncategorized';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(s);
    }
    return Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  if (loading && skills.length === 0) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading skills...</p></div>;

  return (
    <div className="skills-view">
      <div className="skills-header">
        <h2>Skills ({skills.length})</h2>
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="skills-search"
        />
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      {categories.map(([category, catSkills]) => (
        <div key={category} className="skill-category">
          <h3 className="skill-category-title">{category} ({catSkills.length})</h3>
          <div className="skill-list">
            {catSkills.map(skill => (
              <div key={skill.name} className={`skill-card ${skill.enabled ? '' : 'disabled'}`}>
                <div className="skill-card-header">
                  <span className="skill-name">{skill.name}</span>
                  <span className={`skill-enabled-badge ${skill.enabled ? 'on' : 'off'}`}>
                    {skill.enabled ? '✓' : '✗'}
                  </span>
                </div>
                <div className="skill-desc">{skill.description?.slice(0, 120)}{skill.description?.length > 120 ? '...' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && !loading && (
        <div className="empty-state">No skills match "{search}"</div>
      )}
    </div>
  );
}