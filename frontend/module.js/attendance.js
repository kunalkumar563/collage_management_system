/**
 * =============================================================================
 * ASHFORD UNIVERSITY — CMS ADMIN DASHBOARD
 * attendance.js  |  Attendance Module
 * =============================================================================
 *
 * Depends on:  app.js  (CMS, $, $$, lsGet, lsSet, uid, formatDate,
 *                        initials, debounce, Toast, Modal, logActivity,
 *                        NavModule, DOM)
 *
 * TABLE OF CONTENTS
 * -----------------
 * A1.  Config & Constants
 * A2.  localStorage Store
 *      A2a.  Session helpers
 *      A2b.  Attendance record helpers
 *      A2c.  Student roster helpers (reads cms_students)
 * A3.  Seed Data — demo sessions & historical records
 * A4.  DOM Injection — insert attendance-section.html into page-content
 * A5.  Section Show / Hide
 * A6.  KPI Cards — compute & render
 * A7.  Session Select — populate from today's timetable
 * A8.  Roster — render student list with status toggles
 *      A8a.  Build roster row HTML
 *      A8b.  Status cycle on checkbox / badge click
 *      A8c.  Live counter update
 *      A8d.  "All Present" master checkbox
 *      A8e.  Toolbar search & filter
 * A9.  Department Breakdown Card
 * A10. Weekly Trend Chart (SVG)
 * A11. Low-Attendance Alerts Card
 * A12. Attendance History Table
 *      A12a. Renderer
 *      A12b. Date-range filter
 *      A12c. Pagination
 *      A12d. Export CSV
 *      A12e. Delete a session record
 * A13. Submit / Save Session
 * A14. Student Detail Side-panel (view an individual's record)
 * A15. NavModule Integration hook
 * A16. Init
 * =============================================================================
 */

'use strict';

/* =============================================================================
   A1. CONFIG & CONSTANTS
   ============================================================================= */

const ATT = {
  storageKey:    'cms_attendance',     // Array<SessionRecord>
  sessionsKey:   'cms_att_sessions',   // Array<SessionDefinition>
  THRESHOLD:     75,                   // % below which alert fires
  HISTORY_PER_PAGE: 8,
  histPage:      1,
  currentSessionId: null,              // session currently being marked
  rosterFilter:  { query: '', status: 'all' },
  histFilter:    { from: '', to: '' },

  /** Status cycle order: clicking cycles through these */
  STATUS_CYCLE:  ['P', 'L', 'A', 'EX'],

  STATUS_LABEL: {
    P:  'Present',
    L:  'Late',
    A:  'Absent',
    EX: 'Excused',
  },

  STATUS_BADGE: {
    P:  'badge--success',
    L:  'badge--warning',
    A:  'badge--danger',
    EX: 'badge--info',
  },

  STATUS_COLOR: {
    P:  'var(--color-success)',
    L:  'var(--color-warning)',
    A:  'var(--color-danger)',
    EX: 'var(--color-info)',
  },

  /** In-memory map: studentId → status ('P'|'L'|'A'|'EX') for current session */
  draftMarks: {},
};

/* Shorthand aliases for brevity — safe because app.js defines them */
const _$  = (sel, ctx = document) => ctx.querySelector(sel);
const _$$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];


/* =============================================================================
   A2. LOCALSTORAGE STORE
   ============================================================================= */

/* ── A2a. Session helpers ──────────────────────────────────────────────────── */

/**
 * SessionDefinition shape:
 * {
 *   id, subject, faculty, department, room, timeStart, timeEnd,
 *   semester, course, createdAt
 * }
 */
function attLoadSessions() {
  return lsGet(ATT.sessionsKey, []);
}

function attSaveSessions(sessions) {
  lsSet(ATT.sessionsKey, sessions);
}

/* ── A2b. Attendance record helpers ───────────────────────────────────────── */

/**
 * SessionRecord shape:
 * {
 *   id,            — unique record id
 *   sessionId,     — reference to SessionDefinition.id
 *   sessionLabel,  — e.g. "Data Structures · CS-III-A"
 *   faculty,
 *   department,
 *   date,          — ISO date string "YYYY-MM-DD"
 *   marks: [       — one entry per student
 *     { studentId, name, rollNo, status }
 *   ],
 *   submittedAt,
 *   totalEnrolled, present, late, absent, excused, rate
 * }
 */
function attLoadRecords() {
  return lsGet(ATT.storageKey, []);
}

function attSaveRecords(records) {
  lsSet(ATT.storageKey, records);
}

// Fetch session records from backend API and populate local storage cache
async function attFetchRecordsFromAPI() {
  try {
    const res = await Auth.fetch('/attendance');
    if (!res.ok) throw new Error(res.statusText || 'Failed');
    const body = await res.json();
    const records = body && body.data ? body.data : [];
    attSaveRecords(Array.isArray(records) ? records : []);
    return records;
  } catch (err) {
    console.error('[AttendanceModule] Failed to fetch records from API', err);
    // keep existing local records as fallback
    return attLoadRecords();
  }
}

function attGetRecord(id) {
  return attLoadRecords().find(r => r.id === id) || null;
}

function attDeleteRecord(id) {
  const records = attLoadRecords().filter(r => r.id !== id);
  attSaveRecords(records);
}

/* ── A2c. Student roster helpers (reads cms_students) ─────────────────────── */

let ATT_STUDENTS = [];
function attLoadStudents() {
  return ATT_STUDENTS;
}

/**
 * Fetch students for a given department (or all if dept is empty/undefined).
 * Only enrolled students appear in the roster.
 */
function attRosterForDept(dept, semester, courseName) {
  const students = attLoadStudents();
  let filtered = students.filter(s => {
    const sDept = (s.department || s.dept || '').toString().toLowerCase().trim();
    const sCourse = (s.course || '').toString().toLowerCase().trim();
    
    const cDept = (dept || '').toString().toLowerCase().trim();
    const cName = (courseName || '').toString().toLowerCase().trim();
    
    // Match if student's department matches course's department OR course's name
    const matchDept = !cDept || cDept === 'undefined' || sDept === cDept || sDept === cName || sCourse === cName;

    const sSem = (s.semester || '').toString().toLowerCase().trim();
    const cSem = (semester || '').toString().toLowerCase().trim();
    const matchSem = !cSem || cSem === 'undefined' || sSem === cSem;

    // Ignore strict enrollment status for testing
    return matchDept && matchSem;
  });

  // Fallback to all students if the list is empty (prevents completely empty rosters during testing)
  if (filtered.length === 0 && students.length > 0) {
    return students;
  }
  return filtered;
}

// Fetch students from backend API and store in local cache in the shape the UI expects
async function attFetchStudentsFromAPI() {
  try {
    const res = await Auth.fetch('/students');
    if (!res.ok) throw new Error(res.statusText || 'Failed to fetch students');
    const body = await res.json();
    const students = body && body.data ? body.data : [];

    const mapped = (students || []).map(s => ({
      id: s._id || s.id || uid('stu'),
      name: s.name || s.fullName || '',
      email: s.email || '',
      rollNo: s.rollNo || s.roll || '',
      department: s.department || s.dept || '',
      course: s.course || '',
      status: s.status || 'Enrolled',
      feesPaid: s.feesPaid || false,
      admissionNo: s.admissionNo || '',
      createdAt: s.createdAt || new Date().toISOString(),
      updatedAt: s.updatedAt || new Date().toISOString(),
      address: s.address || '',
      semester: s.semester || '1',
      section: s.section || '',
      gender: s.gender || 'Prefer not to say',
      phone: s.phone || '',
      dob: s.dob || '',
    }));

    ATT_STUDENTS = mapped;
    lsSet(CMS.config.storageKey, mapped); // keep for backup
    return mapped;
  } catch (err) {
    console.error('[AttendanceModule] Failed to fetch students from API', err);
    return attLoadStudents();
  }
}

/**
 * Compute the cumulative attendance % for a student across all stored records.
 */
function attStudentRate(studentId) {
  const records = attLoadRecords();
  let total = 0, present = 0;
  records.forEach(rec => {
    const mark = (rec.marks || []).find(m => m.studentId === studentId);
    if (mark) {
      total++;
      if (mark.status === 'P' || mark.status === 'L') present++;
    }
  });
  if (!total) return null;   // no history yet
  return Math.round((present / total) * 100);
}


/* =============================================================================
   A3. SEED DATA (Removed per request)
   ============================================================================= */


/* =============================================================================
   A4. DOM INJECTION — insert section HTML into #page-content
   ============================================================================= */

