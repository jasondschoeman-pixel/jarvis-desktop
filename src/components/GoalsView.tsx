// src/components/GoalsView.tsx — Goals tracking panel
import { useState, useEffect } from 'react';
import { api } from '../api';

export function GoalsView() {
  const [config, setConfig] = useState<any>(null);
  const [goalsMaxTurns, setGoalsMaxTurns] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(data => {
      setConfig(data);
      setGoalsMaxTurns(data?.goals?.max_turns || 20);
      setLoading(false);
    }).catch(err => {
      setError(err.message);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="loading-spinner-container"><div className="loading-spinner" /><p>Loading goals...</p></div>;

  return (
    <div className="goals-view">
      <div className="goals-header">
        <h2>🎯 Goals</h2>
      </div>

      {error && <div className="status-error">⚠️ {error}</div>}

      <div className="goals-card">
        <h3>Goal Settings</h3>
        <div className="goal-setting">
          <label>Max Turns per Goal</label>
          <input type="number" value={goalsMaxTurns} onChange={e => setGoalsMaxTurns(parseInt(e.target.value) || 20)} />
          <span className="goal-hint">Maximum turns the agent spends pursuing a goal before asking for direction</span>
        </div>
      </div>

      <div className="goals-card">
        <h3>How Goals Work</h3>
        <p className="goals-desc">
          Goals are mid-term objectives (days to weeks) that Hermes pursues across sessions.
          When you set a goal, Hermes will:
        </p>
        <ol className="goals-list">
          <li>Ask clarifying questions to understand the goal</li>
          <li>Build a plan with milestones</li>
          <li>Assign roles — what Hermes does vs what you do</li>
          <li>Track progress across sessions</li>
          <li>Report progress and ask for direction at decision points</li>
        </ol>
        <p className="goals-desc">
          To set a goal, just tell Hermes in chat: <code>"I want to accomplish X over the next two weeks"</code>
        </p>
      </div>

      <div className="goals-card">
        <h3>Current Goals</h3>
        <p className="goals-empty">No active goals. Set one by chatting with Hermes.</p>
      </div>
    </div>
  );
}