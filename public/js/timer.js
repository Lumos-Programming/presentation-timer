const socket = io();
const els = {
  speaker: document.getElementById('speaker'),
  title: document.getElementById('title'),
  time: document.getElementById('time'),
  meta: document.getElementById('meta'),
  connection: document.getElementById('connection')
};

let snapshot = null;
let serverOffset = 0;

function pad2(v) { return String(Math.max(0, v)).padStart(2, '0'); }
function mmss(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}
function estimatedElapsedMs() {
  if (!snapshot) return 0;
  if (snapshot.status !== 'running') return snapshot.elapsedMs || 0;
  const estimatedServerNow = Date.now() + serverOffset;
  return snapshot.elapsedBeforeRunMs + Math.max(0, estimatedServerNow - snapshot.startedAt);
}

function render() {
  if (!snapshot) { requestAnimationFrame(render); return; }
  if (!snapshot.current) {
    els.speaker.textContent = 'PRESENTATION TIMER';
    els.title.textContent = 'Waiting for presentation data';
    els.meta.textContent = 'MASTERから発表データを追加してください';
    els.time.textContent = '00:00';
    els.time.classList.remove('overtime', 'timeup');
    requestAnimationFrame(render);
    return;
  }

  const p = snapshot.current;
  const elapsedMs = estimatedElapsedMs();
  const estMs = p.est * 1000;
  const totalMs = (p.est + p.buffer) * 1000;
  els.speaker.textContent = p.speaker;
  els.title.textContent = p.title;
  els.meta.textContent = `EST ${mmss(p.est)} + BUFFER ${mmss(p.buffer)}`;
  els.time.classList.remove('overtime', 'timeup');

  if (snapshot.status === 'time_up' || elapsedMs >= totalMs) {
    els.time.textContent = 'TIME UP';
    els.time.classList.add('timeup');
  } else if (elapsedMs >= estMs) {
    const overtimeSec = Math.floor((elapsedMs - estMs) / 1000);
    if (overtimeSec <= 0) {
      els.time.textContent = '00:00';
    } else {
      els.time.textContent = `+${mmss(overtimeSec)}`;
      els.time.classList.add('overtime');
    }
  } else {
    els.time.textContent = mmss(Math.ceil((estMs - elapsedMs) / 1000));
  }
  requestAnimationFrame(render);
}

socket.on('connect', () => {
  els.connection.textContent = 'ONLINE';
  els.connection.classList.add('online');
});
socket.on('disconnect', () => {
  els.connection.textContent = 'OFFLINE / RECONNECTING';
  els.connection.classList.remove('online');
});
socket.on('state', (s) => {
  snapshot = s;
  serverOffset = s.serverNow - Date.now();
});
render();