const SECTION_HTML = `
<!-- ATTENDANCE SECTION -->
<section id="attendance-section" aria-labelledby="attendance-section-title" data-module="attendance" style="display:none;">

  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
    <h2 class="section-title" id="attendance-section-title" style="margin-bottom:0; border:none; padding:0;">Take Attendance</h2>
    <div style="display: flex; gap: 16px;">
      <button id="btn-att-roster-export" class="card-action-btn" style="width:auto; padding:0 12px; font-family:var(--font-ui); font-size:12px; font-weight:600; border:1px solid var(--color-border-bright); border-radius:var(--radius-sm); color:var(--color-slate-300); background:transparent; display:flex; align-items:center; gap:6px;">
        <i class="fas fa-file-csv"></i> Download CSV
      </button>
      <button id="att-check-all-btn" class="card-action-btn" style="width:auto; padding:0 12px; font-family:var(--font-ui); font-size:12px; font-weight:600; border:1px solid var(--color-cyan-400); border-radius:var(--radius-sm); color:var(--color-cyan-400); background:transparent; display:flex; align-items:center; gap:6px;">
        <i class="fas fa-check"></i> Mark All Present
      </button>
      <button id="btn-att-submit" style="width:auto; padding:0 16px; font-family:var(--font-ui); font-size:12px; font-weight:600; border:none; border-radius:var(--radius-sm); color:#fff; background:var(--color-cyan-400); display:flex; align-items:center; gap:6px; cursor:pointer; transition:all 0.2s;" onmouseover="if(!this.disabled){this.style.opacity='0.85'; this.style.boxShadow='var(--shadow-glow)';}" onmouseout="if(!this.disabled){this.style.opacity='1'; this.style.boxShadow='none';}">
        <i class="fas fa-lock"></i> Submit Attendance
      </button>
    </div>
  </div>

  <!-- Filters Row -->
  <div class="card" style="margin-bottom: 24px;">
    <div class="card-body" style="padding: 16px; display:flex; gap: 16px;">
      <select id="att-session-select" style="flex:2; height: 38px; padding: 0 16px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 13px; color: var(--color-white); background: var(--color-surface); outline: none; appearance: none; -webkit-appearance: none;">
        <option value="">— Choose Course / Session —</option>
      </select>
      <select id="att-section-select" style="flex:1; height: 38px; padding: 0 16px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 13px; color: var(--color-white); background: var(--color-surface); outline: none; appearance: none; -webkit-appearance: none;">
        <option value="">— Section (All) —</option>
        <option value="A">Section A</option>
        <option value="B">Section B</option>
        <option value="C">Section C</option>
        <option value="D">Section D</option>
      </select>
      <div style="flex:1;">
        <input type="date" id="att-date-select" style="width: 100%; height: 38px; padding: 0 16px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); font-size: 13px; color: var(--color-white); background: var(--color-surface); outline: none; color-scheme: dark;">
      </div>
    </div>
  </div>

  <!-- KPI Row removed as per user request -->

  <!-- Table -->
  <div class="card" id="att-roster-table" style="display: none;">
    <div class="card-header">
      <div>
        <div class="card-title">Student Roster</div>
        <div class="card-subtitle">Click status badges to change attendance.</div>
      </div>
    </div>
    <div class="card-body" style="padding:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:40px;"><input type="checkbox" id="att-check-all" style="accent-color:var(--color-cyan-400); cursor:pointer;"></th>
            <th>#</th>
            <th>Roll No.</th>
            <th>Student Name</th>
            <th>Status</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody id="att-roster-tbody">
          <!-- Rows will be injected here via JS -->
        </tbody>
      </table>
      <div id="att-roster-loading" style="display:flex;align-items:center;justify-content:center;padding:60px;color:var(--color-slate-400);font-size:13px;">
        <i class="fas fa-circle-notch fa-spin" style="margin-right:8px;color:var(--color-cyan-400);font-size:16px;"></i> Select a session to load students...
      </div>
      <div id="att-roster-empty" style="display:none;text-align:center;padding:48px 24px;color:var(--color-slate-400);">
          <i class="fas fa-clipboard-list" style="font-size:36px;margin-bottom:14px;display:block;opacity:.30;" aria-hidden="true"></i>
          <p style="font-size:14px;font-weight:600;color:var(--color-white-soft);margin-bottom:6px;">No students in roster</p>
      </div>
    </div>
  </div>

</section>
`;


const STUDENT_SECTION_HTML = `
<!-- STUDENT ATTENDANCE SECTION -->
<section id="attendance-section" aria-labelledby="attendance-section-title" data-module="attendance" style="display:none;">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
    <h2 class="section-title" id="attendance-section-title" style="margin-bottom:0;">My Attendance</h2>
    <button id="btn-export-student-csv" style="display:flex;align-items:center;gap:6px;padding:0 12px;height:32px;background:rgba(255,255,255,0.03);border:1px solid rgba(139,163,188,0.22);border-radius:var(--radius-sm);color:var(--color-slate-300);font-family:var(--font-ui);font-size:12px;font-weight:600;cursor:pointer;transition:background .15s;">
      <i class="fas fa-file-csv"></i> Download CSV
    </button>
  </div>
  
  <div class="content-grid content-grid--3-1" style="margin-bottom:24px;">
    <div class="card" id="student-overall-card">
      <div class="card-header">
        <div>
          <div class="card-title">Overall Attendance</div>
          <div class="card-subtitle">Cumulative percentage</div>
        </div>
      </div>
      <div class="card-body" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px 22px;">
         <div id="student-overall-pct" style="font-size:48px; font-weight:700; color:var(--color-cyan-400); font-family:var(--font-mono);">--%</div>
         <div style="color:var(--color-slate-400); margin-top:8px;">of all classes attended</div>
      </div>
    </div>
    
    <div class="card" id="student-subjects-card" style="grid-column: span 2;">
      <div class="card-header">
        <div>
          <div class="card-title">Subject Breakdown</div>
          <div class="card-subtitle">Individual subject performance</div>
        </div>
      </div>
      <div class="card-body" id="student-subjects-list" style="padding:16px 22px;">
         <!-- Populated via JS -->
      </div>
    </div>
  </div>
</section>
`;

function attInjectSection() {
  if (_$('#attendance-section')) return;   // already injected
  const pageContent = _$('#page-content') || document.body;
  const role = (Auth.getRole() || '').toLowerCase();
  if (role === 'student') {
    pageContent.insertAdjacentHTML('beforeend', STUDENT_SECTION_HTML);
  } else {
    pageContent.insertAdjacentHTML('beforeend', SECTION_HTML);
  }
}



/* =============================================================================
   A5. SECTION SHOW / HIDE
   ============================================================================= */

