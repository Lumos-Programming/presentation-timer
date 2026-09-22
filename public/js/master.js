const socket = io();
const els = {
  connection: document.getElementById('connection'),
  speaker: document.getElementById('speaker'),
  title: document.getElementById('title'),
  time: document.getElementById('time'),
  est: document.getElementById('est'),
  buffer: document.getElementById('buffer'),
  mode: document.getElementById('mode'),
  order: document.getElementById('order'),
  orderHint: document.getElementById('orderHint'),
  emptyState: document.getElementById('emptyState'),
  previous: document.getElementById('previous'),
  reset: document.getElementById('reset'),
  mainAction: document.getElementById('mainAction'),
  next: document.getElementById('next'),
  addPresentation: document.getElementById('addPresentation'),
  importCsv: document.getElementById('importCsv'),
  exportCsv: document.getElementById('exportCsv'),
  csvFile: document.getElementById('csvFile'),
  dialog: document.getElementById('presentationDialog'),
  form: document.getElementById('presentationForm'),
  dialogTitle: document.getElementById('dialogTitle'),
  editingId: document.getElementById('editingId'),
  formSpeaker: document.getElementById('formSpeaker'),
  formTitle: document.getElementById('formTitle'),
  formEst: document.getElementById('formEst'),
  formBuffer: document.getElementById('formBuffer'),
  formError: document.getElementById('formError'),
  deletePresentation: document.getElementById('deletePresentation'),
  closeDialog: document.getElementById('closeDialog'),
  cancelDialog: document.getElementById('cancelDialog'),
  toast: document.getElementById('toast')
};

let snapshot = null;
let serverOffset = 0;
let orderSignature = '';
let sortable = null;
let toastTimer = null;

function pad2(v) { return String(Math.max(0, v)).padStart(2, '0'); }
function mmss(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}
function emit(type, extra = {}) { socket.emit('command', { type, ...extra }); }
function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.toggle('error', isError);
  els.toast.classList.add('show');
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}
function estimatedElapsedMs() {
  if (!snapshot) return 0;
  if (snapshot.status !== 'running') return snapshot.elapsedMs || 0;
  const estimatedServerNow = Date.now() + serverOffset;
  return snapshot.elapsedBeforeRunMs + Math.max(0, estimatedServerNow - snapshot.startedAt);
}
function parseDuration(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1] || 0), min = Number(m[2]), sec = Number(m[3]);
  if ((m[1] && min >= 60) || sec >= 60) return null;
  return h * 3600 + min * 60 + sec;
}
function setFormError(message = '') {
  els.formError.textContent = message;
  els.formError.hidden = !message;
}
function scheduleLocked() { return snapshot?.status === 'running'; }

function openAddDialog() {
  if (scheduleLocked()) return showToast('タイマー動作中は編集できません。先にPAUSEしてください。', true);
  els.dialogTitle.textContent = '発表を追加';
  els.editingId.value = '';
  els.formSpeaker.value = '';
  els.formTitle.value = '';
  els.formEst.value = '15:00';
  els.formBuffer.value = '03:00';
  els.deletePresentation.hidden = true;
  setFormError();
  els.dialog.showModal();
  requestAnimationFrame(() => els.formSpeaker.focus());
}
function openEditDialog(p) {
  if (scheduleLocked()) return showToast('タイマー動作中は編集できません。先にPAUSEしてください。', true);
  els.dialogTitle.textContent = '発表を編集';
  els.editingId.value = p.id;
  els.formSpeaker.value = p.speaker;
  els.formTitle.value = p.title;
  els.formEst.value = mmss(p.est);
  els.formBuffer.value = mmss(p.buffer);
  els.deletePresentation.hidden = false;
  setFormError();
  els.dialog.showModal();
}
function closeDialog() { els.dialog.close(); setFormError(); }

