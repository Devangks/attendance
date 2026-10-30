const KEY = 'attendance-v1';

function ds(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function pd(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getLocalDay(d = new Date()) {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function getInitialState() {
  return {
    version: 1,
    config: {
      defaultTarget: 75,
      odCountsAsPresent: false,
      semesterStartDate: ds(),
      semesterEndDate: ds(new Date(Date.now() + 120 * 24 * 60 * 60 * 1000))
    },
    subjects: [],
    timetable: [],
    records: [],
    holidays: [],
    assignments: []
  };
}

let state = loadData();

function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : getInitialState();
  } catch (e) {
    console.error('Data corrupted, resetting', e);
    return getInitialState();
  }
}

function saveData() {
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

function stats(subjectId) {
  const sub = state.subjects.find((s) => s.id === subjectId);
  if (!sub) return { held: 0, attended: 0, pct: 100, safe: 0, rec: 0, isSafe: true };

  const holidaysSet = new Set(state.holidays.map((h) => h.date));
  const subRecords = state.records.filter((r) => r.subjectId === subjectId && !holidaysSet.has(r.date));

  let attended = sub.initialBalance ? sub.initialBalance.attended : 0;
  let held = sub.initialBalance ? sub.initialBalance.held : 0;

  for (const r of subRecords) {
    if (r.status === 'PRESENT') {
      attended++;
      held++;
    } else if (r.status === 'ABSENT') {
      held++;
    } else if (r.status === 'OD') {
      if (state.config.odCountsAsPresent) {
        attended++;
        held++;
      }
    } else if (r.status === 'CANCELLED') {
      // Unaffected
    }
  }

  const target = sub.targetPercent || state.config.defaultTarget || 75;
  const isSafe = held === 0 || (attended * 100 >= target * held);

  const pct = held === 0 ? 100 : Math.floor((attended * 1000) / held) / 10;

  let safe = 0;
  let rec = 0;

  if (held > 0) {
    if (isSafe) {
      safe = Math.floor((attended * 100 - target * held) / target);
      safe = Math.max(0, safe);
    } else {
      rec = Math.ceil((target * held - attended * 100) / (100 - target));
      rec = Math.max(0, rec);
    }
  }

  return { held, attended, pct, safe, rec, isSafe };
}

function setSlot(subjectId, date, slotId, status, isExtra = false) {
  const id = isExtra ? `extra_${Date.now()}_${Math.random().toString(36).substr(2, 5)}` : `${subjectId}_${date}_${slotId}`;
  const existingIdx = state.records.findIndex((r) => r.id === id);

  const rec = {
    id,
    subjectId,
    date,
    slotId: isExtra ? null : slotId,
    status,
    isExtraClass: isExtra,
    timestamp: Date.now()
  };

  if (existingIdx >= 0) {
    if (state.records[existingIdx].status === status) {
      state.records.splice(existingIdx, 1);
    } else {
      state.records[existingIdx] = rec;
    }
  } else {
    state.records.push(rec);
  }
  saveData();
}

let currentTab = 'subjects';
let viewingDate = ds();

function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      navBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      const activePanel = document.getElementById(`tab-${currentTab}`);
      if (activePanel) activePanel.classList.add('active');
      document.getElementById('page-title').textContent = btn.querySelector('span').textContent;
      renderHeaderActions();
      render();
    });
  });
}

function renderHeaderActions() {
  const actions = document.getElementById('header-actions');
  actions.innerHTML = '';
  if (currentTab === 'subjects') {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary glass';
    btn.textContent = '+ Add Subject';
    btn.onclick = promptAddSubject;
    actions.appendChild(btn);
  }
}