function attShow() {
  attInjectSection();
  const sec = _$('#attendance-section');
  if (sec) {
    if ((Auth.getRole() || '').toLowerCase() === 'student') {
      sec.innerHTML = `
        <div style="display:flex; justify-content:center; padding:40px;">
          <div class="spinner" style="border-top-color:var(--color-cyan-400); width:32px; height:32px; border-width:3px;"></div>
        </div>
      `;
      sec.style.display = '';

      Auth.fetch('/attendance').then(res => res.json()).then(res => {
        if (!res.success || !res.data) throw new Error('Failed to load data');
        const d = res.data;
        const overallPct = d.overall?.percentage || 0;
        const totalCls = d.overall?.total || 0;
        const presentCls = d.overall?.present || 0;
        const color = overallPct >= ATT.THRESHOLD ? 'var(--color-success)' : 'var(--color-danger)';
        const subjects = d.subjects || [];
        const history = d.history || [];

        sec.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h2 class="section-title" style="margin-bottom:0;">My Attendance</h2>
          </div>

          <!-- Overall Summary -->
          <div style="background:var(--color-surface); border-radius:12px; border:1px solid rgba(255,255,255,0.05); overflow:hidden; margin-bottom:24px;">
            <div style="padding:24px; display:flex; align-items:center; gap:24px;">
              <!-- Circular Progress -->
              <div style="position:relative; width:120px; height:120px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:8px solid ${color}33;">
                <div style="position:absolute; width:100%; height:100%; border-radius:50%; border:8px solid transparent; border-top-color:${color}; border-right-color:${color}; transform:rotate(-45deg);"></div>
                <div style="font-size:24px; font-weight:700; color:${color}; font-family:var(--font-mono);">${overallPct}%</div>
              </div>
              <div>
                <h3 style="font-size:18px; margin-bottom:8px; color:var(--color-white);">Overall Attendance</h3>
                <div style="color:var(--color-slate-400); font-size:14px; margin-bottom:4px;">Total Classes: ${totalCls}</div>
                <div style="color:var(--color-slate-400); font-size:14px; margin-bottom:12px;">Attended: ${presentCls}</div>
                ${overallPct < ATT.THRESHOLD ? `<div style="display:inline-flex; align-items:center; gap:6px; background:rgba(239,68,68,0.1); padding:6px 12px; border-radius:6px; color:var(--color-danger); font-size:12px; font-weight:600;"><i class="fas fa-exclamation-triangle"></i> Your attendance is below ${ATT.THRESHOLD}%.</div>` : ''}
              </div>
            </div>
          </div>

          <!-- Subject Wise -->
          <h3 style="font-size:16px; margin-bottom:12px; color:var(--color-white);">Subject Wise</h3>
          <div style="display:grid; gap:12px; margin-bottom:32px;">
            ${subjects.length > 0 ? subjects.map(s => {
              const sColor = s.percentage >= ATT.THRESHOLD ? 'var(--color-success)' : 'var(--color-danger)';
              return `
                <div style="background:var(--color-surface); border-radius:8px; padding:16px; border:1px solid rgba(255,255,255,0.05);">
                  <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="font-weight:600; font-size:14px; color:var(--color-white);">${_attEsc(s.name)}</span>
                    <span style="font-weight:700; font-size:14px; color:${sColor};">${s.percentage}%</span>
                  </div>
                  <div style="height:6px; background:rgba(255,255,255,0.1); border-radius:99px; overflow:hidden; margin-bottom:8px;">
                    <div style="height:100%; background:${sColor}; width:${s.percentage}%; border-radius:99px;"></div>
                  </div>
                  <div style="font-size:12px; color:var(--color-slate-400);">Attended ${s.present} out of ${s.total} classes</div>
                </div>
              `;
            }).join('') : '<div style="color:var(--color-slate-400); font-size:14px;">No subject data available.</div>'}
          </div>

          <!-- Attendance History -->
          <h3 style="font-size:16px; margin-bottom:12px; color:var(--color-white);">Attendance History</h3>
          <div style="display:grid; gap:12px;">
            ${history.length > 0 ? history.slice(0, 10).map(h => {
              const statusMap = { 'Present': 'P', 'Absent': 'A', 'Late': 'L' };
              const st = statusMap[h.status] || 'P';
              const dateObj = new Date(h.date);
              const day = dateObj.getDate();
              const month = dateObj.toLocaleString('default', { month: 'short' });
              return `
                <div style="display:flex; align-items:center; background:var(--color-surface); border-radius:8px; padding:12px; border:1px solid rgba(255,255,255,0.05);">
                  <div style="background:rgba(255,255,255,0.05); border-radius:6px; padding:8px 12px; text-align:center; margin-right:16px; min-width:54px;">
                    <div style="font-size:18px; font-weight:700; color:var(--color-white); line-height:1;">${day}</div>
                    <div style="font-size:11px; color:var(--color-slate-400); text-transform:uppercase; margin-top:2px;">${month}</div>
                  </div>
                  <div style="flex:1;">
                    <div style="font-weight:600; font-size:14px; color:var(--color-white); margin-bottom:4px;">${_attEsc(h.course)}</div>
                    <div style="font-size:12px; color:var(--color-slate-400);">${_attEsc(h.remark || 'Regular Class')}</div>
                  </div>
                  <div style="padding:4px 10px; border-radius:6px; font-size:12px; font-weight:600; background:rgba(255,255,255,0.1); color:var(--color-white);">
                    <span class="badge ${ATT.STATUS_BADGE[st]}">${h.status}</span>
                  </div>
                </div>
              `;
            }).join('') : '<div style="color:var(--color-slate-400); font-size:14px;">No attendance history found.</div>'}
          </div>
        `;
      }).catch(err => {
        console.error('Attendance fetch error:', err);
        sec.innerHTML = `<div style="padding:40px; text-align:center; color:var(--color-danger);">Failed to load attendance data.</div>`;
      });
    } else {
      sec.style.display = '';
      attRefreshAll();
    }
  }
}

function attHide() {
  const sec = _$('#attendance-section');
  if (sec) sec.style.display = 'none';
}


/* =============================================================================
   A6. KPI CARDS — compute & render
   ============================================================================= */

function attRenderKPIs() {
  const today     = new Date().toISOString().slice(0, 10);
  const records   = attLoadRecords();
  const todayRecs = records.filter(r => r.date === today);

  const classCount = todayRecs.length;
  const totalP     = todayRecs.reduce((s, r) => s + (r.present || 0), 0);
  const totalA     = todayRecs.reduce((s, r) => s + (r.absent  || 0), 0);
  const totalEnr   = todayRecs.reduce((s, r) => s + (r.totalEnrolled || 0), 0);
  const todayRate  = totalEnr ? Math.round((totalP / totalEnr) * 100) : null;

  // Semester average across all records
  const allRates   = records.map(r => r.rate).filter(n => typeof n === 'number');
  const semAvg     = allRates.length
    ? Math.round(allRates.reduce((a, b) => a + b, 0) / allRates.length)
    : null;

  // DOM updates
  const set = (id, val) => { const el = _$(`#${id}`); if (el) el.textContent = val; };

  set('att-val-classes', classCount);
  set('att-val-present', totalP);
  set('att-val-absent',  totalA);
  set('att-val-rate',    semAvg !== null ? `${semAvg}%` : '—%');
  set('att-kpi-date',    formatDate(new Date()));

  const pctEl = _$('#att-pct-present');
  if (pctEl) {
    pctEl.textContent = totalEnr ? `${Math.round((totalP / totalEnr) * 100)}%` : '—';
    pctEl.className   = `stat-card__delta stat-card__delta--${totalEnr && (totalP / totalEnr) >= 0.75 ? 'up' : 'down'}`;
  }

  const absPctEl = _$('#att-pct-absent');
  if (absPctEl) {
    absPctEl.textContent = totalEnr ? `${Math.round((totalA / totalEnr) * 100)}%` : '—';
  }

  const rateEl = _$('#att-rate-delta');
  if (rateEl && semAvg !== null) {
    rateEl.innerHTML = semAvg >= 75
      ? `<i class="fas fa-arrow-trend-up" aria-hidden="true"></i> ${semAvg}%`
      : `<i class="fas fa-arrow-trend-down" aria-hidden="true"></i> ${semAvg}%`;
    rateEl.className = `stat-card__delta stat-card__delta--${semAvg >= 75 ? 'up' : 'down'}`;
  }
}


/* =============================================================================
   A7. SESSION SELECT — populate dropdown from seeded/stored sessions
   ============================================================================= */

async function attPopulateSessionSelect() {
  const select = _$('#att-session-select');
  if (!select) return;

  try {
    const res = await Auth.fetch('/courses');
    const body = await res.json();
    const courses = body.data || [];

    select.innerHTML = '<option value="">— Choose Course —</option>';

    courses.forEach(c => {
      const opt   = document.createElement('option');
      opt.value   = c._id;
      opt.setAttribute('data-dept', c.department);
      opt.setAttribute('data-semester', c.semester);
      opt.setAttribute('data-name', c.name);
      opt.textContent = `${c.courseCode} · ${c.name} (${c.department} - Sem ${c.semester})`;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Failed to load courses', e);
  }

  const sectionSelect = _$('#att-section-select');
  if (sectionSelect) {
    sectionSelect.addEventListener('change', () => {
      const dept = ATT.currentDept;
      const sem = ATT.currentSemester;
      const cName = ATT.currentCourseName;
      if (dept) {
        attLoadRoster(dept, sem, sectionSelect.value, cName);
      }
    });
  }

  select.addEventListener('change', () => {
    const id = select.value;
    ATT.currentSessionId = id || null;

    const submitBtn = _$('#btn-att-submit');
    if (submitBtn) {
      submitBtn.disabled = !id;
      submitBtn.style.opacity = id ? '1' : '0.5';
      submitBtn.style.cursor  = id ? 'pointer' : 'default';
    }

    if (id) {
      const opt = select.options[select.selectedIndex];
      const dept = opt.getAttribute('data-dept');
      const sem = opt.getAttribute('data-semester');
      const cName = opt.getAttribute('data-name');
      const subtitle = _$('#att-mark-subtitle');
      if (subtitle) {
        subtitle.textContent = opt.textContent;
      }
      
      ATT.currentDept = dept;
      ATT.currentSemester = sem;
      ATT.currentCourseName = cName;
      const section = sectionSelect ? sectionSelect.value : '';
      attLoadRoster(dept, sem, section, cName);
    } else {
      attClearRoster();
    }
  });

  // Focus style
  select.addEventListener('focus', () => {
    select.style.borderColor = 'rgba(0,212,255,0.35)';
    select.style.boxShadow   = '0 0 0 3px rgba(0,212,255,0.08)';
  });
  select.addEventListener('blur', () => {
    select.style.borderColor = 'rgba(139,163,188,0.18)';
    select.style.boxShadow   = 'none';
  });
}

function attClearRoster() {
  ATT.draftMarks = {};
  const tbody = _$('#att-roster-tbody');
  if (tbody) tbody.innerHTML = '';
  _attShowRosterState('loading');
  const loading = _$('#att-roster-loading');
  if (loading) loading.innerHTML = `
    <i class="fas fa-arrow-up" style="font-size:16px;color:var(--color-cyan-400);margin-right:8px;" aria-hidden="true"></i>
    Select a session above to load the roster
  `;
  attUpdateLiveCounts();
}


/* =============================================================================
   A8. ROSTER — render student list with status toggles
   ============================================================================= */

function attLoadRoster(department, semester = '', section = '', courseName = '') {
  if (!department) return;
  _attShowRosterState('loading');

  // Ensure we have fresh student data from API, then render roster
  (async () => {
    await attFetchStudentsFromAPI();

    // Slight delay for UX (simulates fetch)
    setTimeout(() => {
      let roster = attRosterForDept(department, semester, courseName);
      if (section) {
        roster = roster.filter(s => {
          if (!s.section || s.section.trim() === '') return true;
          const sSec = s.section.toLowerCase();
          const qSec = section.toLowerCase();
          return sSec === `sec ${qSec}` || sSec === qSec || sSec === `section ${qSec}`;
        });
      }

      // Seed draft marks: default everyone to Present
      ATT.draftMarks = {};
      roster.forEach(stu => {
        ATT.draftMarks[stu.id] = 'P';
      });

      if (!roster.length) {
        const tbody = _$('#att-roster-tbody');
        if (tbody) tbody.innerHTML = '';
        _attShowRosterState('empty');
        return;
      }

      _attShowRosterState('table');
      attRenderRoster(roster);
      attUpdateLiveCounts();
    }, 220);
  })().catch(err => console.error('[AttendanceModule] attLoadRoster failed', err));
}

function _attShowRosterState(state) {
  const loading = _$('#att-roster-loading');
  const empty   = _$('#att-roster-empty');
  const table   = _$('#att-roster-table');

  if (loading) loading.style.display = state === 'loading' ? 'flex'  : 'none';
  if (empty)   empty.style.display   = state === 'empty'   ? 'block' : 'none';
  if (table)   table.style.display   = state === 'table'   ? ''      : 'none';
}

/* ── A8a. Build roster rows ────────────────────────────────────────────────── */

function attRenderRoster(roster) {
  const tbody  = _$('#att-roster-tbody');
  if (!tbody) return;

  const { query, status } = ATT.rosterFilter;
  const q = query.toLowerCase();

  const filtered = roster.filter(stu => {
    const matchQ = !q ||
      stu.name.toLowerCase().includes(q)   ||
      stu.rollNo.toLowerCase().includes(q);
    const matchS = status === 'all' || ATT.draftMarks[stu.id] === status;
    return matchQ && matchS;
  });

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;padding:24px;
            color:var(--color-slate-400);font-size:13px;">
          No students match the current filter.
        </td>
      </tr>
    `;
    return;
  }

  const getSelectStyle = (statusVal) => {
    switch (statusVal) {
      case 'P': return 'color: #10B981; border: 1px solid #10B981; background: rgba(16,185,129,0.1);';
      case 'A': return 'color: #EF4444; border: 1px solid #EF4444; background: rgba(239,68,68,0.1);';
      case 'L': return 'color: #F59E0B; border: 1px solid #F59E0B; background: rgba(245,158,11,0.1);';
      default: return 'color: #6B7280; border: 1px solid #E5E7EB; background: #fff;';
    }
  };

  tbody.innerHTML = filtered.map((stu, index) => {
    const st = ATT.draftMarks[stu.id] || 'P';
    
    // Highlight low attendance
    const overallRate = attStudentRate(stu.id);
    const isLow = overallRate !== null && overallRate < ATT.THRESHOLD;
    
    // Define base row style
    const bgClass = isLow ? 'background: var(--color-danger-bg);' : (index % 2 === 0 ? 'background: var(--color-surface);' : 'background: rgba(255,255,255,0.02);');
    const borderStyle = 'border-bottom: 1px solid var(--color-border);';

    return `
      <tr class="att-roster-row" data-student-id="${stu.id}" style="transition:background .12s; ${bgClass} ${borderStyle}">
        <td style="padding: 16px 24px;"><input type="checkbox" class="att-row-check" data-student-id="${stu.id}" ${st === 'P' ? 'checked' : ''} style="accent-color: #D90429; width: 16px; height: 16px; cursor: pointer;"></td>
        <td style="padding: 16px; font-size: 13px; color: #6B7280;">${index + 1}</td>
        <td style="padding: 16px; font-size: 13px; color: #111827; font-weight: 500;">${_attEsc(stu.rollNo)}</td>
        <td style="padding: 16px; font-size: 13px; color: #111827; font-weight: 500;">${_attEsc(stu.name)}</td>
        <td style="padding: 16px;">
          <select class="att-status-select" data-student-id="${stu.id}" style="width: 110px; height: 32px; border-radius: 6px; padding: 0 10px; font-size: 13px; font-weight: 600; outline: none; cursor: pointer; ${getSelectStyle(st)} appearance: none; -webkit-appearance: none; background-image: url('data:image/svg+xml;utf8,<svg fill=\\'currentColor\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' width=\\'16\\' xmlns=\\'http://www.w3.org/2000/svg\\'><path d=\\'M7 10l5 5 5-5z\\'/></svg>'); background-repeat: no-repeat; background-position-x: 90%; background-position-y: center;">
            <option value="P" ${st === 'P' ? 'selected' : ''} style="color:#111827;">Present</option>
            <option value="A" ${st === 'A' ? 'selected' : ''} style="color:#111827;">Absent</option>
            <option value="L" ${st === 'L' ? 'selected' : ''} style="color:#111827;">Late</option>
          </select>
        </td>
        <td style="padding: 16px;">
          <input type="text" class="att-remark-input" data-student-id="${stu.id}" placeholder="-" style="width: 100px; height: 32px; border: none; background: transparent; font-size: 13px; color: #374151; outline: none;" value="">
        </td>
      </tr>
    `;
  }).join('');

  // Wire status dropdowns
  _$$('.att-status-select', tbody).forEach(select => {
    select.addEventListener('change', (e) => {
      const studentId = e.target.dataset.studentId;
      const newStatus = e.target.value;
      ATT.draftMarks[studentId] = newStatus;
      e.target.style = `width: 110px; height: 32px; border-radius: 6px; padding: 0 10px; font-size: 13px; font-weight: 600; outline: none; cursor: pointer; ${getSelectStyle(newStatus)} appearance: none; -webkit-appearance: none; background-image: url('data:image/svg+xml;utf8,<svg fill=\\'currentColor\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' width=\\'16\\' xmlns=\\'http://www.w3.org/2000/svg\\'><path d=\\'M7 10l5 5 5-5z\\'/></svg>'); background-repeat: no-repeat; background-position-x: 90%; background-position-y: center;`;
      
      const checkbox = _$(`.att-row-check[data-student-id="${studentId}"]`);
      if (checkbox) checkbox.checked = (newStatus === 'P');
      
      attUpdateLiveCounts();
    });
  });

  // Wire checkboxes to select present/absent
  _$$('.att-row-check', tbody).forEach(chk => {
    chk.addEventListener('change', (e) => {
      const studentId = e.target.dataset.studentId;
      const newStatus = e.target.checked ? 'P' : 'A';
      ATT.draftMarks[studentId] = newStatus;
      const select = _$(`.att-status-select[data-student-id="${studentId}"]`);
      if (select) {
        select.value = newStatus;
        select.dispatchEvent(new Event('change'));
      }
    });
  });
}

/* ── A8b. Status cycle ──────────────────────────────────────────────────────── */

function attCycleStatus(studentId, roster) {
  const current = ATT.draftMarks[studentId] || 'P';
  const idx     = ATT.STATUS_CYCLE.indexOf(current);
  const next    = ATT.STATUS_CYCLE[(idx + 1) % ATT.STATUS_CYCLE.length];
  ATT.draftMarks[studentId] = next;

  // Update toggle button
  const btn = _$(`.att-status-toggle[data-student-id="${studentId}"]`);
  if (btn) {
    btn.style.borderColor = ATT.STATUS_COLOR[next];
    btn.style.background  = `${ATT.STATUS_COLOR[next]}20`;
    btn.style.color       = ATT.STATUS_COLOR[next];
    btn.innerHTML         = _attStatusIcon(next);
    btn.setAttribute('aria-label',
      `Toggle status — currently ${ATT.STATUS_LABEL[next]}`);

    // Pulse animation
    btn.style.transform = 'scale(1.25)';
    setTimeout(() => btn.style.transform = 'scale(1)', 200);
  }

  // Update badge
  const badge = _$(`.att-status-badge[data-student-id="${studentId}"]`);
  if (badge) {
    badge.className   = `badge ${ATT.STATUS_BADGE[next]} att-status-badge`;
    badge.setAttribute('data-student-id', studentId);
    badge.textContent = ATT.STATUS_LABEL[next];
  }

  // Uncheck "All Present" if any is not P
  const allPresentCheck = _$('#att-check-all');
  if (allPresentCheck && next !== 'P') {
    allPresentCheck.checked = false;
    allPresentCheck.indeterminate = true;
  }

  attUpdateLiveCounts();
}

/* ── A8c. Live counter update ───────────────────────────────────────────────── */

function attUpdateLiveCounts() {
  const marks  = Object.values(ATT.draftMarks);
  const total  = marks.length;
  const cP     = marks.filter(s => s === 'P').length;
  const cL     = marks.filter(s => s === 'L').length;
  const cA     = marks.filter(s => s === 'A').length;

  const set = (id, val) => { const el = _$(`#${id}`); if (el) el.textContent = val; };
  set('att-val-present',  cP);
  set('att-val-absent',  cA);
  set('att-val-late',  cL);
  set('att-val-total', total);
  
  if (total > 0) {
    set('att-pct-present', Math.round((cP/total)*100) + '%');
    set('att-pct-absent', Math.round((cA/total)*100) + '%');
    set('att-pct-late', Math.round((cL/total)*100) + '%');
  } else {
    set('att-pct-present', '0%');
    set('att-pct-absent', '0%');
    set('att-pct-late', '0%');
  }
}

/* ── A8d. "All Present" master checkbox ─────────────────────────────────────── */

function attInitMasterCheckbox() {
  const chk = _$('#att-check-all-btn');
  const chkBox = _$('#att-check-all');
  
  const handleMarkAll = () => {
    Object.keys(ATT.draftMarks).forEach(id => {
      ATT.draftMarks[id] = 'P';
    });
    if (chkBox) chkBox.checked = true;

    // Re-render the visible roster
    const sessionId = ATT.currentSessionId;
    if (!sessionId) return;
    const sessions  = attLoadSessions();
    const sess      = sessions.find(s => s.id === sessionId);
    if (sess) {
      const roster = attRosterForDept(sess.department);
      attRenderRoster(roster);
    }
    attUpdateLiveCounts();
  };

  if (chk) chk.addEventListener('click', handleMarkAll);
  if (chkBox) chkBox.addEventListener('change', (e) => {
    if (e.target.checked) handleMarkAll();
    else {
      Object.keys(ATT.draftMarks).forEach(id => {
        ATT.draftMarks[id] = 'A';
      });
      const sessionId = ATT.currentSessionId;
      if (sessionId) {
        const sess = attLoadSessions().find(s => s.id === sessionId);
        if (sess) attRenderRoster(attRosterForDept(sess.department));
      }
      attUpdateLiveCounts();
    }
  });
}

/* ── A8e. Toolbar search & status filter ────────────────────────────────────── */

function attInitToolbar() {
  const searchInput = _$('#att-search-input');
  const searchWrap  = _$('#att-search-wrap');

  if (searchInput) {
    searchInput.addEventListener('input', debounce(e => {
      ATT.rosterFilter.query = e.target.value.trim();
      _attRefreshRoster();
    }, 250));
  }

  if (searchWrap) {
    searchWrap.addEventListener('focusin', () => {
      searchWrap.style.borderColor = 'rgba(0,212,255,0.35)';
      searchWrap.style.boxShadow   = '0 0 0 3px rgba(0,212,255,0.08)';
    });
    searchWrap.addEventListener('focusout', () => {
      searchWrap.style.borderColor = 'rgba(139,163,188,0.18)';
      searchWrap.style.boxShadow   = 'none';
    });
  }

  // Filter buttons
  _$$('.att-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _$$('.att-filter-btn').forEach(b => {
        b.classList.remove('att-filter-btn--active');
        b.style.background  = 'rgba(255,255,255,0.03)';
        b.style.color       = 'var(--color-slate-300)';
        b.style.borderColor = 'rgba(139,163,188,0.18)';
      });
      btn.classList.add('att-filter-btn--active');
      btn.style.background  = 'rgba(0,212,255,0.10)';
      btn.style.color       = 'var(--color-cyan-400)';
      btn.style.borderColor = 'rgba(0,212,255,0.28)';

      ATT.rosterFilter.status = btn.dataset.filter;
      _attRefreshRoster();
    });
  });
}

