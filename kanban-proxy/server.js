const http = require('http');
const { execSync } = require('child_process');

const PORT = 3456;
const HERMES_HOME = process.env.HERMES_HOME || '/home/jason/.hermes';
const HERMES_BIN = process.env.HERMES_BIN || '/home/jason/.hermes/hermes-agent/venv/bin/hermes';

function shellEscape(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function runHermes(args) {
  try {
    const cmd = `${HERMES_BIN} kanban ${args}`;
    const output = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, HERMES_HOME }
    });
    return { ok: true, output: output.trim() };
  } catch (err) {
    return { ok: false, error: err.stderr || err.message, output: (err.stdout || '').trim() };
  }
}

function boardArgs(board) {
  return board ? `--board ${shellEscape(board)} ` : '';
}

function parseTaskList(output) {
  const lines = output.split('\n').filter(l => l.trim());
  const tasks = [];
  for (const line of lines) {
    // Format: ✓ t_79df54ba  done      jarvis   Title here
    const match = line.match(/^[✓✔○●]?[→]?[●○]?\s*(t_[a-f0-9]+)\s+(\S+)\s+(\S+)\s+(.+)/);
    if (match) {
      tasks.push({
        id: match[1],
        status: match[2],
        assignee: match[3],
        title: match[4].trim()
      });
    }
  }
  return tasks;
}

function parseTaskDetail(output) {
  const lines = output.split('\n');
  const task = { id: '', title: '', status: '', assignee: '', body: '', comments: [], events: [] };
  let section = 'header';
  for (const line of lines) {
    if (line.startsWith('──')) { section = 'body'; continue; }
    if (section === 'header') {
      const idMatch = line.match(/t_[a-f0-9]+/);
      if (idMatch) task.id = idMatch[0];
      const statusMatch = line.match(/Status:\s+(\S+)/);
      if (statusMatch) task.status = statusMatch[1];
      const assigneeMatch = line.match(/Assignee:\s+(\S+)/);
      if (assigneeMatch) task.assignee = assigneeMatch[1];
      const titleMatch = line.match(/Title:\s+(.+)/);
      if (titleMatch) task.title = titleMatch[1];
    } else if (section === 'body') {
      if (line.startsWith('  > ')) {
        task.comments.push(line.replace(/^  > /, ''));
      } else {
        task.body += line + '\n';
      }
    }
  }
  return task;
}

function parseBoards(output) {
  const lines = output.split('\n').filter(l => l.trim());
  const boards = [];
  for (const line of lines) {
    // Format: ●   default     Default     archived=49, done=6
    const match = line.match(/^[●○]\s+(\S+)\s+(.+?)(?:\s{2,}|$)/);
    if (match) {
      boards.push({ slug: match[1], name: match[2].trim() });
    }
  }
  return boards;
}

function parseStats(output) {
  const lines = output.split('\n').filter(l => l.trim());
  const stats = {};
  let inStatusSection = false;
  for (const line of lines) {
    if (line.match(/^By status:/i)) { inStatusSection = true; continue; }
    if (line.match(/^By assignee:/i)) { inStatusSection = false; continue; }
    // Format: "  triage    0" or "  done      6"
    const match = line.match(/^\s+(\w+)\s+(\d+)/);
    if (match && inStatusSection) {
      stats[match[1]] = parseInt(match[2]);
    }
  }
  return stats;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  async function handle() {
    try {
      if (path === '/api/boards' && method === 'GET') {
        const result = runHermes('boards list');
        if (!result.ok) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }
        const boards = parseBoards(result.output);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ boards }));
      }
      else if (path === '/api/tasks' && method === 'GET') {
        const board = url.searchParams.get('board') || '';
        const args = `${boardArgs(board)}list`;
        const result = runHermes(args);
        if (!result.ok) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }
        const tasks = parseTaskList(result.output);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tasks }));
      }
      else if (path.match(/^\/api\/tasks\/(t_[a-f0-9]+)$/) && method === 'GET') {
        const taskId = path.match(/^\/api\/tasks\/(t_[a-f0-9]+)$/)[1];
        const result = runHermes(`show ${taskId}`);
        if (!result.ok) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }
        const task = parseTaskDetail(result.output);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ task }));
      }
      else if (path === '/api/tasks' && method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body);
        const title = data.title || 'Untitled';
        const board = data.board || '';
        let args = `${boardArgs(board)}create ${shellEscape(title)}`;
        if (data.body) args += ` --body ${shellEscape(data.body)}`;
        const result = runHermes(args);
        if (!result.ok) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, output: result.output }));
      }
      else if (path.match(/^\/api\/tasks\/(t_[a-f0-9]+)\/complete$/) && method === 'POST') {
        const taskId = path.match(/^\/api\/tasks\/(t_[a-f0-9]+)\/complete$/)[1];
        const result = runHermes(`complete ${taskId}`);
        if (!result.ok) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      }
      else if (path === '/api/stats' && method === 'GET') {
        const board = url.searchParams.get('board') || '';
        const args = `${boardArgs(board)}stats`;
        const result = runHermes(args);
        if (!result.ok) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
          return;
        }
        const stats = parseStats(result.output);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ stats }));
      }
      else if (path === '/api/health' && method === 'GET') {
        const result = runHermes('boards list');
        res.writeHead(result.ok ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: result.ok, error: result.error || null }));
      }
      else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  handle();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Kanban proxy running on http://0.0.0.0:${PORT}`);
  console.log(`Hermes home: ${HERMES_HOME}`);
  console.log(`Hermes bin: ${HERMES_BIN}`);
});