function renderOrder() {
  if (!snapshot) return;
  const ids = snapshot.presentations.map((p) => p.id).join('|');
  const signature = `${snapshot.version}:${snapshot.currentIndex}:${snapshot.status}:${ids}`;
  if (orderSignature === signature) return;
  orderSignature = signature;

  if (sortable) { sortable.destroy(); sortable = null; }
  els.order.innerHTML = '';
  els.emptyState.hidden = snapshot.presentations.length > 0;

  snapshot.presentations.forEach((p, index) => {
    const item = document.createElement('div');
    const phase = index < snapshot.currentIndex ? 'done' : index === snapshot.currentIndex ? 'current' : 'upcoming';
    item.className = `order-item ${phase}`;
    item.dataset.id = p.id;
    item.innerHTML = `
      <button class="drag-handle" type="button" aria-label="並べ替え">≡</button>
      <div class="order-index">${phase === 'done' ? '✓' : String(index + 1).padStart(2, '0')}</div>
      <button class="order-main" type="button">
        <div class="order-speaker"></div>
        <div class="order-title"></div>
      </button>
      <div class="order-time">${mmss(p.est)} + ${mmss(p.buffer)}</div>
      <button class="edit-button" type="button" aria-label="${p.speaker} を編集">EDIT</button>`;
    item.querySelector('.order-speaker').textContent = p.speaker;
    item.querySelector('.order-title').textContent = p.title;
    item.querySelector('.order-main').addEventListener('click', () => {
      if (index === snapshot.currentIndex) return;
      const ok = confirm(`${p.speaker} を現在の発表に切り替えますか？\nタイマーはリセットされます。`);
      if (ok) emit('select', { index });
    });
    item.querySelector('.edit-button').addEventListener('click', () => openEditDialog(p));
    els.order.appendChild(item);
  });

  const locked = scheduleLocked();
  els.orderHint.textContent = locked
    ? 'タイマー動作中は並べ替え・編集をロックしています。'
    : '≡ をドラッグして並べ替えできます。変更は自動保存されます。';
  els.addPresentation.disabled = locked;
  els.importCsv.disabled = locked;
  els.order.querySelectorAll('.edit-button,.drag-handle').forEach((el) => { el.disabled = locked; });

  if (snapshot.presentations.length && window.Sortable) {
    sortable = new Sortable(els.order, {
      animation: 160,
      handle: '.drag-handle',
      ghostClass: 'drag-ghost',
      chosenClass: 'drag-chosen',
      disabled: locked,
      delay: 120,
      delayOnTouchOnly: true,
      touchStartThreshold: 4,
      onEnd: () => {
        const ids = [...els.order.querySelectorAll('.order-item')].map((el) => el.dataset.id);
        socket.emit('schedule:reorder', { ids }, (result) => {
          if (!result?.ok) {
            showToast(result?.error || '並べ替えに失敗しました。', true);
            orderSignature = '';
            renderOrder();
          } else {
            showToast('発表順を保存しました。');
          }
        });
      }
    });
  }
}

function render() {
  if (!snapshot) { requestAnimationFrame(render); return; }
  const p = snapshot.current;
  const hasCurrent = Boolean(p);

  if (!hasCurrent) {
    els.speaker.textContent = '—';
    els.title.textContent = '発表データを追加してください';
    els.est.textContent = '00:00';
    els.buffer.textContent = '00:00';
    els.time.textContent = '00:00';
    els.mode.textContent = 'IDLE';
    els.time.classList.remove('overtime', 'timeup');
    els.mainAction.textContent = 'START';
    els.mainAction.disabled = true;
    els.previous.disabled = true;
    els.next.disabled = true;
    els.reset.disabled = true;
    renderOrder();
    requestAnimationFrame(render);
    return;
  }

  const elapsedMs = estimatedElapsedMs();
  const estMs = p.est * 1000;
  const totalMs = (p.est + p.buffer) * 1000;
  els.speaker.textContent = p.speaker;
  els.title.textContent = p.title;
  els.est.textContent = mmss(p.est);
  els.buffer.textContent = mmss(p.buffer);
  els.time.classList.remove('overtime', 'timeup');

  if (snapshot.status === 'time_up' || elapsedMs >= totalMs) {
    els.time.textContent = 'TIME UP';
    els.time.classList.add('timeup');
    els.mode.textContent = 'TIME UP';
  } else if (elapsedMs >= estMs) {
    const overtimeSec = Math.floor((elapsedMs - estMs) / 1000);
    if (overtimeSec <= 0) {
      els.time.textContent = '00:00';
      els.mode.textContent = snapshot.status === 'paused' ? 'PAUSED' : 'EST END';
    } else {
      els.time.textContent = `+${mmss(overtimeSec)}`;
      els.time.classList.add('overtime');
      els.mode.textContent = snapshot.status === 'paused' ? 'PAUSED / OVERTIME' : 'OVERTIME';
    }
  } else {
    els.time.textContent = mmss(Math.ceil((estMs - elapsedMs) / 1000));
    els.mode.textContent = snapshot.status.toUpperCase();
  }

  if (snapshot.status === 'running') {
    els.mainAction.textContent = 'PAUSE';
    els.mainAction.onclick = () => emit('pause');
  } else if (snapshot.status === 'paused') {
    els.mainAction.textContent = 'RESUME';
    els.mainAction.onclick = () => emit('resume');
  } else if (snapshot.status === 'time_up') {
    els.mainAction.textContent = 'TIME UP';
    els.mainAction.onclick = null;
  } else {
    els.mainAction.textContent = 'START';
    els.mainAction.onclick = () => emit('start');
  }

  els.mainAction.disabled = snapshot.status === 'time_up';
  els.reset.disabled = false;
  els.previous.disabled = snapshot.currentIndex <= 0;
  els.next.disabled = snapshot.currentIndex >= snapshot.presentations.length - 1;
  renderOrder();
  requestAnimationFrame(render);
}