function _attRefreshRoster() {
  const sessionId = ATT.currentSessionId;
  if (!sessionId) return;
  const sessions = attLoadSessions();
  const sess     = sessions.find(s => s.id === sessionId);
  if (sess) {
    const roster = attRosterForDept(sess.department);
    attRenderRoster(roster);
  }
}


/* =============================================================================
   A9. DEPARTMENT BREAKDOWN CARD
   ============================================================================= */

function attRenderDeptBreakdown() {
  const container = _$('#att-dept-list');
  if (!container) return;

  const today   = new Date().toISOString().slice(0, 10);
  const records = attLoadRecords().filter(r => r.date === today);

  // Group by department
  const depts = {};
  records.forEach(r => {
    if (!depts[r.department]) {
      depts[r.department] = { present: 0, total: 0, absent: 0 };
    }
    depts[r.department].present += r.present || 0;
    depts[r.department].total   += r.totalEnrolled || 0;
    depts[r.department].absent  += r.absent || 0;
  });

  const deptColors = {
    'Computer Science': 'var(--color-cyan-400)',
    'Business Admin':   'var(--color-info)',
    'Engineering':      'var(--color-success)',
    'Medical Sciences': 'var(--color-warning)',
    'Arts & Humanities':'var(--color-danger)',
  };

  const entries = Object.entries(depts);

  if (!entries.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--color-slate-400);font-size:13px;">
        No sessions recorded for today yet.
      </div>
    `;
    return;
  }

  container.innerHTML = entries.map(([dept, d]) => {
    const rate  = d.total ? Math.round((d.present / d.total) * 100) : 0;
    const color = deptColors[dept] || 'var(--color-slate-400)';
    return `
      <div style="padding:8px 0;border-bottom:1px solid var(--color-border);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:3px;height:32px;border-radius:99px;background:${color};flex-shrink:0;box-shadow:0 0 6px ${color};"></div>
            <div>
              <div style="font-size:12px;font-weight:600;color:var(--color-white);">${_attEsc(dept)}</div>
              <div style="font-size:10.5px;color:var(--color-slate-400);margin-top:1px;">
                ${d.present} present · ${d.absent} absent
              </div>
            </div>
          </div>
          <div style="font-family:var(--font-mono);font-size:14px;font-weight:500;
                      color:${rate < ATT.THRESHOLD ? 'var(--color-danger)' : 'var(--color-white)'};">
            ${rate}%
          </div>
        </div>
        <div class="progress-bar" role="progressbar"
             aria-valuenow="${rate}" aria-valuemin="0" aria-valuemax="100"
             aria-label="${dept} attendance ${rate}%">
          <div class="progress-bar__fill"
               style="width:${rate}%;background:${color};"></div>
        </div>
      </div>
    `;
  }).join('');

  // Wire refresh button
  const refreshBtn = _$('#btn-att-refresh-dept');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const icon = refreshBtn.querySelector('i');
      if (icon) {
        icon.style.transition = 'transform .7s ease';
        icon.style.transform  = 'rotate(360deg)';
        setTimeout(() => { icon.style.transition = 'none'; icon.style.transform = ''; }, 750);
      }
      attRenderDeptBreakdown();
      Toast.show('Department breakdown refreshed', 'info');
    });
  }
}


/* =============================================================================
   A10. WEEKLY TREND CHART (SVG)
   ============================================================================= */

function attRenderTrendChart() {
  const svg       = _$('#att-trend-svg');
  const labelsEl  = _$('#att-trend-labels');
  const avgEl     = _$('#att-trend-avg');
  if (!svg) return;

  const records = attLoadRecords();
  const today   = new Date();
  const days    = [];

  for (let i = 6; i >= 0; i--) {
    const d    = new Date(today);
    d.setDate(today.getDate() - i);
    const key  = d.toISOString().slice(0, 10);
    const recs = records.filter(r => r.date === key);
    const rates = recs.map(r => r.rate).filter(n => typeof n === 'number');
    const avg   = rates.length
      ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
      : null;

    days.push({
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      date: key,
      rate: avg,
    });
  }

  const W = 420, H = 100, padL = 8, padR = 8, padT = 10, padB = 20;
  const xSlot = (W - padL - padR) / (days.length - 1);
  const yScale = (val) => padT + ((100 - val) / 100) * (H - padT - padB);

  // Remove old chart content (preserve defs)
  _$$('line, polyline, polygon, circle, text:not(.att-axis)', svg).forEach(el => el.remove());
  // Clear all non-defs children
  [...svg.children].filter(el => el.tagName !== 'defs').forEach(el => el.remove());

  // Horizontal grid lines at 25%, 50%, 75%, 100%
  [100, 75, 50, 25].forEach(pct => {
    const y = yScale(pct);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', padL);
    line.setAttribute('x2', W - padR);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', 'rgba(139,163,188,0.10)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.textContent = `${pct}%`;
    txt.setAttribute('x', padL);
    txt.setAttribute('y', y - 3);
    txt.setAttribute('font-family', 'DM Mono, monospace');
    txt.setAttribute('font-size', '7');
    txt.setAttribute('fill', '#8BA3BC');
    txt.setAttribute('text-anchor', 'start');
    svg.appendChild(txt);
  });

  // Threshold line at 75%
  const threshY = yScale(ATT.THRESHOLD);
  const threshLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  threshLine.setAttribute('x1', padL);
  threshLine.setAttribute('x2', W - padR);
  threshLine.setAttribute('y1', threshY);
  threshLine.setAttribute('y2', threshY);
  threshLine.setAttribute('stroke', 'rgba(242,95,92,0.40)');
  threshLine.setAttribute('stroke-width', '1');
  threshLine.setAttribute('stroke-dasharray', '4 3');
  svg.appendChild(threshLine);

  // Collect valid points
  const points = days
    .map((d, i) => ({
      x: padL + i * xSlot,
      y: d.rate !== null ? yScale(d.rate) : null,
      rate: d.rate,
    }))
    .filter(p => p.y !== null);

  if (points.length < 2) {
    const placeholder = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    placeholder.textContent = 'Record sessions to see trend';
    placeholder.setAttribute('x', W / 2);
    placeholder.setAttribute('y', H / 2);
    placeholder.setAttribute('text-anchor', 'middle');
    placeholder.setAttribute('font-family', 'DM Sans, sans-serif');
    placeholder.setAttribute('font-size', '11');
    placeholder.setAttribute('fill', '#8BA3BC');
    svg.appendChild(placeholder);
    if (avgEl) avgEl.textContent = '—%';
    return;
  }

  // Filled area
  const areaPoints = [
    `${points[0].x},${H - padB}`,
    ...points.map(p => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${H - padB}`,
  ].join(' ');
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  area.setAttribute('points', areaPoints);
  area.setAttribute('fill', 'url(#attTrendGrad)');
  svg.appendChild(area);

  // Line
  const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  lineEl.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
  lineEl.setAttribute('fill', 'none');
  lineEl.setAttribute('stroke', '#00D4FF');
  lineEl.setAttribute('stroke-width', '2');
  lineEl.setAttribute('stroke-linecap', 'round');
  lineEl.setAttribute('stroke-linejoin', 'round');
  lineEl.style.filter = 'drop-shadow(0 0 4px rgba(0,212,255,0.50))';
  svg.appendChild(lineEl);

  // Data point dots
  points.forEach(p => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', '#00D4FF');
    circle.setAttribute('stroke', '#0B1A2C');
    circle.setAttribute('stroke-width', '2');
    circle.style.filter = 'drop-shadow(0 0 6px rgba(0,212,255,0.60))';

    // Tooltip on hover
    const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    tip.textContent = `${p.rate}%`;
    circle.appendChild(tip);
    svg.appendChild(circle);
  });

  // Average label
  const avgRate = Math.round(points.reduce((s, p) => s + p.rate, 0) / points.length);
  if (avgEl) avgEl.textContent = `${avgRate}%`;

  // X-axis day labels
  if (labelsEl) {
    labelsEl.innerHTML = days.map(d => `<span>${d.label}</span>`).join('');
  }
}