function renderSubjects() {
  const grid = document.getElementById('subjects-grid');
  grid.innerHTML = '';

  let totalAttended = 0;
  let totalHeld = 0;

  state.subjects.forEach((sub) => {
    const st = stats(sub.id);
    totalAttended += st.attended;
    totalHeld += st.held;

    const card = document.createElement('div');
    card.className = 'subject-card glass';
    card.innerHTML = `
      <div class="subject-card-header">
        <div>
          <h3 class="subject-title">${escapeHtml(sub.name)}</h3>
          <span class="subject-sub">Target: ${sub.targetPercent}%</span>
        </div>
        <div class="subject-pct-box">
          <div class="pct-val ${st.isSafe ? 'safe' : 'danger'}">${st.pct}%</div>
        </div>
      </div>
      <div class="subject-bunk-info">
        ${st.isSafe ? `Can skip <b>${st.safe}</b> more lectures safely.` : `Attend next <b>${st.rec}</b> classes consecutively.`}
      </div>
      <div class="subject-card-actions">
        <span style="font-size:12px;color:var(--text-muted)">${st.attended} / ${st.held} attended</span>
        <div class="counter-btns">
          <button class="btn btn-secondary glass" onclick="event.stopPropagation(); quickAdd('${sub.id}', 'PRESENT')">+ Attended</button>
          <button class="btn btn-secondary glass" onclick="event.stopPropagation(); quickAdd('${sub.id}', 'ABSENT')">+ Missed</button>
        </div>
      </div>
    `;
    card.onclick = () => openSubjectCalendar(sub.id);
    grid.appendChild(card);
  });

  const aggregatePct = totalHeld === 0 ? 100 : Math.floor((totalAttended * 1000) / totalHeld) / 10;
  document.getElementById('overall-percent').textContent = `${aggregatePct}%`;
  document.getElementById('overall-attended').textContent = totalAttended;
  document.getElementById('overall-held').textContent = totalHeld;

  const statusBadge = document.getElementById('overall-status');
  if (aggregatePct >= state.config.defaultTarget) {
    statusBadge.className = 'status-badge safe';
    statusBadge.textContent = 'Meeting Attendance Targets';
  } else {
    statusBadge.className = 'status-badge danger';
    statusBadge.textContent = 'Shortage Warning';
  }
}

function quickAdd(subjectId, status) {
  setSlot(subjectId, ds(), `quick_${Date.now()}`, status, true);
}

function renderDailyLog() {
  document.getElementById('current-date-label').textContent = viewingDate;
  const isToday = viewingDate === ds();
  document.getElementById('current-day-label').textContent = isToday ? 'Today' : pd(viewingDate).toLocaleDateString('en-US', { weekday: 'long' });

  const list = document.getElementById('daily-classes-list');
  list.innerHTML = '';

  const dayOfWeek = getLocalDay(pd(viewingDate));
  const scheduledSlots = state.timetable.filter((t) => t.dayOfWeek === dayOfWeek);

  if (state.holidays.some((h) => h.date === viewingDate)) {
    list.innerHTML = `<div class="card glass" style="padding:24px;text-align:center;color:var(--text-secondary)">Holiday Marked: ${escapeHtml(state.holidays.find((h) => h.date === viewingDate).reason || 'Official Leave')}</div>`;
    return;
  }

  if (scheduledSlots.length === 0) {
    list.innerHTML = `<div class="card glass" style="padding:24px;text-align:center;color:var(--text-muted)">No classes scheduled for this day.</div>`;
    return;
  }

  scheduledSlots.forEach((slot) => {
    const sub = state.subjects.find((s) => s.id === slot.subjectId);
    if (!sub) return;

    const recordId = `${sub.id}_${viewingDate}_${slot.id}`;
    const rec = state.records.find((r) => r.id === recordId);
    const currStatus = rec ? rec.status : null;

    const row = document.createElement('div');
    row.className = 'class-slot-row glass';
    row.innerHTML = `
      <div class="class-slot-info">
        <h4>${escapeHtml(sub.name)}</h4>
        <span>${slot.startTime} - ${slot.endTime} ${slot.room ? `| ${escapeHtml(slot.room)}` : ''}</span>
      </div>
      <div class="slot-action-pills">
        <button class="pill-btn present ${currStatus === 'PRESENT' ? 'active' : ''}" onclick="setSlot('${sub.id}', '${viewingDate}', '${slot.id}', 'PRESENT')">P</button>
        <button class="pill-btn absent ${currStatus === 'ABSENT' ? 'active' : ''}" onclick="setSlot('${sub.id}', '${viewingDate}', '${slot.id}', 'ABSENT')">A</button>
        <button class="pill-btn cancel ${currStatus === 'CANCELLED' ? 'active' : ''}" onclick="setSlot('${sub.id}', '${viewingDate}', '${slot.id}', 'CANCELLED')">C</button>
        <button class="pill-btn od ${currStatus === 'OD' ? 'active' : ''}" onclick="setSlot('${sub.id}', '${viewingDate}', '${slot.id}', 'OD')">OD</button>
      </div>
    `;
    list.appendChild(row);
  });
}

