/**
 * =============================================================================
 * MODULE: Timetable
 * Matches the mobile app layout — timeline view with day selector
 * Uses real backend API via Auth.fetch
 * =============================================================================
 */

(function boot() {
  function tryInit() {
    if (typeof CMS === 'undefined' || typeof Modal === 'undefined' || typeof Auth === 'undefined') {
      setTimeout(tryInit, 80);
      return;
    }

    const _orig = NavModule.setActive.bind(NavModule);
    NavModule.setActive = function (key) {
      _orig(key);
      key === 'timetable' ? ttShow() : ttHide();
    };

    if (window.location.hash === '#timetable') {
      ttShow();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const _t$ = (sel, root = document) => root.querySelector(sel);
const _t$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const _ttEsc = (str) => {
  if (!str) return '';
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
};

const TT = {
  data: [],
  courses: [],
  faculties: [],
  activeDay: 'Monday',
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};

/* ── Section HTML ────────────────────────────────────────────────────────── */
function ttInjectSection() {
  if (_t$('#timetable-section')) return;

  const section = document.createElement('section');
  section.id = 'timetable-section';
  section.className = 'fade-in';
  // Start with block so it forces layout paint properly if animation is tricky
  section.style.display = 'block';

  section.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px;">
      <div>
        <h2 class="section-title" style="margin-bottom:0;">Timetable</h2>
        <p style="color:var(--color-slate-400);font-size:13px;margin:4px 0 0;">Manage class schedules</p>
      </div>
      <button id="btn-add-schedule" data-roles="admin" style="
        display:flex;align-items:center;gap:8px;
        padding:0 18px;height:40px;
        background:rgba(229,57,53,0.1);
        border:1px solid rgba(229,57,53,0.3);
        border-radius:var(--radius-sm,6px);
        color:#ef4444;font-weight:700;font-size:13px;
        cursor:pointer;transition:all 0.2s;flex-shrink:0;
      "><i class="fas fa-plus"></i> Schedule Class</button>
    </div>

    <!-- Day Selector -->
    <div id="tt-day-selector" style="display:flex;gap:8px;overflow-x:auto;padding-bottom:12px;margin-bottom:16px;"></div>

    <!-- Timeline Container -->
    <div id="tt-timeline-container" style="display:flex;flex-direction:column;"></div>

    <!-- Empty state -->
    <div id="tt-empty" style="display:none;text-align:center;padding:60px 24px;color:var(--color-slate-400);">
      <i class="fas fa-calendar-times" style="font-size:40px;margin-bottom:16px;display:block;opacity:0.28;"></i>
      <p style="font-size:15px;font-weight:600;color:var(--color-white-soft);margin-bottom:6px;">No classes scheduled</p>
      <p style="font-size:13px;">There are no classes scheduled for <span id="tt-empty-day"></span>.</p>
    </div>
  `;

  const pageContent = _t$('#page-content');
  if (pageContent) pageContent.appendChild(section);

  _t$('#btn-add-schedule', section).addEventListener('click', () => ttOpenModal());
}

/* ── Main Lifecycle ──────────────────────────────────────────────────────── */
function ttShow() {
  ttInjectSection();
  const sec = _t$('#timetable-section');
  if (sec) {
    sec.style.display = 'block';
    sec.style.opacity = '1';
  }
  ttRenderAll();
}

function ttHide() {
  const sec = _t$('#timetable-section');
  if (sec) sec.style.display = 'none';
}

async function ttRenderAll() {
  await ttLoad();
  ttRenderDays();
  ttRenderCards();
}

/* ── Fetch Data ──────────────────────────────────────────────────────────── */
async function ttLoad() {
  try {
    if (Auth.getRole() === 'student') {
      const ttRaw = await Auth.fetch('/student/timetable');
      const ttRes = await ttRaw.json();
      if (ttRes.success && ttRes.data) {
        TT.data = ttRes.data;
      } else {
        TT.data = {};
      }
      TT.courses = [];
      TT.faculties = [];
    } else {
      const [ttRaw, crsRaw, facRaw] = await Promise.all([
        Auth.fetch('/timetable'),
        Auth.fetch('/courses'),
        Auth.fetch('/faculty')
      ]);

      const ttRes = await ttRaw.json();
      const crsRes = await crsRaw.json();
      const facRes = await facRaw.json();

      if (ttRes.success && ttRes.data) {
        TT.data = ttRes.data;
      } else {
        TT.data = [];
      }

      if (crsRes.success && crsRes.data) {
        TT.courses = crsRes.data;
      } else {
        TT.courses = [];
      }

      if (facRes.success && facRes.data) {
        TT.faculties = facRes.data;
      } else {
        TT.faculties = [];
      }
    }
  } catch (err) {
    console.error('Timetable fetch error:', err);
    Toast.show('Failed to load timetable data', 'danger');
  }
}

/* ── Render Logic ────────────────────────────────────────────────────────── */
function ttRenderDays() {
  const container = _t$('#tt-day-selector');
  if (!container) return;

  container.innerHTML = TT.days.map(day => `
    <button class="tt-day-badge ${TT.activeDay === day ? 'tt-day-badge--active' : ''}" data-day="${day}">
      ${day}
    </button>
  `).join('');

  _t$$('.tt-day-badge', container).forEach(btn => {
    btn.addEventListener('click', () => {
      TT.activeDay = btn.dataset.day;
      ttRenderDays();
      ttRenderCards();
    });
  });
}

function ttRenderCards() {
  const container = _t$('#tt-timeline-container');
  const emptyEl = _t$('#tt-empty');
  if (!container) return;

  if (Auth.getRole() === 'student') {
    const currentClasses = TT.data[TT.activeDay] || [];
    if (currentClasses.length === 0) {
      container.innerHTML = '';
      if (emptyEl) {
        _t$('#tt-empty-day').textContent = TT.activeDay;
        emptyEl.style.display = 'block';
      }
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    container.innerHTML = currentClasses.map((cls, index) => {
      const isLast = index === currentClasses.length - 1;
      return `
        <div class="tt-timeline-item">
          <div class="tt-timeline-line-box">
            <div class="tt-timeline-dot"></div>
            ${!isLast ? '<div class="tt-timeline-line"></div>' : ''}
          </div>
          
          <div class="tt-class-card card">
            <div class="tt-class-header">
              <span class="tt-class-time" style="color:var(--color-cyan-400); font-weight:700;">${_ttEsc(cls.time)}</span>
              <div style="background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:4px; font-size:10px; font-weight:600; text-transform:uppercase; color:var(--color-slate-300);">
                ${_ttEsc(cls.status)}
              </div>
            </div>
            
            <div class="tt-subject-name" style="font-size:16px; font-weight:600; margin-bottom:12px; color:var(--color-white);">
              ${_ttEsc(cls.subject)}
            </div>
            
            <div class="tt-class-footer" style="display:flex; justify-content:space-between; color:var(--color-slate-400); font-size:12px;">
              <div class="tt-class-info"><i class="fas fa-user" style="margin-right:6px;"></i> ${_ttEsc(cls.faculty)}</div>
              <div class="tt-class-info"><i class="fas fa-map-marker-alt" style="margin-right:6px;"></i> ${_ttEsc(cls.room || 'No Room')}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    return;
  }

  // Admin / Faculty render logic
  const currentClasses = TT.data
    .filter(s => s.day === TT.activeDay)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (currentClasses.length === 0) {
    container.innerHTML = '';
    if (emptyEl) {
      _t$('#tt-empty-day').textContent = TT.activeDay;
      emptyEl.style.display = 'block';
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  container.innerHTML = currentClasses.map((cls, index) => {
    const isLast = index === currentClasses.length - 1;
    
    // Fallback names if backend didn't populate
    let subjectName = 'Unknown Subject';
    let subjectCode = '';
    if (cls.courseId) {
      subjectName = cls.courseId.name || subjectName;
      subjectCode = cls.courseId.courseCode || '';
    }

    let facName = 'Unassigned';
    if (cls.facultyId) {
      facName = cls.facultyId.name || facName;
    }

    return `
      <div class="tt-timeline-item">
        <div class="tt-timeline-line-box">
          <div class="tt-timeline-dot"></div>
          ${!isLast ? '<div class="tt-timeline-line"></div>' : ''}
        </div>
        
        <div class="tt-class-card card">
          <div class="tt-class-header">
            <span class="tt-class-time">${_ttEsc(cls.startTime)} - ${_ttEsc(cls.endTime)}</span>
            <button class="tt-btn-delete" data-id="${cls._id}" aria-label="Delete schedule" data-roles="admin">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
          
          <div class="tt-subject-name">
            ${_ttEsc(subjectName)} ${subjectCode ? '(' + _ttEsc(subjectCode) + ')' : ''}
          </div>
          
          <div class="tt-class-footer">
            <div class="tt-class-info"><i class="fas fa-user"></i> ${_ttEsc(facName)}</div>
            <div class="tt-class-info"><i class="fas fa-map-marker-alt"></i> ${_ttEsc(cls.room || 'No Room')}</div>
            <div class="tt-class-info"><i class="fas fa-graduation-cap"></i> Sem ${_ttEsc(cls.semester)} ${_ttEsc(cls.department)}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  _t$$('.tt-btn-delete', container).forEach(btn => {
    btn.addEventListener('click', () => ttOpenDelete(btn.dataset.id));
  });
}

/* ── Add Modal ───────────────────────────────────────────────────────────── */
function ttOpenModal() {
  let courseOptions = '<option value="">— Select Course —</option>';
  TT.courses.forEach(c => {
    courseOptions += `<option value="${c._id}">${_ttEsc(c.name)} (${_ttEsc(c.courseCode)})</option>`;
  });

  let facultyOptions = '<option value="">— Select Faculty —</option>';
  TT.faculties.forEach(f => {
    facultyOptions += `<option value="${f._id}">${_ttEsc(f.name)}</option>`;
  });

  let dayOptions = '';
  TT.days.forEach(day => {
    dayOptions += `<option value="${day}" ${TT.activeDay === day ? 'selected' : ''}>${day}</option>`;
  });

  const bodyHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Course *</label>
        <select id="tt-in-course" class="form-control">${courseOptions}</select>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Faculty *</label>
        <select id="tt-in-faculty" class="form-control">${facultyOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Department *</label>
        <input type="text" id="tt-in-dept" class="form-control" placeholder="e.g. Computer Science">
      </div>
      <div class="form-group">
        <label class="form-label">Semester *</label>
        <input type="number" id="tt-in-sem" class="form-control" placeholder="e.g. 3">
      </div>
      <div class="form-group">
        <label class="form-label">Day *</label>
        <select id="tt-in-day" class="form-control">${dayOptions}</select>
      </div>
      <div class="form-group">
        <label class="form-label">Room *</label>
        <input type="text" id="tt-in-room" class="form-control" placeholder="e.g. Room 302">
      </div>
      <div class="form-group">
        <label class="form-label">Start Time *</label>
        <input type="time" id="tt-in-start" class="form-control" value="09:00">
      </div>
      <div class="form-group">
        <label class="form-label">End Time *</label>
        <input type="time" id="tt-in-end" class="form-control" value="10:00">
      </div>
    </div>
  `;

  const modal = Modal.create({
    id: 'modal-tt-add',
    title: 'Schedule Class',
    size: 'md',
    bodyHTML,
    footerHTML: `
      <button id="btn-tt-save" style="
        padding:9px 20px;border-radius:6px;
        background:var(--color-cyan-400);color:#fff;
        font-size:13px;font-weight:700;border:none;cursor:pointer;
      ">Schedule Class</button>
      <button id="btn-tt-cancel" style="
        padding:9px 20px;border-radius:6px;
        background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.22);
        color:var(--color-slate-300);font-size:13px;font-weight:600;cursor:pointer;
      ">Cancel</button>
    `
  });

  _t$('#btn-tt-cancel', modal.footer()).addEventListener('click', () => modal.close());
  _t$('#btn-tt-save', modal.footer()).addEventListener('click', async () => {
    const payload = {
      courseId: _t$('#tt-in-course').value,
      facultyId: _t$('#tt-in-faculty').value,
      department: _t$('#tt-in-dept').value.trim(),
      semester: _t$('#tt-in-sem').value.trim(),
      day: _t$('#tt-in-day').value,
      room: _t$('#tt-in-room').value.trim(),
      startTime: _t$('#tt-in-start').value,
      endTime: _t$('#tt-in-end').value
    };

    if (!payload.courseId || !payload.facultyId || !payload.department || !payload.semester || !payload.room || !payload.startTime || !payload.endTime) {
      Toast.show('Please fill all required fields', 'warning');
      return;
    }

    try {
      const raw = await Auth.fetch('/timetable', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const res = await raw.json();
      if (res.success) {
        Toast.show('Class scheduled successfully!', 'success');
        modal.close();
        ttRenderAll();
      } else {
        Toast.show(res.message || 'Action failed', 'danger');
      }
    } catch (err) {
      Toast.show('Network error', 'danger');
    }
  });

  modal.open();
}

/* ── Delete Modal ────────────────────────────────────────────────────────── */
function ttOpenDelete(id) {
  const c = TT.data.find(x => x._id === id);
  if (!c) return;
  
  let subjectName = c.courseId ? c.courseId.name : 'this class';

  const modal = Modal.create({
    id: 'modal-tt-del',
    title: 'Cancel Class',
    size: 'sm',
    bodyHTML: `
      <div style="text-align:center;padding:10px 0;">
        <i class="fas fa-calendar-times" style="font-size:32px;color:var(--color-danger);margin-bottom:12px;"></i>
        <p style="font-size:14px;color:#fff;margin:0;">Are you sure you want to cancel <strong>${_ttEsc(subjectName)}</strong>?</p>
        <p style="font-size:12px;color:var(--color-slate-400);margin-top:4px;">This action cannot be undone.</p>
      </div>
    `,
    footerHTML: `
      <button id="btn-tt-del-confirm" style="
        padding:9px 20px;border-radius:6px;
        background:var(--color-danger);color:#fff;
        font-size:13px;font-weight:700;border:none;cursor:pointer;
      ">Delete</button>
      <button id="btn-tt-del-cancel" style="
        padding:9px 20px;border-radius:6px;
        background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.22);
        color:var(--color-slate-300);font-size:13px;font-weight:600;cursor:pointer;
      ">Cancel</button>
    `
  });

  _t$('#btn-tt-del-cancel', modal.footer()).addEventListener('click', () => modal.close());
  _t$('#btn-tt-del-confirm', modal.footer()).addEventListener('click', async () => {
    try {
      const raw = await Auth.fetch('/timetable/' + id, { method: 'DELETE' });
      const res = await raw.json();
      if (res.success) {
        Toast.show('Class cancelled', 'success');
        modal.close();
        ttRenderAll();
      } else {
        Toast.show(res.message || 'Delete failed', 'danger');
      }
    } catch (err) {
      Toast.show('Network error', 'danger');
    }
  });

  modal.open();
}