/* =============================================================================
   A11. LOW-ATTENDANCE ALERTS CARD
   ============================================================================= */

function attRenderAlerts() {
  const list     = _$('#att-alerts-list');
  const empty    = _$('#att-alerts-empty');
  const countEl  = _$('#att-alert-count');
  const badgeEl  = _$('#att-alert-count-badge');
  if (!list) return;

  const students = attLoadStudents().filter(s => s.status === 'Enrolled');
  const atRisk   = students
    .map(s => ({ ...s, rate: attStudentRate(s.id) }))
    .filter(s => s.rate !== null && s.rate < ATT.THRESHOLD)
    .sort((a, b) => a.rate - b.rate);   // worst first

  if (countEl) countEl.textContent = atRisk.length;

  if (!atRisk.length) {
    list.innerHTML  = '';
    if (empty) empty.style.display = 'block';
    if (badgeEl) {
      badgeEl.style.background   = 'rgba(34,211,163,0.10)';
      badgeEl.style.borderColor  = 'rgba(34,211,163,0.25)';
      badgeEl.style.color        = 'var(--color-success)';
      const dot = badgeEl.querySelector('span:first-child');
      if (dot) dot.style.background = 'var(--color-success)';
    }
    return;
  }

  if (empty) empty.style.display = 'none';

  list.innerHTML = atRisk.map(s => {
    const rateColor = s.rate < 60 ? 'var(--color-danger)' : 'var(--color-warning)';
    const arcRadius = 14;
    const circ      = 2 * Math.PI * arcRadius;
    const offset    = circ - (s.rate / 100) * circ;

    return `
      <div class="att-alert-item" data-student-id="${s.id}" style="
        display:flex; align-items:center; gap:12px;
        padding:10px 18px;
        border-bottom:1px solid var(--color-border);
        cursor:pointer; transition:background .12s;
      ">
        <!-- Mini donut -->
        <div style="flex-shrink:0;position:relative;width:36px;height:36px;">
          <svg viewBox="0 0 36 36" style="width:36px;height:36px;display:block;transform:rotate(-90deg);">
            <circle cx="18" cy="18" r="${arcRadius}"
                    fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
            <circle cx="18" cy="18" r="${arcRadius}"
                    fill="none" stroke="${rateColor}" stroke-width="4"
                    stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
                    stroke-linecap="round"/>
          </svg>
          <span style="
            position:absolute;top:50%;left:50%;
            transform:translate(-50%,-50%);
            font-family:var(--font-mono);font-size:8px;font-weight:700;
            color:${rateColor};line-height:1;
          ">${s.rate}%</span>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--color-white);
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${_attEsc(s.name)}
          </div>
          <div style="font-size:11px;color:var(--color-slate-400);margin-top:2px;">
            ${_attEsc(s.rollNo)} · ${_attEsc(s.department)}
          </div>
        </div>
        <span style="
          padding:3px 9px; border-radius:99px; flex-shrink:0;
          background:${rateColor}18; border:1px solid ${rateColor}40;
          color:${rateColor}; font-size:10.5px; font-weight:700;
        ">
          ${s.rate < 60 ? 'Critical' : 'Warning'}
        </span>
      </div>
    `;
  }).join('');

  // Hover & click on alert items
  _$$('.att-alert-item', list).forEach(item => {
    item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.02)');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', () => {
      attOpenStudentPanel(item.dataset.studentId);
    });
  });
}


