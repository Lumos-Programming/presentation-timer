const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Server } = require('socket.io');
const { parse } = require('csv-parse/sync');

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'presentations.json');

const DEFAULT_PRESENTATIONS = [
  {
    id: 'p001',
    speaker: 'Kazuwee',
    title: 'お米の美味しい炊き方、そしてお米を食べることによるその効果。',
    est: 15 * 60,
    buffer: 3 * 60
  },
  {
    id: 'p002',
    speaker: 'Tanaka',
    title: 'ゲームデザインにおけるプレイヤー体験の設計',
    est: 10 * 60,
    buffer: 2 * 60
  },
  {
    id: 'p003',
    speaker: 'Suzuki',
    title: 'プロトタイプから本番運用まで',
    est: 8 * 60,
    buffer: 2 * 60
  }
];

function newId() {
  return `p_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function normalizePresentation(input, existingId = null) {
  const speaker = String(input?.speaker ?? '').trim();
  const title = String(input?.title ?? '').trim();
  const est = Number(input?.est);
  const buffer = Number(input?.buffer);
  if (!speaker) throw new Error('発表者を入力してください。');
  if (!title) throw new Error('発表内容を入力してください。');
  if (!Number.isFinite(est) || est < 0 || est > 24 * 60 * 60) throw new Error('ESTが不正です。');
  if (!Number.isFinite(buffer) || buffer < 0 || buffer > 24 * 60 * 60) throw new Error('BUFFERが不正です。');
  return {
    id: existingId || (String(input?.id || '').trim() || newId()),
    speaker,
    title,
    est: Math.floor(est),
    buffer: Math.floor(buffer)
  };
}

function loadPresentations() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) return DEFAULT_PRESENTATIONS.map((p) => ({ ...p }));
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(data)) throw new Error('not an array');
    return data.map((p) => normalizePresentation(p, p.id || newId()));
  } catch (error) {
    console.warn('Could not read data/presentations.json. Using defaults:', error.message);
    return DEFAULT_PRESENTATIONS.map((p) => ({ ...p }));
  }
}

let presentations = loadPresentations();

function savePresentations() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(presentations, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

if (!fs.existsSync(DATA_FILE)) savePresentations();

const state = {
  currentIndex: presentations.length ? 0 : -1,
  status: 'idle', // idle | running | paused | time_up
  startedAt: null,
  elapsedBeforeRunMs: 0,
  version: 0
};

function currentPresentation() {
  return state.currentIndex >= 0 ? presentations[state.currentIndex] || null : null;
}

function resetClock() {
  state.startedAt = null;
  state.elapsedBeforeRunMs = 0;
  state.status = 'idle';
}

function rawElapsedMs(now = Date.now()) {
  if (state.status === 'running' && state.startedAt != null) {
    return state.elapsedBeforeRunMs + Math.max(0, now - state.startedAt);
  }
  return state.elapsedBeforeRunMs;
}

function maxDurationMs() {
  const p = currentPresentation();
  return p ? (p.est + p.buffer) * 1000 : 0;
}

function normalizeState(now = Date.now()) {
  if (state.status === 'running') {
    const maxMs = maxDurationMs();
    if (maxMs >= 0 && rawElapsedMs(now) >= maxMs) {
      state.elapsedBeforeRunMs = maxMs;
      state.startedAt = null;
      state.status = 'time_up';
      state.version += 1;
      return true;
    }
  }
  return false;
}

function snapshot(now = Date.now()) {
  normalizeState(now);
  return {
    serverNow: now,
    presentations,
    currentIndex: state.currentIndex,
    current: currentPresentation(),
    status: state.status,
    startedAt: state.startedAt,
    elapsedBeforeRunMs: state.elapsedBeforeRunMs,
    elapsedMs: rawElapsedMs(now),
    version: state.version
  };
}

function bump() { state.version += 1; }
function broadcast() { io.emit('state', snapshot()); }

function requireNotRunning() {
  if (state.status === 'running') throw new Error('タイマー動作中は発表データを変更できません。先にPAUSEしてください。');
}

function parseDuration(value, fieldName) {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error(`${fieldName}が空です。`);
  if (/^\d+$/.test(raw)) return Number(raw); // bare integer = seconds
  const m = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`${fieldName}「${raw}」を読み取れません。MM:SS 形式で入力してください。`);
  const hours = Number(m[1] || 0);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  if (minutes >= 60 && m[1]) throw new Error(`${fieldName}「${raw}」の分が不正です。`);
  if (seconds >= 60) throw new Error(`${fieldName}「${raw}」の秒が不正です。`);
  return hours * 3600 + minutes * 60 + seconds;
}

function csvKey(row, keys) {
  for (const key of Object.keys(row)) {
    const normalized = key.trim().toLowerCase();
    if (keys.includes(normalized)) return row[key];
  }
  return undefined;
}

function presentationsFromCsv(csvText) {
  const rows = parse(String(csvText || '').replace(/^\uFEFF/, ''), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false
  });
  if (!rows.length) throw new Error('CSVに発表データがありません。');
  return rows.map((row, index) => {
    const speaker = csvKey(row, ['speaker', '発表者', 'presenter', 'name']);
    const title = csvKey(row, ['title', '発表内容', 'topic', 'presentation']);
    const estRaw = csvKey(row, ['est', '予定時間', '発表予定時間']);
    const bufferRaw = csvKey(row, ['buffer', '余裕時間']);
    try {
      return normalizePresentation({
        speaker,
        title,
        est: parseDuration(estRaw, 'EST'),
        buffer: parseDuration(bufferRaw, 'BUFFER')
      });
    } catch (error) {
      throw new Error(`${index + 2}行目: ${error.message}`);
    }
  });
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/vendor/sortable.min.js', (_req, res) => {
  res.sendFile(require.resolve('sortablejs/Sortable.min.js'));
});
app.get('/', (_req, res) => res.redirect('/master'));
app.get('/timer', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'timer.html')));
app.get('/master', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'master.html')));
app.get('/api/state', (_req, res) => res.json(snapshot()));

io.on('connection', (socket) => {
  socket.emit('state', snapshot());

  socket.on('command', (command = {}) => {
    const now = Date.now();
    normalizeState(now);

    switch (command.type) {
      case 'start':
      case 'resume':
        if (currentPresentation() && (state.status === 'idle' || state.status === 'paused')) {
          state.startedAt = now;
          state.status = 'running';
          bump();
        }
        break;
      case 'pause':
        if (state.status === 'running') {
          state.elapsedBeforeRunMs = rawElapsedMs(now);
          state.startedAt = null;
          state.status = 'paused';
          bump();
        }
        break;
      case 'reset':
        if (currentPresentation()) { resetClock(); bump(); }
        break;
      case 'next':
        if (state.currentIndex < presentations.length - 1) {
          state.currentIndex += 1; resetClock(); bump();
        }
        break;
      case 'previous':
        if (state.currentIndex > 0) {
          state.currentIndex -= 1; resetClock(); bump();
        }
        break;
      case 'select': {
        const index = Number(command.index);
        if (Number.isInteger(index) && index >= 0 && index < presentations.length) {
          state.currentIndex = index; resetClock(); bump();
        }
        break;
      }
      default: break;
    }
    broadcast();
  });

  socket.on('schedule:add', (input, ack = () => {}) => {
    try {
      requireNotRunning();
      presentations.push(normalizePresentation(input));
      if (state.currentIndex < 0) state.currentIndex = 0;
      savePresentations(); bump(); broadcast();
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });

  socket.on('schedule:update', ({ id, presentation } = {}, ack = () => {}) => {
    try {
      requireNotRunning();
      const index = presentations.findIndex((p) => p.id === id);
      if (index < 0) throw new Error('対象の発表が見つかりません。');
      presentations[index] = normalizePresentation(presentation, id);
      savePresentations(); bump(); broadcast();
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });

  socket.on('schedule:delete', ({ id } = {}, ack = () => {}) => {
    try {
      requireNotRunning();
      const index = presentations.findIndex((p) => p.id === id);
      if (index < 0) throw new Error('対象の発表が見つかりません。');
      const currentId = currentPresentation()?.id;
      presentations.splice(index, 1);
      if (!presentations.length) {
        state.currentIndex = -1;
        resetClock();
      } else if (id === currentId) {
        state.currentIndex = Math.min(index, presentations.length - 1);
        resetClock();
      } else {
        state.currentIndex = Math.max(0, presentations.findIndex((p) => p.id === currentId));
      }
      savePresentations(); bump(); broadcast();
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });

  socket.on('schedule:reorder', ({ ids } = {}, ack = () => {}) => {
    try {
      requireNotRunning();
      if (!Array.isArray(ids) || ids.length !== presentations.length) throw new Error('並べ替えデータが不正です。');
      if (new Set(ids).size !== ids.length) throw new Error('並べ替えデータが不正です。');
      const map = new Map(presentations.map((p) => [p.id, p]));
      if (ids.some((id) => !map.has(id))) throw new Error('並べ替え対象が一致しません。');
      const currentId = currentPresentation()?.id;
      presentations = ids.map((id) => map.get(id));
      state.currentIndex = currentId ? presentations.findIndex((p) => p.id === currentId) : (presentations.length ? 0 : -1);
      savePresentations(); bump(); broadcast();
      ack({ ok: true });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });

  socket.on('schedule:importCsv', ({ csv } = {}, ack = () => {}) => {
    try {
      requireNotRunning();
      const imported = presentationsFromCsv(csv);
      presentations = imported;
      state.currentIndex = presentations.length ? 0 : -1;
      resetClock();
      savePresentations(); bump(); broadcast();
      ack({ ok: true, count: presentations.length });
    } catch (error) { ack({ ok: false, error: error.message }); }
  });
});

setInterval(() => {
  const changed = normalizeState(Date.now());
  if (state.status === 'running' || changed) broadcast();
}, 250);

function getLanAddresses() {
  const result = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address);
    }
  }
  return [...new Set(result)];
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('Presentation Timer Phase 2 started');
  console.log('----------------------------------');
  console.log(`TIMER  http://localhost:${PORT}/timer`);
  console.log(`MASTER http://localhost:${PORT}/master`);
  const ips = getLanAddresses();
  if (ips.length) {
    console.log('');
    console.log('LAN access:');
    for (const ip of ips) {
      console.log(`  TIMER  http://${ip}:${PORT}/timer`);
      console.log(`  MASTER http://${ip}:${PORT}/master`);
    }
  }
  console.log('');
});