document.getElementById('btn-prev-day').onclick = () => {
  const d = pd(viewingDate);
  d.setDate(d.getDate() - 1);
  viewingDate = ds(d);
  render();
};

document.getElementById('btn-next-day').onclick = () => {
  const d = pd(viewingDate);
  d.setDate(d.getDate() + 1);
  viewingDate = ds(d);
  render();
};

document.getElementById('btn-mark-all').onclick = () => {
  const dayOfWeek = getLocalDay(pd(viewingDate));
  const scheduledSlots = state.timetable.filter((t) => t.dayOfWeek === dayOfWeek);
  scheduledSlots.forEach((s) => setSlot(s.subjectId, viewingDate, s.id, 'PRESENT'));
};

const modal = document.getElementById('modal-container');
document.getElementById('modal-close').onclick = () => modal.classList.remove('open');

function openSubjectCalendar(subjectId) {
  const sub = state.subjects.find((s) => s.id === subjectId);
  if (!sub) return;

  const body = document.getElementById('modal-body');
  document.getElementById('modal-title').textContent = `${sub.name} — History`;

  const subRecords = state.records.filter((r) => r.subjectId === subjectId);

  let html = `<div style="display:flex;flex-direction:column;gap:12px;">`;
  html += `<p style="font-size:13px;color:var(--text-secondary)">Tap on any past record to toggle or correct status:</p>`;

  if (subRecords.length === 0) {
    html += `<p style="text-align:center;color:var(--text-muted);padding:18px;">No attendance logged yet for this subject.</p>`;
  } else {
    subRecords.slice(-15).reverse().forEach((r) => {
      html += `
        <div class="class-slot-row glass" style="background:rgba(255,255,255,0.03)">
          <div>
            <b>${r.date}</b>
            <div style="font-size:11px;color:var(--text-muted)">${r.isExtraClass ? 'Extra / Manual Class' : 'Regular Slot'}</div>
          </div>
          <div class="slot-action-pills">
            <button class="pill-btn present ${r.status === 'PRESENT' ? 'active' : ''}" onclick="updateRecord('${r.id}', 'PRESENT')">P</button>
            <button class="pill-btn absent ${r.status === 'ABSENT' ? 'active' : ''}" onclick="updateRecord('${r.id}', 'ABSENT')">A</button>
            <button class="pill-btn cancel ${r.status === 'CANCELLED' ? 'active' : ''}" onclick="updateRecord('${r.id}', 'CANCELLED')">C</button>
            <button class="pill-btn od ${r.status === 'OD' ? 'active' : ''}" onclick="updateRecord('${r.id}', 'OD')">OD</button>
          </div>
        </div>
      `;
    });
  }
  html += `</div>`;
  body.innerHTML = html;
  modal.classList.add('open');
}

window.updateRecord = function (id, status) {
  const rec = state.records.find((r) => r.id === id);
  if (rec) {
    rec.status = status;
    saveData();
    openSubjectCalendar(rec.subjectId);
  }
};

function promptAddSubject() {
  const name = prompt('Subject Name:');
  if (!name) return;
  const target = parseInt(prompt('Target Attendance % (default: 75):', '75')) || 75;

  state.subjects.push({
    id: `sub_${Date.now()}`,
    name,
    targetPercent: target,
    initialBalance: { attended: 0, held: 0 }
  });
  saveData();
}

document.getElementById('btn-export-json').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `attendance_backup_${ds()}.json`;
  a.click();
};

document.getElementById('file-import').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (imported.subjects && imported.records) {
        state = imported;
        saveData();
        alert('Backup successfully restored!');
      } else {
        alert('Invalid backup schema file.');
      }
    } catch (err) {
      alert('Error parsing JSON backup.');
    }
  };
  reader.readAsText(file);
};

document.getElementById('btn-reset-sem').onclick = () => {
  if (confirm('Warning: This will delete all attendance records and reset the semester. Continue?')) {
    state.records = [];
    saveData();
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('PWA Service Worker registered:', reg.scope))
      .catch((err) => console.error('PWA registration failed:', err));
  });
}

function render() {
  if (currentTab === 'subjects') renderSubjects();
  if (currentTab === 'daily') renderDailyLog();
}

initNavigation();
renderHeaderActions();
render();