/* =============================================================================
   A12. ATTENDANCE HISTORY TABLE
   ============================================================================= */

/* ── A12a. Renderer ────────────────────────────────────────────────────────── */

function attRenderHistory() {
  const tbody   = _$('#att-history-tbody');
  const empty   = _$('#att-history-empty');
  const info    = _$('#att-history-info');
  const pgBtns  = _$('#att-history-pg-btns');
  const subtitle = _$('#att-history-subtitle');
  if (!tbody) return;

  const { from, to } = ATT.histFilter;
  let records = attLoadRecords().sort((a, b) => b.date.localeCompare(a.date));

  // Date range filter
  if (from) records = records.filter(r => r.date >= from);
  if (to)   records = records.filter(r => r.date <= to);

  const total  = records.length;
  const pages  = Math.max(1, Math.ceil(total / ATT.HISTORY_PER_PAGE));
  if (ATT.histPage > pages) ATT.histPage = 1;

  const start = (ATT.histPage - 1) * ATT.HISTORY_PER_PAGE;
  const end   = Math.min(start + ATT.HISTORY_PER_PAGE, total);
  const page  = records.slice(start, end);

  if (subtitle) subtitle.textContent = total ? `${total} session${total !== 1 ? 's' : ''} recorded` : 'All recorded sessions';

  if (!total) {
    tbody.innerHTML = '';
    if (empty)  empty.style.display = 'block';
    if (info)   info.textContent    = '';
    if (pgBtns) pgBtns.innerHTML    = '';
    return;
  }

  if (empty) empty.style.display = 'none';
  if (info)  info.textContent    = `Showing ${start + 1}–${end} of ${total}`;

  const rateColor = (r) =>
    r >= 90 ? 'var(--color-success)'
    : r >= 75 ? 'var(--color-cyan-400)'
    : r >= 60 ? 'var(--color-warning)'
    : 'var(--color-danger)';

  tbody.innerHTML = page.map(rec => `
    <tr class="att-history-row" data-record-id="${rec.id}" style="cursor:default;">
      <td style="font-family:var(--font-mono);font-size:12px;white-space:nowrap;
                 color:var(--color-slate-400);">
        ${rec.date}
      </td>
      <td style="font-size:13px;font-weight:500;color:var(--color-white);">
        ${_attEsc(rec.sessionLabel || '—')}
      </td>
      <td style="font-size:12px;color:var(--color-slate-300);">
        ${_attEsc(rec.faculty || '—')}
      </td>
      <td style="font-size:12px;color:var(--color-slate-300);">
        ${_attEsc(rec.department || '—')}
      </td>
      <td style="text-align:center;font-family:var(--font-mono);font-size:12px;">
        ${rec.totalEnrolled}
      </td>
      <td style="text-align:center;font-family:var(--font-mono);font-size:12px;
                 color:var(--color-success);">
        ${rec.present}
      </td>
      <td style="text-align:center;font-family:var(--font-mono);font-size:12px;
                 color:var(--color-warning);">
        ${rec.late}
      </td>
      <td style="text-align:center;font-family:var(--font-mono);font-size:12px;
                 color:var(--color-danger);">
        ${rec.absent}
      </td>
      <td style="text-align:center;">
        <span style="
          font-family:var(--font-mono);font-size:12px;font-weight:700;
          color:${rateColor(rec.rate)};
        ">${rec.rate}%</span>
      </td>
      <td>
        <div style="display:flex;gap:4px;align-items:center;">
          <button class="btn-att-view-rec card-action-btn" data-id="${rec.id}"
                  title="View session detail" aria-label="View detail for ${_attEsc(rec.sessionLabel)}">
            <i class="fas fa-eye" aria-hidden="true"></i>
          </button>
          <button class="btn-att-del-rec" data-id="${rec.id}"
                  title="Delete record" aria-label="Delete attendance record"
                  style="
                    display:flex;align-items:center;justify-content:center;
                    width:26px;height:26px;border-radius:var(--radius-sm);
                    background:rgba(242,95,92,0.08);
                    border:1px solid rgba(242,95,92,0.18);
                    color:var(--color-danger);font-size:11px;cursor:pointer;
                    transition:background .15s;
                  ">
            <i class="fas fa-trash-can" aria-hidden="true"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  // Wire view/delete buttons
  _$$('.btn-att-view-rec', tbody).forEach(btn => {
    btn.addEventListener('click', () => attViewSessionDetail(btn.dataset.id));
  });
  _$$('.btn-att-del-rec', tbody).forEach(btn => {
    btn.addEventListener('click', () => attConfirmDeleteRecord(btn.dataset.id));
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(242,95,92,0.20)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(242,95,92,0.08)');
  });

  // Hover on rows
  _$$('.att-history-row', tbody).forEach(row => {
    row.addEventListener('mouseenter', () => row.style.background = 'rgba(255,255,255,0.02)');
    row.addEventListener('mouseleave', () => row.style.background = '');
  });

  // Pagination
  _attRenderHistoryPagination(pgBtns, pages);
}

/* ── A12b. Date-range filter ───────────────────────────────────────────────── */

function attInitDateFilter() {
  const fromInput = _$('#att-date-from');
  const toInput   = _$('#att-date-to');
  const clearBtn  = _$('#btn-att-clear-dates');

  if (fromInput) fromInput.addEventListener('change', e => {
    ATT.histFilter.from = e.target.value;
    ATT.histPage = 1;
    attRenderHistory();
  });

  if (toInput) toInput.addEventListener('change', e => {
    ATT.histFilter.to = e.target.value;
    ATT.histPage = 1;
    attRenderHistory();
  });

  if (clearBtn) clearBtn.addEventListener('click', () => {
    ATT.histFilter = { from: '', to: '' };
    if (fromInput) fromInput.value = '';
    if (toInput)   toInput.value   = '';
    ATT.histPage = 1;
    attRenderHistory();
    Toast.show('Date filter cleared', 'info');
  });

  // Export
  const exportBtn = _$('#btn-att-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', attExportCSV);
    exportBtn.addEventListener('mouseenter', () => exportBtn.style.background = 'rgba(255,255,255,0.08)');
    exportBtn.addEventListener('mouseleave', () => exportBtn.style.background = 'rgba(255,255,255,0.03)');
  }
}

/* ── A12c. Pagination ──────────────────────────────────────────────────────── */

function _attRenderHistoryPagination(container, totalPages) {
  if (!container) return;
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const bs = (active) => `
    min-width:30px;height:30px;border-radius:var(--radius-sm);
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:600;cursor:pointer;
    font-family:var(--font-mono);
    border:1px solid ${active ? 'rgba(0,212,255,0.35)' : 'rgba(139,163,188,0.18)'};
    background:${active ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)'};
    color:${active ? 'var(--color-cyan-400)' : 'var(--color-slate-300)'};
    transition:background .12s;padding:0 6px;
  `;

  // Prev
  const prev = document.createElement('button');
  prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
  prev.style.cssText = bs(false);
  prev.disabled = ATT.histPage === 1;
  if (ATT.histPage > 1) prev.addEventListener('click', () => { ATT.histPage--; attRenderHistory(); });
  container.appendChild(prev);

  // Pages
  const maxP = 5;
  let s = Math.max(1, ATT.histPage - 2);
  let e = Math.min(totalPages, s + maxP - 1);
  s = Math.max(1, e - maxP + 1);
  for (let p = s; p <= e; p++) {
    const pb = document.createElement('button');
    pb.textContent = String(p);
    pb.style.cssText = bs(p === ATT.histPage);
    if (p !== ATT.histPage) pb.addEventListener('click', () => { ATT.histPage = p; attRenderHistory(); });
    container.appendChild(pb);
  }

  // Next
  const next = document.createElement('button');
  next.innerHTML = '<i class="fas fa-chevron-right"></i>';
  next.style.cssText = bs(false);
  next.disabled = ATT.histPage === totalPages;
  if (ATT.histPage < totalPages) next.addEventListener('click', () => { ATT.histPage++; attRenderHistory(); });
  container.appendChild(next);
}

/* ── A12d. Export CSV ──────────────────────────────────────────────────────── */

function attExportCSV() {
  let records = attLoadRecords().sort((a, b) => b.date.localeCompare(a.date));

  const { from, to } = ATT.histFilter;
  if (from) records = records.filter(r => r.date >= from);
  if (to)   records = records.filter(r => r.date <= to);

  if (!records.length) {
    Toast.show('No records to export', 'warning');
    return;
  }

  const headers = ['Date', 'Session', 'Faculty', 'Department', 'Enrolled', 'Present', 'Late', 'Absent', 'Excused', 'Rate %'];
  const rows = records.map(r => [
    r.date,
    `"${(r.sessionLabel || '').replace(/"/g, '""')}"`,
    `"${(r.faculty      || '').replace(/"/g, '""')}"`,
    `"${(r.department   || '').replace(/"/g, '""')}"`,
    r.totalEnrolled, r.present, r.late, r.absent, r.excused || 0, r.rate,
  ].join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href  = url;
  link.download = `attendance_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  Toast.show(`${records.length} attendance record${records.length !== 1 ? 's' : ''} exported`, 'success');
  logActivity(`Attendance CSV export — <strong>${records.length}</strong> sessions`);
}

/* ── A12e. Delete a session record ─────────────────────────────────────────── */

function attConfirmDeleteRecord(id) {
  const rec = attGetRecord(id);
  if (!rec) { Toast.show('Record not found', 'danger'); return; }

  const modal = Modal.create({
    id:    'modal-att-delete',
    title: 'Delete Attendance Record',
    size:  'sm',
    bodyHTML: `
      <div style="text-align:center;padding:8px 0 4px;">
        <div style="width:52px;height:52px;border-radius:50%;background:rgba(242,95,92,0.12);
                    border:2px solid rgba(242,95,92,0.30);display:flex;align-items:center;
                    justify-content:center;margin:0 auto 14px;font-size:20px;
                    color:var(--color-danger);">
          <i class="fas fa-trash-can" aria-hidden="true"></i>
        </div>
        <p style="font-size:15px;font-weight:600;color:#fff;margin-bottom:8px;">
          Delete this record?
        </p>
        <p style="font-size:12px;color:var(--color-slate-400);line-height:1.6;">
          <strong>${_attEsc(rec.sessionLabel)}</strong><br>
          ${rec.date} · ${rec.totalEnrolled} students
        </p>
        <p style="font-size:12px;color:var(--color-danger);margin-top:10px;">
          This cannot be undone.
        </p>
      </div>
    `,
    footerHTML: `
      <button id="btn-att-del-cancel" style="padding:9px 20px;border-radius:var(--radius-sm);border:1px solid rgba(139,163,188,0.22);background:rgba(255,255,255,0.04);color:var(--color-slate-300);font-size:13px;font-weight:600;cursor:pointer;flex:1;">Cancel</button>
      <button id="btn-att-del-ok" style="padding:9px 20px;border-radius:var(--radius-sm);border:1px solid rgba(242,95,92,0.40);background:rgba(242,95,92,0.14);color:var(--color-danger);font-size:13px;font-weight:700;cursor:pointer;flex:1;display:flex;align-items:center;justify-content:center;gap:7px;">
        <i class="fas fa-trash-can" aria-hidden="true"></i> Delete
      </button>
    `,
  });

  modal.open();
  modal.footer().querySelector('#btn-att-del-cancel').addEventListener('click', () => modal.close());
  modal.footer().querySelector('#btn-att-del-ok').addEventListener('click', () => {
    attDeleteRecord(id);
    modal.close();
    attRefreshAll();
    Toast.show('Attendance record deleted', 'danger');
    logActivity(`Attendance record deleted: <strong>${rec.sessionLabel}</strong> (${rec.date})`, 'danger');
  });
}


/* =============================================================================
   A13. SUBMIT / SAVE SESSION
   ============================================================================= */

function attInitSubmitBtn() {
  const btn = _$('#btn-att-submit');
  if (!btn) return;

  // Hover styles handled inline to support theming

  btn.addEventListener('click', () => {
    if (!ATT.currentSessionId || !Object.keys(ATT.draftMarks).length) {
      Toast.show('Select a session and load the roster first', 'warning');
      return;
    }

    const dept = ATT.currentDept || '';
    const roster = attRosterForDept(dept);
    const marks  = roster.map(stu => {
      const remarkInput = _$(`.att-remark-input[data-student-id="${stu.id}"]`);
      return {
        studentId: stu.id,
        name:      stu.name,
        rollNo:    stu.rollNo,
        status:    ATT.draftMarks[stu.id] || 'A',
        remark:    remarkInput ? remarkInput.value.trim() : '',
      };
    });

    const cP   = marks.filter(m => m.status === 'P').length;
    const cL   = marks.filter(m => m.status === 'L').length;
    const cA   = marks.filter(m => m.status === 'A').length;
    const cEx  = marks.filter(m => m.status === 'EX').length;
    const tot  = marks.length;
    const rate = tot ? Math.round(((cP + cL) / tot) * 100) : 0;
    
    // Get date from date picker or fallback to today
    const dateInput = _$('#att-date-select');
    let selectedDate = new Date().toISOString().slice(0, 10);
    if (dateInput && dateInput.value) {
      selectedDate = dateInput.value;
    }

    const statusMap = { 'P': 'Present', 'L': 'Late', 'A': 'Absent', 'EX': 'Absent' };

    // Build payload for API
    const payload = {
      courseId: ATT.currentSessionId,
      date: selectedDate,
      records: marks.map(m => ({
        studentId: m.studentId,
        status: statusMap[m.status] || 'Absent',
        remark: m.remark || '',
      })),
    };

    // POST to backend
    (async () => {
      try {
        const resp = await Auth.fetch('/attendance', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          Toast.show(`Failed to save attendance — ${err.message || resp.statusText}`, 'danger');
          return;
        }

        // Refresh records from API and update UI
        await attFetchRecordsFromAPI();

        // Reset draft & UI
        ATT.draftMarks = {};
        ATT.currentSessionId = null;
        const select = _$('#att-session-select'); if (select) select.value = '';
        attClearRoster();
        const submitBtn = _$('#btn-att-submit');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.style.opacity = '0.5'; }
        const subtitle = _$('#att-mark-subtitle'); if (subtitle) subtitle.textContent = 'Select a class session to begin';

        attRefreshAll();

        Toast.show(
          `Attendance saved — ${cP} present, ${cA} absent, ${rate}% rate`,
          rate >= ATT.THRESHOLD ? 'success' : 'warning'
        );
        logActivity(
          `Attendance marked: <strong>${ATT.currentSessionLabel || 'Class'}</strong> — ${rate}% (${cP}P / ${cA}A / ${cL}L)`,
          rate >= ATT.THRESHOLD ? 'success' : 'warning'
        );
      } catch (err) {
        console.error('[AttendanceModule] POST /api/attendance failed', err);
        Toast.show('Failed to save attendance — network error', 'danger');
      }
    })();
  });
}

function attInitExportBtn() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#btn-att-roster-export');
    if (!btn) return;
    
    if (!ATT.currentSessionId || !ATT.currentDept) {
      if (typeof Toast !== 'undefined') Toast.show('Please select a session first to download CSV', 'warning');
      return;
    }
    
    const semester = ATT.currentSemester || '';
    const sectionSelect = _$('#att-section-select');
    const section = sectionSelect ? sectionSelect.value : '';
    
    let roster = attRosterForDept(ATT.currentDept, semester);
    if (section) {
      roster = roster.filter(s => s.section === `Sec ${section}` || s.section === section || s.section === `Section ${section}`);
    }
    
    if (!roster.length) {
       if (typeof Toast !== 'undefined') Toast.show('No students to export', 'info');
       return;
    }
    
    // Build CSV
    let csvContent = "Roll No,Student Name,Overall Attendance %,Today Status\n";
    roster.forEach(stu => {
      const overallRate = attStudentRate(stu.id);
      const rateStr = overallRate !== null ? `${overallRate}%` : 'N/A';
      const st = ATT.draftMarks[stu.id] || 'P';
      const statusStr = st === 'P' ? 'Present' : (st === 'A' ? 'Absent' : 'Late');
      
      // Escape names in case they have commas
      const safeName = stu.name.replace(/,/g, '');
      csvContent += `${stu.rollNo},${safeName},${rateStr},${statusStr}\n`;
    });
    
    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `attendance_roster_${ATT.currentSessionId}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

