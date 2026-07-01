// src/components/KanbanView.tsx
import { useState } from 'react';
import type { KanbanTask, KanbanBoard } from '../types';
import { api } from '../api';

export function KanbanView({
  tasks, boards, activeBoard, setActiveBoard, stats, refresh,
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
      await api.createKanbanTask(newTaskTitle, activeBoard);
      setNewTaskTitle('');
      refresh();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }

  async function completeTask(taskId: string) {
    try {
      await api.completeKanbanTask(taskId);
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