els.previous.addEventListener('click', () => {
  if (confirm('前の発表に戻りますか？\n現在のタイマーはリセットされます。')) emit('previous');
});
els.next.addEventListener('click', () => {
  if (confirm('次の発表へ進みますか？\n次の発表は停止状態で表示されます。')) emit('next');
});
els.reset.addEventListener('click', () => {
  if (confirm('現在の発表タイマーをリセットしますか？')) emit('reset');
});

els.addPresentation.addEventListener('click', openAddDialog);
els.closeDialog.addEventListener('click', closeDialog);
els.cancelDialog.addEventListener('click', closeDialog);
els.dialog.addEventListener('click', (event) => {
  if (event.target === els.dialog) closeDialog();
});

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  setFormError();
  const est = parseDuration(els.formEst.value);
  const buffer = parseDuration(els.formBuffer.value);
  if (est == null || buffer == null) {
    setFormError('EST / BUFFER は MM:SS 形式（例: 15:00）で入力してください。');
    return;
  }
  const presentation = {
    speaker: els.formSpeaker.value.trim(),
    title: els.formTitle.value.trim(),
    est,
    buffer
  };
  const id = els.editingId.value;
  const eventName = id ? 'schedule:update' : 'schedule:add';
  const payload = id ? { id, presentation } : presentation;
  socket.emit(eventName, payload, (result) => {
    if (!result?.ok) return setFormError(result?.error || '保存に失敗しました。');
    closeDialog();
    showToast(id ? '発表データを更新しました。' : '発表を追加しました。');
  });
});

els.deletePresentation.addEventListener('click', () => {
  const id = els.editingId.value;
  const p = snapshot?.presentations.find((item) => item.id === id);
  if (!p) return;
  if (!confirm(`${p.speaker} の発表を削除しますか？`)) return;
  socket.emit('schedule:delete', { id }, (result) => {
    if (!result?.ok) return setFormError(result?.error || '削除に失敗しました。');
    closeDialog();
    showToast('発表を削除しました。');
  });
});

els.importCsv.addEventListener('click', () => {
  if (scheduleLocked()) return showToast('タイマー動作中はCSVを読み込めません。', true);
  els.csvFile.value = '';
  els.csvFile.click();
});
els.csvFile.addEventListener('change', async () => {
  const file = els.csvFile.files?.[0];
  if (!file) return;
  if (!confirm('CSVを読み込むと現在の発表一覧を置き換えます。続行しますか？')) return;
  try {
    const csv = await file.text();
    socket.emit('schedule:importCsv', { csv }, (result) => {
      if (!result?.ok) return showToast(result?.error || 'CSVの読み込みに失敗しました。', true);
      showToast(`${result.count}件の発表を読み込みました。`);
    });
  } catch (error) {
    showToast(`CSVを読み取れませんでした: ${error.message}`, true);
  }
});

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
els.exportCsv.addEventListener('click', () => {
  if (!snapshot) return;
  const rows = [
    ['speaker', 'title', 'est', 'buffer'],
    ...snapshot.presentations.map((p) => [p.speaker, p.title, mmss(p.est), mmss(p.buffer)])
  ];
  const csv = '\uFEFF' + rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'presentations.csv';
  a.click();
  URL.revokeObjectURL(url);
});

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