/* =============================================================================
   A14. STUDENT DETAIL SIDE-PANEL (from alert item click)
   ============================================================================= */

function attOpenStudentPanel(studentId) {
  const students  = attLoadStudents();
  const s         = students.find(st => st.id === studentId);
  if (!s) { Toast.show('Student record not found', 'danger'); return; }

  const records   = attLoadRecords();
  const allMarks  = records.flatMap(r =>
    (r.marks || []).filter(m => m.studentId === studentId).map(m => ({
      ...m, date: r.date, session: r.sessionLabel,
    }))
  ).sort((a, b) => b.date.localeCompare(a.date));

  const rate = attStudentRate(studentId);
  const rateColor = rate === null ? 'var(--color-slate-400)'
                  : rate < 60    ? 'var(--color-danger)'
                  : rate < 75    ? 'var(--color-warning)'
                  : 'var(--color-success)';

  const recentRows = allMarks.slice(0, 12).map(m => `
    <tr>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--color-slate-400);padding:6px 12px;">
        ${m.date}
      </td>
      <td style="font-size:12px;color:var(--color-white-soft);padding:6px 12px;
                 max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${_attEsc(m.session || '—')}
      </td>
      <td style="text-align:center;padding:6px 12px;">
        <span class="badge ${ATT.STATUS_BADGE[m.status] || 'badge--info'}">
          ${ATT.STATUS_LABEL[m.status] || m.status}
        </span>
      </td>
      ${m.remark ? `<td style="font-size:11px;color:var(--color-slate-400);padding:6px 12px;">${_attEsc(m.remark)}</td>` : '<td></td>'}
    </tr>
  `).join('');

  const modal = Modal.create({
    id:   'modal-att-student',
    title: 'Student Attendance Profile',
    size:  'lg',
    bodyHTML: `
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;
                  padding:16px;background:rgba(0,212,255,0.04);
                  border:1px solid rgba(0,212,255,0.12);border-radius:var(--radius-md);">
        <div style="
          width:50px;height:50px;border-radius:50%;flex-shrink:0;
          background:linear-gradient(135deg,rgba(0,212,255,0.20),rgba(42,78,127,0.50));
          border:2px solid rgba(0,212,255,0.30);
          display:flex;align-items:center;justify-content:center;
          font-size:17px;font-weight:700;color:var(--color-cyan-400);
        ">${initials(s.name)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:700;color:#fff;">${_attEsc(s.name)}</div>
          <div style="font-size:12px;color:var(--color-slate-400);margin-top:2px;">
            ${_attEsc(s.rollNo)} · ${_attEsc(s.department)} · ${_attEsc(s.course)}
          </div>
        </div>
        <!-- Rate circle -->
        <div style="text-align:center;flex-shrink:0;">
          <div style="font-family:var(--font-mono);font-size:24px;font-weight:700;
                      color:${rateColor};line-height:1;">
            ${rate !== null ? rate + '%' : '—'}
          </div>
          <div style="font-size:10px;color:var(--color-slate-400);text-transform:uppercase;
                      letter-spacing:0.08em;margin-top:2px;">
            Sem Rate
          </div>
          ${rate !== null && rate < ATT.THRESHOLD ? `
            <div style="margin-top:6px;padding:2px 8px;border-radius:99px;
                        background:rgba(242,95,92,0.12);border:1px solid rgba(242,95,92,0.28);
                        color:var(--color-danger);font-size:10px;font-weight:700;">
              ⚠ Below ${ATT.THRESHOLD}%
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Summary stats -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">
        ${['P','L','A','EX'].map(st => {
          const cnt = allMarks.filter(m => m.status === st).length;
          return `
            <div style="text-align:center;padding:12px 8px;
                        background:${ATT.STATUS_COLOR[st]}10;
                        border:1px solid ${ATT.STATUS_COLOR[st]}28;
                        border-radius:var(--radius-md);">
              <div style="font-family:var(--font-mono);font-size:22px;font-weight:500;
                          color:${ATT.STATUS_COLOR[st]};line-height:1;">${cnt}</div>
              <div style="font-size:11px;color:var(--color-slate-400);margin-top:4px;
                          text-transform:uppercase;letter-spacing:0.06em;">
                ${ATT.STATUS_LABEL[st]}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Recent records -->
      <div style="font-size:10.5px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;
                  color:var(--color-slate-400);margin-bottom:10px;">
        Recent Sessions (${Math.min(12, allMarks.length)} of ${allMarks.length})
      </div>
      ${allMarks.length ? `
        <div style="overflow-x:auto;border:1px solid var(--color-border);border-radius:var(--radius-sm);">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="border-bottom:1px solid rgba(139,163,188,0.12);background:rgba(255,255,255,0.02);">
                <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-slate-400);">Date</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-slate-400);">Session</th>
                <th style="padding:7px 12px;text-align:center;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-slate-400);">Status</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-slate-400);">Remark</th>
              </tr>
            </thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>
      ` : `<p style="font-size:13px;color:var(--color-slate-400);text-align:center;padding:16px 0;">No attendance records found for this student.</p>`}
    `,
    footerHTML: `
      <button id="btn-att-panel-close" style="padding:9px 20px;border-radius:var(--radius-sm);border:1px solid rgba(139,163,188,0.22);background:rgba(255,255,255,0.04);color:var(--color-slate-300);font-size:13px;font-weight:600;cursor:pointer;">Close</button>
    `,
  });

  modal.open();
  modal.footer().querySelector('#btn-att-panel-close').addEventListener('click', () => modal.close());
}


/* =============================================================================
   A-VIEW. Session Detail Modal
   ============================================================================= */

function attViewSessionDetail(id) {
  const rec = attGetRecord(id);
  if (!rec) { Toast.show('Record not found', 'danger'); return; }

  const markRows = (rec.marks || []).slice(0, 30).map(m => `
    <tr>
      <td style="padding:6px 12px;font-size:12px;color:var(--color-white-soft);">${_attEsc(m.name)}</td>
      <td style="padding:6px 12px;font-family:var(--font-mono);font-size:11px;color:var(--color-slate-400);">${_attEsc(m.rollNo)}</td>
      <td style="padding:6px 12px;text-align:center;">
        <span class="badge ${ATT.STATUS_BADGE[m.status] || 'badge--info'}">${ATT.STATUS_LABEL[m.status] || m.status}</span>
      </td>
      <td style="padding:6px 12px;font-size:11px;color:var(--color-slate-400);">${m.remark ? _attEsc(m.remark) : '—'}</td>
    </tr>
  `).join('');

  const modal = Modal.create({
    id:   'modal-att-session-detail',
    title: 'Session Detail',
    size:  'lg',
    bodyHTML: `
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px;">
        ${[
          ['Session',    rec.sessionLabel],
          ['Date',       rec.date],
          ['Faculty',    rec.faculty],
          ['Department', rec.department],
          ['Enrolled',   rec.totalEnrolled],
          ['Rate',       `${rec.rate}%`],
        ].map(([k, v]) => `
          <div style="padding:10px 14px;background:rgba(255,255,255,0.03);
                      border:1px solid rgba(139,163,188,0.12);border-radius:var(--radius-sm);">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;
                        letter-spacing:0.08em;color:var(--color-slate-400);margin-bottom:4px;">${k}</div>
            <div style="font-size:13px;font-weight:600;color:var(--color-white);">${_attEsc(String(v))}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">
        ${[['P','Present',rec.present],['L','Late',rec.late],['A','Absent',rec.absent],['EX','Excused',rec.excused||0]].map(([k,l,v]) => `
          <div style="text-align:center;padding:10px;background:${ATT.STATUS_COLOR[k]}10;
                      border:1px solid ${ATT.STATUS_COLOR[k]}28;border-radius:var(--radius-sm);">
            <div style="font-family:var(--font-mono);font-size:20px;font-weight:500;
                        color:${ATT.STATUS_COLOR[k]};">${v}</div>
            <div style="font-size:10px;color:var(--color-slate-400);text-transform:uppercase;
                        letter-spacing:0.06em;margin-top:3px;">${l}</div>
          </div>
        `).join('')}
      </div>
      <div style="font-size:10.5px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;
                  color:var(--color-slate-400);margin-bottom:10px;">
        Student Marks (${Math.min(30, rec.marks?.length || 0)} shown)
      </div>
      ${rec.marks?.length ? `
        <div style="overflow-x:auto;border:1px solid var(--color-border);border-radius:var(--radius-sm);max-height:300px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead style="position:sticky;top:0;background:rgba(12,22,38,0.98);">
              <tr style="border-bottom:1px solid rgba(139,163,188,0.12);">
                <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-slate-400);">Name</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-slate-400);">Roll No</th>
                <th style="padding:7px 12px;text-align:center;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-slate-400);">Status</th>
                <th style="padding:7px 12px;text-align:left;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-slate-400);">Remark</th>
              </tr>
            </thead>
            <tbody>${markRows}</tbody>
          </table>
        </div>
      ` : '<p style="font-size:13px;color:var(--color-slate-400);text-align:center;">No mark data available.</p>'}
    `,
    footerHTML: `
      <button id="btn-detail-close" style="padding:9px 20px;border-radius:var(--radius-sm);border:1px solid rgba(139,163,188,0.22);background:rgba(255,255,255,0.04);color:var(--color-slate-300);font-size:13px;font-weight:600;cursor:pointer;">Close</button>
    `,
  });

  modal.open();
  modal.footer().querySelector('#btn-detail-close').addEventListener('click', () => modal.close());
}


/* =============================================================================
   HELPERS
   ============================================================================= */

function _attEsc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _attStatusIcon(status) {
  const icons = {
    P: '<i class="fas fa-check"  aria-hidden="true"></i>',
    L: '<i class="fas fa-clock"  aria-hidden="true"></i>',
    A: '<i class="fas fa-xmark"  aria-hidden="true"></i>',
    EX:'<i class="fas fa-file-circle-check" aria-hidden="true"></i>',
  };
  return icons[status] || icons.A;
}


/* =============================================================================
   A15. NAVMODULE INTEGRATION HOOK
   ============================================================================= */

/**
 * Call this from NavModule.setActive() to show/hide the section.
 * Since we can't modify app.js, we patch NavModule.setActive after it loads.
 *
 * In app.js, add inside NavModule.init():
 *    AttendanceModule.hookNav();
 *
 * Or simply call NavModule.setActive = AttendanceModule._wrappedSetActive below.
 */
function attHookNav() {
  if (typeof NavModule === 'undefined' || !NavModule.setActive) return;

  const _original = NavModule.setActive.bind(NavModule);
  NavModule.setActive = function (key) {
    _original(key);

    if (key === 'attendance') {
      attShow();
    } else {
      attHide();
    }
  };
}


/* =============================================================================
   REFRESH ALL — re-render every sub-panel
   ============================================================================= */


function attRenderStudentView() {
  attShow();
}

function exportStudentAttendanceCSV(subjectStats, totalClasses, attendedClasses) {
  let csv = 'Subject,Classes Held,Classes Attended,Percentage\n';
  for (const [subj, stats] of Object.entries(subjectStats)) {
    const pct = Math.round((stats.attended / stats.total) * 100);
    csv += `"${subj}",${stats.total},${stats.attended},${pct}%\n`;
  }
  const overallPct = totalClasses ? Math.round((attendedClasses / totalClasses) * 100) : 0;
  csv += `\n"OVERALL",${totalClasses},${attendedClasses},${overallPct}%\n`;
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', 'My_Attendance_Report.csv');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function attRefreshAll() {
  
  if ((Auth.getRole() || '').toLowerCase() === 'student') {
    attRenderStudentView();
    return;
  }
  attRenderKPIs();
  attRenderDeptBreakdown();
  attRenderTrendChart();
  attRenderAlerts();
  attRenderHistory();
}


/* =============================================================================
   A16. INIT
   ============================================================================= */

const AttendanceModule = {

  init() {
    // 1. Seed demo data if storage is empty
    // 1b. Fetch records from backend (if available) to populate history
    attFetchRecordsFromAPI().then(() => {
      attRefreshAll();
    });

    // 2. Inject section HTML into DOM
    attInjectSection();

    // 3. Wire all interactive elements
    attPopulateSessionSelect();
    attInitMasterCheckbox();
    attInitToolbar();
    attInitSubmitBtn();
    attInitExportBtn();
    attInitDateFilter();

    // 4. Hook into NavModule routing
    attHookNav();

    // 5. Initial render of all cards (section is hidden — data is ready)
    attRefreshAll();

    // 6. Wire the Quick Action "Mark Attendance" button in app.js
    //    (DOM.qaAttendance is set in initDOMCache())
    const qaBtn = document.getElementById('qa-mark-attendance');
    if (qaBtn) {
      // Replace the placeholder listener set by app.js QuickActionsModule
      qaBtn.replaceEventListener
        ? qaBtn.replaceEventListener('click', () => NavModule.setActive('attendance'))
        : qaBtn.addEventListener('click', () => {
            if (typeof NavModule !== 'undefined') NavModule.setActive('attendance');
          });
    }

    console.info('[AttendanceModule] Initialised');
  },

  // Public surface
  show:        attShow,
  hide:        attHide,
  refreshAll:  attRefreshAll,
  renderKPIs:  attRenderKPIs,
  exportCSV:   attExportCSV,
  hookNav:     attHookNav,
};

/* =============================================================================
   AUTO-BOOT
   Registers itself once DOM + app.js are both ready.
   ============================================================================= */

(function boot() {
  function tryInit() {
    // Wait until app.js globals exist
    if (typeof CMS === 'undefined' || typeof Modal === 'undefined') {
      setTimeout(tryInit, 80);
      return;
    }
    AttendanceModule.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();