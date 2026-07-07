/**
 * =============================================================================
 * ASHFORD UNIVERSITY — CMS ADMIN DASHBOARD
 * marks.js  |  Marks Management Module
 * =============================================================================
 *
 * Depends on: app.js
 *   Globals used: CMS, $, $$, lsGet, lsSet, uid, formatDate, initials,
 *                 debounce, Toast, Modal, logActivity, NavModule, DOM
 *
 * Storage keys:
 *   'cms_exams'        →  Array<ExamRecord>
 *   'cms_marks'        →  Array<MarkRecord>
 *
 * ExamRecord shape:
 * {
 *   id, code, title, subject, department, course, semester,
 *   examType,          // 'Internal' | 'Mid-Semester' | 'End-Semester' | 'Practical' | 'Viva'
 *   totalMarks,        // number (max marks)
 *   passingMarks,      // number
 *   conductedOn,       // ISO date
 *   faculty, venue,
 *   status,            // 'Scheduled' | 'Ongoing' | 'Completed' | 'Cancelled'
 *   createdAt, updatedAt
 * }
 *
 * MarkRecord shape:
 * {
 *   id, examId,
 *   studentId, studentName, rollNo, department, semester,
 *   marksObtained,     // number
 *   grade,             // computed: S/A/B/C/D/F
 *   gradePoint,        // 0–10
 *   remarks,
 *   enteredBy,
 *   createdAt, updatedAt
 * }
 *
 * TABLE OF CONTENTS
 * -----------------
 * M1.  Config & Runtime State
 * M2.  Grading Engine
 *      M2a. Grade / Grade-Point from raw score
 *      M2b. GPA / CGPA across multiple exams
 *      M2c. Class statistics (avg, highest, lowest, pass%, distribution)
 * M3.  localStorage Store
 *      M3a. Exam CRUD helpers
 *      M3b. Marks CRUD helpers
 *      M3c. Cross-module student reader
 * M4.  Seed Data — 6 exams + marks for enrolled students
 * M5.  Section HTML Injection
 * M6.  Section Show / Hide / NavModule Hook
 * M7.  KPI Cards — render
 * M8.  Exam Selector & Context Bar
 * M9.  Gradebook Table — enter / display marks per exam
 *      M9a. Render roster rows with inline score inputs
 *      M9b. Inline edit & auto-grade
 *      M9c. Bulk save
 *      M9d. Search & filter inside gradebook
 * M10. Class Analytics Panel
 *      M10a. Stats strip (avg, highest, lowest, pass%)
 *      M10b. Grade distribution SVG bar chart
 *      M10c. Score histogram SVG
 * M11. Rank / Leaderboard Table
 * M12. Student Report Card Modal
 * M13. Exam Management (Add / Edit / Delete exam)
 *      M13a. Exam list card
 *      M13b. Add Exam Modal
 *      M13c. Edit Exam Modal
 *      M13d. Delete Exam Modal
 * M14. Mark Entry Modal (single student, detailed)
 * M15. Bulk Import (CSV paste parser)
 * M16. CSV Export
 * M17. Init & Auto-Boot
 * =============================================================================
 */

'use strict';

/* =============================================================================
   M1. CONFIG & RUNTIME STATE
   ============================================================================= */

const MRK = {
  examKey:  'cms_exams',
  markKey:  'cms_marks',

  ROWS_PER_PAGE: 12,
  page: 1,

  /** Currently selected exam id */
  activeExamId: null,

  /** Gradebook filter */
  filter: { query: '', grade: 'all' },

  /** Exam list filter */
  examFilter: { dept: 'all', type: 'all', status: 'all' },

  /** Active tab: 'gradebook' | 'analytics' | 'ranks' | 'exams' */
  activeTab: 'gradebook',

  DEPARTMENTS: [
    'Computer Science', 'Business Admin', 'Engineering',
    'Medical Sciences', 'Arts & Humanities',
  ],

  EXAM_TYPES: [
    'Internal', 'Mid-Semester', 'End-Semester', 'Practical', 'Viva',
  ],

  EXAM_STATUSES: ['Scheduled', 'Ongoing', 'Completed', 'Cancelled'],

  /** Grade thresholds (percentage of totalMarks) */
  GRADE_SCALE: [
    { min: 90, grade: 'S',  point: 10, label: 'Outstanding',  color: '#00D4FF' },
    { min: 80, grade: 'A',  point: 9,  label: 'Excellent',    color: '#22D3A3' },
    { min: 70, grade: 'B',  point: 8,  label: 'Very Good',    color: '#818CF8' },
    { min: 60, grade: 'C',  point: 7,  label: 'Good',         color: '#F5A524' },
    { min: 50, grade: 'D',  point: 6,  label: 'Satisfactory', color: '#F5A524' },
    { min: 40, grade: 'E',  point: 5,  label: 'Pass',         color: '#8BA3BC' },
    { min: 0,  grade: 'F',  point: 0,  label: 'Fail',         color: '#F25F5C' },
  ],

  EXAM_TYPE_COLOR: {
    'Internal':      'var(--color-cyan-400)',
    'Mid-Semester':  'var(--color-info)',
    'End-Semester':  'var(--color-success)',
    'Practical':     'var(--color-warning)',
    'Viva':          'var(--color-danger)',
  },

  EXAM_STATUS_BADGE: {
    'Scheduled': 'badge--info',
    'Ongoing':   'badge--warning',
    'Completed': 'badge--success',
    'Cancelled': 'badge--danger',
  },

  DEPT_COLOR: {
    'Computer Science':  '#00D4FF',
    'Business Admin':    '#818CF8',
    'Engineering':       '#22D3A3',
    'Medical Sciences':  '#F5A524',
    'Arts & Humanities': '#F25F5C',
  },
};

/* Convenience aliases — safe because app.js already defines these */
const _m$  = (sel, ctx = document) => ctx.querySelector(sel);
const _m$$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];


/* =============================================================================
   M2. GRADING ENGINE
   ============================================================================= */

/* ── M2a. Grade from raw score ─────────────────────────────────────────────── */

/**
 * Compute grade info for a raw score given the exam's totalMarks.
 * Returns { grade, gradePoint, pct, label, color }
 */
function mrkComputeGrade(marksObtained, totalMarks) {
  if (totalMarks <= 0) return { grade: '—', gradePoint: 0, pct: 0, label: '—', color: '#8BA3BC' };
  const pct = (marksObtained / totalMarks) * 100;
  const entry = MRK.GRADE_SCALE.find(g => pct >= g.min) || MRK.GRADE_SCALE[MRK.GRADE_SCALE.length - 1];
  return { ...entry, pct: Math.round(pct * 10) / 10 };
}

/* ── M2b. GPA for a student across a set of marks ──────────────────────────── */

/**
 * Returns the GPA (0–10) for a student, weighted equally across exams.
 * Null if no marks exist.
 */
function mrkStudentGPA(studentId) {
  const marks = mrkLoadMarks().filter(m => m.studentId === studentId);
  if (!marks.length) return null;
  const sum = marks.reduce((a, m) => a + (m.gradePoint || 0), 0);
  return Math.round((sum / marks.length) * 100) / 100;
}

/* ── M2c. Class statistics for one exam ────────────────────────────────────── */

/**
 * Returns { avg, highest, lowest, passCount, failCount, passRate, distribution }
 * distribution: Array<{ grade, count, color }>
 */
function mrkExamStats(examId) {
  const exam    = mrkGetExam(examId);
  const marks   = mrkLoadMarks().filter(m => m.examId === examId);
  if (!marks.length || !exam) return null;

  const scores  = marks.map(m => m.marksObtained);
  const avg     = scores.reduce((a, b) => a + b, 0) / scores.length;
  const highest = Math.max(...scores);
  const lowest  = Math.min(...scores);
  const passCount = marks.filter(m => m.marksObtained >= exam.passingMarks).length;

  // Distribution by grade
  const dist = {};
  MRK.GRADE_SCALE.forEach(g => { dist[g.grade] = { ...g, count: 0 }; });
  marks.forEach(m => {
    const g = mrkComputeGrade(m.marksObtained, exam.totalMarks);
    if (dist[g.grade]) dist[g.grade].count++;
  });

  return {
    avg:        Math.round(avg * 10) / 10,
    highest,
    lowest,
    passCount,
    failCount:  marks.length - passCount,
    passRate:   Math.round((passCount / marks.length) * 100),
    total:      marks.length,
    distribution: Object.values(dist).filter(d => d.count > 0),
  };
}


/* =============================================================================
   M3. LOCALSTORAGE STORE
   ============================================================================= */

/* ── M3a. Exam CRUD ─────────────────────────────────────────────────────────── */

function mrkLoadExams()     { return lsGet(MRK.examKey, []); }
function mrkSaveExams(list) { lsSet(MRK.examKey, list); }
function mrkGetExam(id)     { return mrkLoadExams().find(e => e.id === id) || null; }

function mrkAddExam(data) {
  const list = mrkLoadExams();
  const exam = {
    id:           uid('ex'),
    code:         _mrkNextExamCode(list, data.department),
    title:        data.title.trim(),
    subject:      data.subject.trim(),
    department:   data.department,
    course:       (data.course || '').trim(),
    semester:     data.semester || '1',
    examType:     data.examType     || 'Internal',
    totalMarks:   parseInt(data.totalMarks, 10) || 100,
    passingMarks: parseInt(data.passingMarks, 10) || 40,
    conductedOn:  data.conductedOn  || new Date().toISOString().slice(0, 10),
    faculty:      (data.faculty     || '').trim(),
    venue:        (data.venue       || '').trim(),
    status:       data.status       || 'Scheduled',
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };
  list.push(exam);
  mrkSaveExams(list);
  logActivity(`Exam created: <strong>${exam.title}</strong> — ${exam.department}`, 'info');
  return exam;
}

function mrkUpdateExam(id, data) {
  const list = mrkLoadExams();
  const idx  = list.findIndex(e => e.id === id);
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    title:        data.title.trim(),
    subject:      data.subject.trim(),
    department:   data.department     || list[idx].department,
    course:       (data.course        || '').trim(),
    semester:     data.semester       || list[idx].semester,
    examType:     data.examType       || list[idx].examType,
    totalMarks:   parseInt(data.totalMarks, 10) || list[idx].totalMarks,
    passingMarks: parseInt(data.passingMarks, 10) || list[idx].passingMarks,
    conductedOn:  data.conductedOn    || list[idx].conductedOn,
    faculty:      (data.faculty       || '').trim(),
    venue:        (data.venue         || '').trim(),
    status:       data.status         || list[idx].status,
    updatedAt:    new Date().toISOString(),
  };
  mrkSaveExams(list);
  logActivity(`Exam updated: <strong>${list[idx].title}</strong>`, 'info');
  return list[idx];
}

function mrkDeleteExam(id) {
  const exam  = mrkGetExam(id);
  const list  = mrkLoadExams().filter(e => e.id !== id);
  mrkSaveExams(list);
  // Cascade delete all marks for this exam
  const marks = mrkLoadMarks().filter(m => m.examId !== id);
  mrkSaveMarks(marks);
  if (exam) logActivity(`Exam deleted: <strong>${exam.title}</strong>`, 'danger');
  return true;
}

function _mrkNextExamCode(list, dept) {
  const codes = { 'Computer Science':'CS', 'Business Admin':'BA', 'Engineering':'EN',
                  'Medical Sciences':'ME', 'Arts & Humanities':'AH' };
  const prefix = codes[dept] || 'GN';
  const nums   = list
    .filter(e => (e.code || '').startsWith(prefix))
    .map(e => parseInt((e.code || '').replace(/\D/g, ''), 10))
    .filter(Boolean);
  const next = nums.length ? Math.max(...nums) + 1 : 101;
  return `${prefix}-${next}`;
}

/* ── M3b. Marks CRUD ────────────────────────────────────────────────────────── */

function mrkLoadMarks()     { return lsGet(MRK.markKey, []); }
function mrkSaveMarks(list) { lsSet(MRK.markKey, list); }
function mrkGetMark(id)     { return mrkLoadMarks().find(m => m.id === id) || null; }

/**
 * Upsert a mark for (examId, studentId). Creates if absent, updates if present.
 * Returns the saved MarkRecord.
 */
function mrkUpsertMark(examId, studentId, marksObtained, remarks = '') {
  const exam    = mrkGetExam(examId);
  if (!exam) return null;

  const grade   = mrkComputeGrade(marksObtained, exam.totalMarks);
  const list    = mrkLoadMarks();
  const existing = list.findIndex(m => m.examId === examId && m.studentId === studentId);

  // Read student info
  const stu = _mrkLoadStudents().find(s => s.id === studentId);

  const record = {
    id:            existing >= 0 ? list[existing].id : uid('mrk'),
    examId,
    studentId,
    studentName:   stu?.name     || 'Unknown',
    rollNo:        stu?.rollNo   || '—',
    department:    stu?.department || exam.department,
    semester:      stu?.semester  || exam.semester,
    marksObtained: parseFloat(marksObtained) || 0,
    grade:         grade.grade,
    gradePoint:    grade.gradePoint,
    pct:           grade.pct,
    remarks:       remarks.trim(),
    enteredBy:     'Dr. Raj Ahuja',
    createdAt:     existing >= 0 ? list[existing].createdAt : new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
  };

  if (existing >= 0) list[existing] = record;
  else list.push(record);

  mrkSaveMarks(list);
  return record;
}

function mrkDeleteMark(id) {
  const list = mrkLoadMarks().filter(m => m.id !== id);
  mrkSaveMarks(list);
}

/* ── M3c. Cross-module student reader ──────────────────────────────────────── */

let MRK_STUDENTS = [];
function _mrkLoadStudents() {
  return MRK_STUDENTS;
}

function _mrkEnrolledForDept(dept) {
  const students = _mrkLoadStudents();
  // Filter by department or class (ignoring strict status checks to avoid hiding test data)
  let filtered = students.filter(s => !dept || s.department === dept || s.class === dept);
  
  // If no students match the exam's department (common during testing/prototyping), 
  // fallback to returning all students so the Gradebook is never totally empty.
  if (filtered.length === 0 && students.length > 0) {
    return students;
  }
  return filtered;
}


/* =============================================================================
   M5. SECTION HTML INJECTION
   ============================================================================= */

function mrkInjectSection() {
  if (_m$('#marks-section')) return;

  const section = document.createElement('section');
  section.id    = 'marks-section';
  section.setAttribute('aria-labelledby', 'marks-section-title');
  section.setAttribute('data-module', 'marks');
  section.style.display = 'none';

  section.innerHTML = `
    <h2 class="section-title" id="marks-section-title">Marks Management</h2>

    <!-- KPI Row -->
    <div id="mrk-kpi-row" role="list" aria-label="Marks statistics"
         style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">

      <div class="stat-card" id="mrk-kpi-exams" role="listitem" tabindex="0">
        <div class="stat-card__header">
          <div class="stat-card__label">Total Exams</div>
          <div class="stat-card__icon-wrap stat-card__icon-wrap--cyan">
            <i class="fas fa-file-pen" aria-hidden="true"></i>
          </div>
        </div>
        <div class="stat-card__value" id="mrk-val-exams">0</div>
        <div class="stat-card__footer">
          <span class="stat-card__delta stat-card__delta--up" id="mrk-val-completed">0</span>
          <span style="margin-left:5px;">completed</span>
        </div>
      </div>

      <div class="stat-card" id="mrk-kpi-entries" role="listitem" tabindex="0">
        <div class="stat-card__header">
          <div class="stat-card__label">Mark Entries</div>
          <div class="stat-card__icon-wrap stat-card__icon-wrap--success">
            <i class="fas fa-list-check" aria-hidden="true"></i>
          </div>
        </div>
        <div class="stat-card__value" id="mrk-val-entries">0</div>
        <div class="stat-card__footer">
          <i class="fas fa-users" style="color:var(--color-success);" aria-hidden="true"></i>
          <span style="margin-left:5px;">across all exams</span>
        </div>
      </div>

      <div class="stat-card" id="mrk-kpi-avg" role="listitem" tabindex="0">
        <div class="stat-card__header">
          <div class="stat-card__label">Overall Avg Score</div>
          <div class="stat-card__icon-wrap stat-card__icon-wrap--info">
            <i class="fas fa-chart-simple" aria-hidden="true"></i>
          </div>
        </div>
        <div class="stat-card__value" id="mrk-val-avg">—</div>
        <div class="stat-card__footer">
          <span class="stat-card__delta" id="mrk-avg-grade" style="color:var(--color-info);">—</span>
          <span style="margin-left:5px;">avg grade</span>
        </div>
      </div>

      <div class="stat-card" id="mrk-kpi-pass" role="listitem" tabindex="0">
        <div class="stat-card__header">
          <div class="stat-card__label">Overall Pass Rate</div>
          <div class="stat-card__icon-wrap stat-card__icon-wrap--warning">
            <i class="fas fa-graduation-cap" aria-hidden="true"></i>
          </div>
        </div>
        <div class="stat-card__value" id="mrk-val-pass">—%</div>
        <div class="stat-card__footer">
          <span class="stat-card__delta stat-card__delta--up" id="mrk-val-fail">0</span>
          <span style="margin-left:5px;">students failed</span>
        </div>
      </div>

    </div>

    <!-- Tab bar + exam selector -->
    <div style="display:flex;align-items:center;justify-content:space-between;
                flex-wrap:wrap;gap:12px;margin-bottom:20px;">

      <!-- Tabs -->
      <div id="mrk-tabs" role="tablist" aria-label="Marks module sections"
           style="display:flex;gap:4px;background:rgba(255,255,255,0.03);
                  border:1px solid var(--color-border);border-radius:var(--radius-md);
                  padding:4px;">
        ${[
          ['gradebook', 'fa-table-cells',   'Gradebook'],
          ['analytics', 'fa-chart-bar',     'Analytics'],
          ['ranks',     'fa-trophy',         'Rankings'],
          ['exams',     'fa-file-pen',       'Exams'],
        ].map(([tab, icon, label]) => `
          <button class="mrk-tab" data-tab="${tab}" role="tab"
                  aria-selected="${tab === 'gradebook'}"
                  aria-controls="mrk-panel-${tab}"
                  style="display:flex;align-items:center;gap:7px;
                         padding:7px 16px;border-radius:var(--radius-sm);
                         border:none;font-family:var(--font-ui);
                         font-size:12.5px;font-weight:600;cursor:pointer;
                         transition:all .15s;
                         background:${tab === 'gradebook' ? 'rgba(0,212,255,0.12)' : 'transparent'};
                         color:${tab === 'gradebook' ? 'var(--color-cyan-400)' : 'var(--color-slate-400)'};">
            <i class="fas ${icon}" aria-hidden="true"></i>
            ${label}
          </button>
        `).join('')}
      </div>

      <!-- Exam selector + Add Exam -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <select id="mrk-exam-select" aria-label="Select exam"
                style="background:rgba(255,255,255,0.04);
                       border:1px solid rgba(139,163,188,0.18);
                       border-radius:var(--radius-sm);
                       color:var(--color-white-soft);
                       font-family:var(--font-ui);font-size:12px;
                       padding:7px 10px;cursor:pointer;height:36px;min-width:220px;">
          <option value="">— Select an Exam —</option>
        </select>
        <button id="btn-mrk-add-exam" data-roles="admin"
                style="display:flex;align-items:center;gap:7px;
                       padding:0 16px;height:36px;
                       background:rgba(0,212,255,0.10);
                       border:1px solid rgba(0,212,255,0.26);
                       border-radius:var(--radius-sm);
                       color:var(--color-cyan-400);font-family:var(--font-ui);
                       font-size:12.5px;font-weight:700;cursor:pointer;
                       transition:all .15s;white-space:nowrap;">
          <i class="fas fa-plus" aria-hidden="true"></i> New Exam
        </button>
      </div>
    </div>

    <!-- ─── PANEL: GRADEBOOK ─────────────────────────────────────────── -->
    <div id="mrk-panel-gradebook" role="tabpanel">

      <!-- Context bar (shown when exam selected) -->
      <div id="mrk-exam-context" style="display:none;
           padding:14px 20px;margin-bottom:16px;border-radius:var(--radius-lg);
           background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.14);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--color-white);"
                 id="mrk-ctx-title">—</div>
            <div style="font-size:12px;color:var(--color-slate-400);margin-top:3px;"
                 id="mrk-ctx-meta">—</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span class="badge badge--info" id="mrk-ctx-type">—</span>
            <span id="mrk-ctx-marks-info"
                  style="font-family:var(--font-mono);font-size:12px;color:var(--color-slate-300);">—</span>
            <span class="badge" id="mrk-ctx-status">—</span>
          </div>
        </div>
      </div>

      <!-- Gradebook controls -->
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <div id="mrk-gb-search-wrap" style="display:flex;align-items:center;gap:7px;
             background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.18);
             border-radius:var(--radius-sm);padding:0 10px;height:34px;flex:1;min-width:180px;
             transition:border-color .2s,box-shadow .2s;">
          <i class="fas fa-search" aria-hidden="true" style="color:var(--color-slate-400);font-size:11px;"></i>
          <input type="search" id="mrk-gb-search"
                 placeholder="Search student name or roll no…"
                 aria-label="Search in gradebook"
                 style="background:none;border:none;outline:none;
                        font-family:var(--font-ui);font-size:12.5px;
                        color:var(--color-white);flex:1;"/>
        </div>
        <select id="mrk-gb-grade-filter" aria-label="Filter by grade"
                style="background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.18);
                       border-radius:var(--radius-sm);color:var(--color-white-soft);
                       font-family:var(--font-ui);font-size:12px;padding:6px 10px;cursor:pointer;height:34px;">
          <option value="all">All Grades</option>
          ${MRK.GRADE_SCALE.map(g => `<option value="${g.grade}">${g.grade} — ${g.label}</option>`).join('')}
        </select>
        <button id="btn-mrk-bulk-save"
                style="display:flex;align-items:center;gap:6px;padding:0 14px;height:34px;
                       background:rgba(34,211,163,0.10);border:1px solid rgba(34,211,163,0.26);
                       border-radius:var(--radius-sm);color:var(--color-success);
                       font-family:var(--font-ui);font-size:12.5px;font-weight:700;
                       cursor:pointer;transition:all .15s;white-space:nowrap;">
          <i class="fas fa-floppy-disk" aria-hidden="true"></i> Save All
        </button>
        <button id="btn-mrk-export"
                style="display:flex;align-items:center;gap:6px;padding:0 12px;height:34px;
                       background:rgba(255,255,255,0.03);border:1px solid rgba(139,163,188,0.20);
                       border-radius:var(--radius-sm);color:var(--color-slate-300);
                       font-family:var(--font-ui);font-size:12px;font-weight:600;
                       cursor:pointer;transition:background .15s;white-space:nowrap;">
          <i class="fas fa-file-csv" aria-hidden="true"></i> Export
        </button>
      </div>

      <!-- Gradebook table card -->
      <div class="card" id="mrk-gradebook-card">
        <div class="card-body card-body--flush" style="overflow-x:auto;">
          <table class="data-table" id="mrk-gradebook-table" aria-label="Gradebook">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Student</th>
                <th scope="col">Roll No</th>
                <th scope="col">Department</th>
                <th scope="col" style="text-align:center;">
                  Marks <span id="mrk-th-max" style="color:var(--color-slate-400);font-weight:400;">(/ —)</span>
                </th>
                <th scope="col" style="text-align:center;">%</th>
                <th scope="col" style="text-align:center;">Grade</th>
                <th scope="col" style="text-align:center;">Grade Point</th>
                <th scope="col">Remarks</th>
                <th scope="col" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody id="mrk-gradebook-tbody"></tbody>
          </table>

          <!-- Empty / no-exam states -->
          <div id="mrk-gb-no-exam" style="text-align:center;padding:56px 24px;
               color:var(--color-slate-400);">
            <i class="fas fa-file-pen"
               style="font-size:40px;margin-bottom:16px;display:block;opacity:.25;"
               aria-hidden="true"></i>
            <p style="font-size:15px;font-weight:600;color:var(--color-white-soft);margin-bottom:6px;">
              Select an exam to open the gradebook
            </p>
            <p style="font-size:13px;">
              Choose an exam from the dropdown above, or create a new one.
            </p>
          </div>

          <div id="mrk-gb-empty" style="display:none;text-align:center;padding:40px 24px;
               color:var(--color-slate-400);">
            <i class="fas fa-user-xmark"
               style="font-size:32px;margin-bottom:12px;display:block;opacity:.28;"
               aria-hidden="true"></i>
            <p style="font-size:14px;font-weight:600;color:var(--color-white-soft);">
              No students match your filter
            </p>
          </div>
        </div>

        <!-- Gradebook footer: pagination + live stats -->
        <div id="mrk-gb-footer"
             style="display:none;flex-wrap:wrap;align-items:center;justify-content:space-between;
                    gap:12px;padding:10px 22px;
                    border-top:1px solid var(--color-border);background:rgba(0,0,0,0.08);">
          <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
            <span style="font-size:11px;color:var(--color-slate-400);">Class stats →</span>
            <span id="mrk-live-avg"
                  style="font-size:12px;font-weight:700;color:var(--color-cyan-400);">
              Avg: —
            </span>
            <span id="mrk-live-highest"
                  style="font-size:12px;font-weight:700;color:var(--color-success);">
              High: —
            </span>
            <span id="mrk-live-lowest"
                  style="font-size:12px;font-weight:700;color:var(--color-danger);">
              Low: —
            </span>
            <span id="mrk-live-pass"
                  style="font-size:12px;font-weight:700;color:var(--color-warning);">
              Pass: —%
            </span>
          </div>
          <div id="mrk-gb-pg-btns" style="display:flex;gap:6px;"></div>
        </div>
      </div>
    </div>

    <!-- ─── PANEL: ANALYTICS ─────────────────────────────────────────── -->
    <div id="mrk-panel-analytics" role="tabpanel" style="display:none;">
      <div id="mrk-analytics-content">
        <div style="text-align:center;padding:60px 24px;color:var(--color-slate-400);">
          <i class="fas fa-chart-bar" style="font-size:36px;margin-bottom:14px;display:block;opacity:.25;" aria-hidden="true"></i>
          <p style="font-size:14px;color:var(--color-white-soft);font-weight:600;">Select an exam to view analytics</p>
        </div>
      </div>
    </div>

    <!-- ─── PANEL: RANKINGS ──────────────────────────────────────────── -->
    <div id="mrk-panel-ranks" role="tabpanel" style="display:none;">
      <div id="mrk-ranks-content">
        <div style="text-align:center;padding:60px 24px;color:var(--color-slate-400);">
          <i class="fas fa-trophy" style="font-size:36px;margin-bottom:14px;display:block;opacity:.25;" aria-hidden="true"></i>
          <p style="font-size:14px;color:var(--color-white-soft);font-weight:600;">Select an exam to view rankings</p>
        </div>
      </div>
    </div>

    <!-- ─── PANEL: EXAMS ─────────────────────────────────────────────── -->
    <div id="mrk-panel-exams" role="tabpanel" style="display:none;">

      <!-- Exam list filters -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
        <select id="mrk-exam-dept-filter" aria-label="Filter exams by department"
                style="background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.18);
                       border-radius:var(--radius-sm);color:var(--color-white-soft);
                       font-family:var(--font-ui);font-size:12px;padding:7px 10px;cursor:pointer;height:34px;">
          <option value="all">All Departments</option>
          ${MRK.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
        <select id="mrk-exam-type-filter" aria-label="Filter by exam type"
                style="background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.18);
                       border-radius:var(--radius-sm);color:var(--color-white-soft);
                       font-family:var(--font-ui);font-size:12px;padding:7px 10px;cursor:pointer;height:34px;">
          <option value="all">All Types</option>
          ${MRK.EXAM_TYPES.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <select id="mrk-exam-status-filter" aria-label="Filter by status"
                style="background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.18);
                       border-radius:var(--radius-sm);color:var(--color-white-soft);
                       font-family:var(--font-ui);font-size:12px;padding:7px 10px;cursor:pointer;height:34px;">
          <option value="all">All Statuses</option>
          ${MRK.EXAM_STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
      </div>

      <div id="mrk-exams-list"></div>

    </div>
  `;

  const pageContent = _m$('#page-content') || document.body;
  pageContent.appendChild(section);
}


/* =============================================================================
   M6. SECTION SHOW / HIDE / NAV HOOK
   ============================================================================= */

function mrkShow() {
  mrkInjectSection();
  const sec = _m$('#marks-section');
  if (sec) {
    if (Auth.getRole() === 'student') {
      sec.innerHTML = '';
      const user = Auth.getUser();
      sec.insertAdjacentHTML('beforeend', `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2 class="section-title" style="margin-bottom:0;">My Results</h2>
        </div>
        <div style="background:rgba(12,22,38,0.7); border-radius:12px; border:1px solid rgba(139,163,188,0.15); overflow:hidden;">
          <div style="padding:40px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
             <div style="font-size:14px; color:var(--color-slate-400); margin-bottom:12px;">Cumulative GPA</div>
             <div style="font-size:56px; font-weight:700; color:var(--color-success); font-family:var(--font-mono); line-height:1;">
               ${mrkStudentGPA(user._id)}
             </div>
          </div>
          <div style="padding:20px; display:flex; justify-content:center;">
            <button id="btn-view-my-report" style="padding:12px 24px; border-radius:6px; background:var(--color-cyan-600); color:#fff; border:none; font-weight:600; cursor:pointer;">
              View Detailed Report Card
            </button>
          </div>
        </div>
      `);
      _m$('#btn-view-my-report').addEventListener('click', () => mrkOpenReportCard(user._id));
      sec.style.display = '';
    } else {
      sec.style.display = '';
      mrkRenderAll();
    }
  }
}

function mrkHide() {
  const sec = _m$('#marks-section');
  if (sec) sec.style.display = 'none';
}

function mrkHookNav() {
  if (typeof NavModule === 'undefined' || !NavModule.setActive) return;
  const _orig = NavModule.setActive.bind(NavModule);
  NavModule.setActive = function (key) {
    _orig(key);
    key === 'examinations' ? mrkShow() : mrkHide();
  };
}


/* =============================================================================
   M7. KPI CARDS — render
   ============================================================================= */

function mrkRenderKPIs() {
  const exams   = mrkLoadExams();
  const marks   = mrkLoadMarks();
  const completed = exams.filter(e => e.status === 'Completed').length;

  const set = (id, v) => { const el = _m$(`#${id}`); if (el) el.textContent = v; };

  set('mrk-val-exams',     exams.length);
  set('mrk-val-completed', completed);
  set('mrk-val-entries',   marks.length);

  if (marks.length) {
    const avgScore = marks.reduce((a, m) => a + m.pct, 0) / marks.length;
    const avgGrade = mrkComputeGrade(avgScore, 100);

    set('mrk-val-avg', `${avgScore.toFixed(1)}%`);

    const avgGradeEl = _m$('#mrk-avg-grade');
    if (avgGradeEl) {
      avgGradeEl.textContent = avgGrade.grade;
      avgGradeEl.style.color = avgGrade.color;
    }

    // Cross-exam pass rate: a pass = marksObtained >= passingMarks for that exam
    const examMap = {};
    exams.forEach(e => { examMap[e.id] = e; });
    const passCount = marks.filter(m => {
      const e = examMap[m.examId];
      return e && m.marksObtained >= e.passingMarks;
    }).length;
    const failCount = marks.length - passCount;
    const passRate  = Math.round((passCount / marks.length) * 100);

    set('mrk-val-pass', `${passRate}%`);
    set('mrk-val-fail', failCount);

    const passEl = _m$('#mrk-val-pass');
    if (passEl) {
      passEl.style.color = passRate >= 80 ? 'var(--color-success)'
                         : passRate >= 60 ? 'var(--color-warning)'
                         : 'var(--color-danger)';
    }
  }
}


/* =============================================================================
   M8. EXAM SELECTOR & CONTEXT BAR
   ============================================================================= */

function mrkPopulateExamSelect() {
  const select = _m$('#mrk-exam-select');
  if (!select) return;

  const exams = mrkLoadExams().sort((a, b) => b.conductedOn.localeCompare(a.conductedOn));
  select.innerHTML = '<option value="">— Select an Exam —</option>';

  exams.forEach(ex => {
    const opt      = document.createElement('option');
    opt.value      = ex.id;
    opt.textContent = `${ex.code} · ${ex.title} (${ex.department})`;
    if (ex.id === MRK.activeExamId) opt.selected = true;
    select.appendChild(opt);
  });

  _mrkStyleSelect(select);
  select.addEventListener('change', () => {
    MRK.activeExamId = select.value || null;
    MRK.page = 1;
    mrkUpdateContextBar();
    mrkRenderActivePanel();
  });
}

function mrkUpdateContextBar() {
  const ctx = _m$('#mrk-exam-context');
  if (!ctx) return;

  const exam = mrkGetExam(MRK.activeExamId);
  if (!exam) { ctx.style.display = 'none'; return; }

  ctx.style.display = '';
  const set = (id, v) => { const el = _m$(`#${id}`); if (el) el.textContent = v; };

  set('mrk-ctx-title', exam.title);
  set('mrk-ctx-meta',
    `${exam.subject} · ${exam.department} · Semester ${exam.semester} · ${exam.conductedOn ? formatDate(new Date(exam.conductedOn + 'T00:00:00')) : '—'} · Conducted by ${exam.faculty || '—'}`
  );
  set('mrk-ctx-type',  exam.examType);
  set('mrk-ctx-marks-info', `${exam.totalMarks} marks · Pass: ${exam.passingMarks}`);

  const typeEl   = _m$('#mrk-ctx-type');
  const statusEl = _m$('#mrk-ctx-status');
  const thMax    = _m$('#mrk-th-max');

  if (typeEl) {
    typeEl.textContent = exam.examType;
    typeEl.style.background = `${MRK.EXAM_TYPE_COLOR[exam.examType]}18`;
    typeEl.style.color      = MRK.EXAM_TYPE_COLOR[exam.examType] || 'var(--color-info)';
    typeEl.style.border     = `1px solid ${MRK.EXAM_TYPE_COLOR[exam.examType]}30`;
  }
  if (statusEl) {
    statusEl.textContent = exam.status;
    statusEl.className   = `badge ${MRK.EXAM_STATUS_BADGE[exam.status] || 'badge--info'}`;
  }
  if (thMax) thMax.textContent = `(/ ${exam.totalMarks})`;
}


/* =============================================================================
   M9. GRADEBOOK TABLE
   ============================================================================= */

/* ── M9a. Render roster rows ────────────────────────────────────────────────── */

function mrkRenderGradebook() {
  const tbody     = _m$('#mrk-gradebook-tbody');
  const noExam    = _m$('#mrk-gb-no-exam');
  const emptyEl   = _m$('#mrk-gb-empty');
  const footer    = _m$('#mrk-gb-footer');
  const pgBtns    = _m$('#mrk-gb-pg-btns');
  const table     = _m$('#mrk-gradebook-table');
  if (!tbody) return;

  const exam = mrkGetExam(MRK.activeExamId);

  if (!exam) {
    if (table)   table.style.display  = 'none';
    if (noExam)  noExam.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (footer)  footer.style.display  = 'none';
    tbody.innerHTML = '';
    return;
  }

  if (noExam) noExam.style.display = 'none';
  if (table)  table.style.display  = '';

  // Build roster: real enrolled students + any seed entries
  const enrolled  = _mrkEnrolledForDept(exam.department);
  const existing  = mrkLoadMarks().filter(m => m.examId === exam.id);

  // Merge: enrolled students first, then seed entries not matched
  const seenIds   = new Set(enrolled.map(s => s.id));
  const seedRows  = existing.filter(m => !seenIds.has(m.studentId));

  // Full roster rows
  const roster = [
    ...enrolled.map(s => {
      const mark = existing.find(m => m.studentId === s.id);
      return { studentId: s.id, name: s.name, rollNo: s.rollNo, dept: s.department, mark };
    }),
    ...seedRows.map(m => ({
      studentId: m.studentId, name: m.studentName, rollNo: m.rollNo,
      dept: m.department, mark: m,
    })),
  ];

  // Apply search + grade filter
  const { query, grade } = MRK.filter;
  const q = query.toLowerCase();
  let filtered = roster.filter(r => {
    const matchQ = !q || r.name.toLowerCase().includes(q) || r.rollNo.toLowerCase().includes(q);
    const matchG = grade === 'all' || (r.mark && r.mark.grade === grade);
    return matchQ && matchG;
  });

  // Pagination
  const total  = filtered.length;
  const pages  = Math.max(1, Math.ceil(total / MRK.ROWS_PER_PAGE));
  if (MRK.page > pages) MRK.page = 1;
  const start  = (MRK.page - 1) * MRK.ROWS_PER_PAGE;
  const end    = Math.min(start + MRK.ROWS_PER_PAGE, total);
  const page   = filtered.slice(start, end);

  if (!filtered.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (footer)  footer.style.display  = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (footer)  footer.style.display  = 'flex';

  tbody.innerHTML = page.map((row, idx) => {
    const mark   = row.mark;
    const mo     = mark ? mark.marksObtained : '';
    const gr     = mark ? mrkComputeGrade(mark.marksObtained, exam.totalMarks) : null;
    const passed = mark ? mark.marksObtained >= exam.passingMarks : null;
    const rank   = start + idx + 1;

    const gradeColor = gr ? gr.color : 'var(--color-slate-400)';
    const passIcon   = passed === true  ? `<i class="fas fa-circle-check" style="color:var(--color-success);" aria-hidden="true"></i>`
                     : passed === false ? `<i class="fas fa-circle-xmark"  style="color:var(--color-danger);"  aria-hidden="true"></i>`
                     : '';

    return `
      <tr class="mrk-gb-row" data-student-id="${row.studentId}">
        <td style="font-family:var(--font-mono);font-size:11px;color:var(--color-slate-400);">
          ${rank}
        </td>
        <td>
          <div class="table-cell-user">
            <div class="table-avatar"
                 style="background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.18);
                        color:var(--color-cyan-400);" aria-hidden="true">
              ${initials(row.name)}
            </div>
            <div>
              <div class="table-cell-user__name">${_mrkEsc(row.name)}</div>
              <div class="table-cell-user__id">${_mrkEsc(row.dept || '')}</div>
            </div>
          </div>
        </td>
        <td><span class="table-id">${_mrkEsc(row.rollNo)}</span></td>
        <td style="font-size:12px;color:var(--color-slate-300);">${_mrkEsc(row.dept || '')}</td>
        <td style="text-align:center;">
          <input type="number"
                 class="mrk-score-input"
                 data-student-id="${row.studentId}"
                 data-orig="${mo}"
                 value="${mo}"
                 min="0" max="${exam.totalMarks}"
                 aria-label="Score for ${_mrkEsc(row.name)}"
                 placeholder="—"
                 style="width:64px;padding:5px 8px;text-align:center;
                        font-family:var(--font-mono);font-size:13px;font-weight:600;
                        background:rgba(255,255,255,0.05);
                        border:1px solid rgba(139,163,188,0.18);
                        border-radius:var(--radius-sm);
                        color:var(--color-white);outline:none;
                        transition:border-color .15s,box-shadow .15s;" />
        </td>
        <td style="text-align:center;font-family:var(--font-mono);font-size:12px;
                   color:${gr ? gradeColor : 'var(--color-slate-400)'};"
            class="mrk-pct-cell">
          ${gr ? gr.pct + '%' : '—'}
        </td>
        <td style="text-align:center;">
          <span class="mrk-grade-badge"
                style="display:inline-flex;align-items:center;justify-content:center;
                       width:28px;height:28px;border-radius:50%;
                       background:${gr ? gr.color + '18' : 'rgba(139,163,188,0.08)'};
                       border:1.5px solid ${gr ? gr.color + '50' : 'rgba(139,163,188,0.18)'};
                       font-family:var(--font-mono);font-size:12px;font-weight:700;
                       color:${gr ? gr.color : 'var(--color-slate-400)'};">
            ${gr ? gr.grade : '—'}
          </span>
        </td>
        <td style="text-align:center;font-family:var(--font-mono);font-size:13px;font-weight:600;"
            class="mrk-gp-cell">
          <span style="color:${gr ? gradeColor : 'var(--color-slate-400)'};">
            ${gr ? gr.gradePoint.toFixed(1) : '—'}
          </span>
        </td>
        <td>
          <input type="text"
                 class="mrk-remark-input"
                 data-student-id="${row.studentId}"
                 value="${_mrkEsc(mark ? mark.remarks || '' : '')}"
                 placeholder="Note…"
                 maxlength="100"
                 aria-label="Remark for ${_mrkEsc(row.name)}"
                 style="width:120px;padding:5px 8px;font-family:var(--font-ui);
                        font-size:11.5px;background:rgba(255,255,255,0.04);
                        border:1px solid rgba(139,163,188,0.14);
                        border-radius:var(--radius-sm);color:var(--color-white-soft);
                        outline:none;transition:border-color .15s;" />
        </td>
        <td>
          <div style="display:flex;gap:4px;align-items:center;">
            ${passIcon ? `<span style="font-size:13px;" title="${passed ? 'Passed' : 'Failed'}">${passIcon}</span>` : ''}
            <button class="mrk-btn-report card-action-btn" data-student-id="${row.studentId}"
                    title="View report card" aria-label="Report card for ${_mrkEsc(row.name)}">
              <i class="fas fa-id-card" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Wire score inputs for live grade preview
  _m$$('.mrk-score-input', tbody).forEach(inp => {
    inp.addEventListener('input',  () => _mrkLiveGradeRow(inp, exam));
    inp.addEventListener('focus',  () => {
      inp.style.borderColor = 'rgba(0,212,255,0.40)';
      inp.style.boxShadow   = '0 0 0 3px rgba(0,212,255,0.10)';
      inp.style.background  = 'rgba(0,212,255,0.06)';
    });
    inp.addEventListener('blur', () => {
      inp.style.borderColor = 'rgba(139,163,188,0.18)';
      inp.style.boxShadow   = 'none';
      inp.style.background  = 'rgba(255,255,255,0.05)';
    });
  });

  // Wire remark inputs
  _m$$('.mrk-remark-input', tbody).forEach(inp => {
    inp.addEventListener('focus', () => {
      inp.style.borderColor = 'rgba(0,212,255,0.30)';
      inp.style.background  = 'rgba(0,212,255,0.04)';
    });
    inp.addEventListener('blur', () => {
      inp.style.borderColor = 'rgba(139,163,188,0.14)';
      inp.style.background  = 'rgba(255,255,255,0.04)';
    });
  });

  // Report card buttons
  _m$$('.mrk-btn-report', tbody).forEach(btn => {
    btn.addEventListener('click', () => mrkOpenReportCard(btn.dataset.studentId));
  });

  // Row hover
  _m$$('.mrk-gb-row', tbody).forEach(row => {
    row.addEventListener('mouseenter', () => row.style.background = 'rgba(255,255,255,0.025)');
    row.addEventListener('mouseleave', () => row.style.background = '');
  });

  // Live footer stats
  _mrkUpdateLiveStats(exam);

  // Pagination
  _mrkRenderGBPagination(pgBtns, pages, total, start, end);
}

/* ── M9b. Inline live-grade preview ────────────────────────────────────────── */

function _mrkLiveGradeRow(inp, exam) {
  const raw  = parseFloat(inp.value);
  const row  = inp.closest('tr');
  if (!row) return;

  const pctCell   = row.querySelector('.mrk-pct-cell');
  const gradeBadge = row.querySelector('.mrk-grade-badge');
  const gpCell    = row.querySelector('.mrk-gp-cell span');

  if (isNaN(raw) || inp.value.trim() === '') {
    if (pctCell)   pctCell.textContent   = '—';
    if (gradeBadge) {
      gradeBadge.textContent = '—';
      gradeBadge.style.background = 'rgba(139,163,188,0.08)';
      gradeBadge.style.borderColor = 'rgba(139,163,188,0.18)';
      gradeBadge.style.color = 'var(--color-slate-400)';
    }
    if (gpCell)    gpCell.textContent     = '—';
    return;
  }

  const clamped = Math.min(exam.totalMarks, Math.max(0, raw));
  const g       = mrkComputeGrade(clamped, exam.totalMarks);

  if (pctCell)   pctCell.textContent    = `${g.pct}%`;
  if (pctCell)   pctCell.style.color    = g.color;
  if (gradeBadge) {
    gradeBadge.textContent          = g.grade;
    gradeBadge.style.background     = `${g.color}18`;
    gradeBadge.style.borderColor    = `${g.color}50`;
    gradeBadge.style.color          = g.color;
  }
  if (gpCell) {
    gpCell.textContent = g.gradePoint.toFixed(1);
    gpCell.style.color = g.color;
  }

  // Colour the input based on pass/fail
  inp.style.color = clamped >= exam.passingMarks ? 'var(--color-success)' : 'var(--color-danger)';

  // Update footer live stats
  _mrkUpdateLiveStats(exam);
}

/* ── M9c. Live footer stats ─────────────────────────────────────────────────── */

function _mrkUpdateLiveStats(exam) {
  const inputs  = _m$$('.mrk-score-input');
  const scores  = inputs
    .map(inp => parseFloat(inp.value))
    .filter(v => !isNaN(v));

  if (!scores.length) return;

  const avg     = scores.reduce((a, b) => a + b, 0) / scores.length;
  const highest = Math.max(...scores);
  const lowest  = Math.min(...scores);
  const passCount = exam ? scores.filter(s => s >= exam.passingMarks).length : 0;
  const passRate  = Math.round((passCount / scores.length) * 100);

  const set = (id, v) => { const el = _m$(`#${id}`); if (el) el.textContent = v; };
  set('mrk-live-avg',     `Avg: ${avg.toFixed(1)}`);
  set('mrk-live-highest', `High: ${highest}`);
  set('mrk-live-lowest',  `Low: ${lowest}`);
  set('mrk-live-pass',    `Pass: ${passRate}%`);
}

/* ── M9d. Bulk save all rows ────────────────────────────────────────────────── */

function mrkBulkSave() {
  const exam = mrkGetExam(MRK.activeExamId);
  if (!exam) { Toast.show('Select an exam first', 'warning'); return; }

  const tbody   = _m$('#mrk-gradebook-tbody');
  if (!tbody)   return;

  const rows    = _m$$('.mrk-gb-row', tbody);
  let saved = 0, skipped = 0;

  rows.forEach(row => {
    const sid    = row.dataset.studentId;
    const inp    = row.querySelector('.mrk-score-input');
    const remark = row.querySelector('.mrk-remark-input');
    if (!inp || inp.value.trim() === '') { skipped++; return; }

    const score = parseFloat(inp.value);
    if (isNaN(score)) { skipped++; return; }

    mrkUpsertMark(exam.id, sid, Math.min(exam.totalMarks, Math.max(0, score)),
                  remark ? remark.value : '');
    saved++;
  });

  // Refresh KPIs + live stats
  mrkRenderKPIs();
  _mrkUpdateLiveStats(exam);

  Toast.show(
    `Saved ${saved} mark${saved !== 1 ? 's' : ''}${skipped ? ` (${skipped} blank skipped)` : ''}`,
    saved > 0 ? 'success' : 'warning'
  );
  if (saved > 0) {
    logActivity(`Marks saved for <strong>${exam.title}</strong> — ${saved} entries`, 'success');
  }
}

/* ── Gradebook pagination ───────────────────────────────────────────────────── */

function _mrkRenderGBPagination(container, totalPages, total, start, end) {
  if (!container) return;
  const pgInfo = _m$('#mrk-gb-pg-info');
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const bs = (active) => `
    min-width:28px;height:28px;border-radius:var(--radius-sm);
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:600;cursor:pointer;padding:0 5px;
    font-family:var(--font-mono);
    border:1px solid ${active ? 'rgba(0,212,255,0.35)' : 'rgba(139,163,188,0.18)'};
    background:${active ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)'};
    color:${active ? 'var(--color-cyan-400)' : 'var(--color-slate-300)'};
    transition:background .12s;
  `;

  const prev = document.createElement('button');
  prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
  prev.style.cssText = bs(false); prev.disabled = MRK.page === 1;
  if (MRK.page > 1) prev.addEventListener('click', () => { MRK.page--; mrkRenderGradebook(); });
  container.appendChild(prev);

  const maxP = 5;
  let s = Math.max(1, MRK.page - 2);
  let e = Math.min(totalPages, s + maxP - 1);
  s = Math.max(1, e - maxP + 1);
  for (let p = s; p <= e; p++) {
    const pb = document.createElement('button');
    pb.textContent = String(p);
    pb.style.cssText = bs(p === MRK.page);
    if (p !== MRK.page) pb.addEventListener('click', () => { MRK.page = p; mrkRenderGradebook(); });
    container.appendChild(pb);
  }

  const next = document.createElement('button');
  next.innerHTML = '<i class="fas fa-chevron-right"></i>';
  next.style.cssText = bs(false); next.disabled = MRK.page === totalPages;
  if (MRK.page < totalPages) next.addEventListener('click', () => { MRK.page++; mrkRenderGradebook(); });
  container.appendChild(next);
}


/* =============================================================================
   M10. CLASS ANALYTICS PANEL
   ============================================================================= */

function mrkRenderAnalytics() {
  const container = _m$('#mrk-analytics-content');
  if (!container) return;

  const exam  = mrkGetExam(MRK.activeExamId);
  const stats = exam ? mrkExamStats(exam.id) : null;

  if (!exam || !stats) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 24px;color:var(--color-slate-400);">
        <i class="fas fa-chart-bar" style="font-size:36px;margin-bottom:14px;display:block;opacity:.25;" aria-hidden="true"></i>
        <p style="font-size:14px;color:var(--color-white-soft);font-weight:600;">
          ${!exam ? 'Select an exam to view analytics' : 'No marks entered for this exam yet'}
        </p>
      </div>`;
    return;
  }

  const avgGrade = mrkComputeGrade(stats.avg, exam.totalMarks);

  container.innerHTML = `
    <!-- Stats strip -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px;">
      ${[
        { label:'Class Average', val: `${stats.avg} / ${exam.totalMarks}`, sub: `${avgGrade.pct}% · Grade ${avgGrade.grade}`, color: avgGrade.color },
        { label:'Highest Score', val: stats.highest, sub: `${mrkComputeGrade(stats.highest, exam.totalMarks).pct}%`, color: '#22D3A3' },
        { label:'Lowest Score',  val: stats.lowest,  sub: `${mrkComputeGrade(stats.lowest,  exam.totalMarks).pct}%`, color: '#F25F5C' },
        { label:'Pass Rate',     val: `${stats.passRate}%`, sub: `${stats.passCount} passed · ${stats.failCount} failed`, color: stats.passRate >= 75 ? '#22D3A3' : '#F5A524' },
      ].map(s => `
        <div class="stat-card" style="cursor:default;">
          <div class="stat-card__label">${s.label}</div>
          <div class="stat-card__value" style="font-size:24px;color:${s.color};">${s.val}</div>
          <div class="stat-card__footer" style="color:var(--color-slate-400);font-size:11px;">${s.sub}</div>
        </div>
      `).join('')}
    </div>

    <!-- Charts row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">

      <!-- Grade Distribution Bar Chart -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Grade Distribution</div>
          <div class="card-subtitle">Students by grade band · Total: ${stats.total}</div>
        </div>
        <div class="card-body" style="padding:16px 22px 20px;">
          ${_mrkGradeDistChart(stats.distribution, stats.total)}
        </div>
      </div>

      <!-- Score Histogram -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Score Distribution</div>
          <div class="card-subtitle">Marks obtained histogram · ${exam.totalMarks} max</div>
        </div>
        <div class="card-body" style="padding:16px 22px 20px;">
          ${_mrkScoreHistogram(exam)}
        </div>
      </div>

    </div>
  `;
}

function _mrkGradeDistChart(distribution, total) {
  if (!distribution.length) return '<p style="color:var(--color-slate-400);font-size:13px;">No data</p>';

  const maxCount = Math.max(...distribution.map(d => d.count));

  const bars = distribution.map(d => {
    const barW = maxCount ? Math.round((d.count / maxCount) * 100) : 0;
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-family:var(--font-mono);font-size:11px;font-weight:700;
                     color:${d.color};width:16px;text-align:center;flex-shrink:0;">
          ${d.grade}
        </span>
        <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:99px;height:18px;overflow:hidden;">
          <div style="width:${barW}%;height:100%;background:${d.color};border-radius:99px;
                      transition:width .8s ease;
                      box-shadow:0 0 8px ${d.color}50;
                      display:flex;align-items:center;justify-content:flex-end;padding-right:7px;">
            ${barW > 20 ? `<span style="font-size:10px;font-weight:700;color:rgba(0,0,0,0.7);">${d.count}</span>` : ''}
          </div>
        </div>
        <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;
                     color:var(--color-slate-300);width:24px;text-align:right;flex-shrink:0;">
          ${d.count}
        </span>
        <span style="font-size:10px;color:var(--color-slate-400);width:30px;text-align:right;flex-shrink:0;">
          ${Math.round((d.count / total) * 100)}%
        </span>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-bottom:6px;">
      ${bars}
    </div>
    <div style="display:flex;justify-content:space-between;
                font-size:10px;color:var(--color-slate-400);margin-top:8px;">
      ${MRK.GRADE_SCALE.map(g => `
        <div style="display:flex;align-items:center;gap:3px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${g.color};display:inline-block;"></span>
          <span>${g.label}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function _mrkScoreHistogram(exam) {
  const marks    = mrkLoadMarks().filter(m => m.examId === exam.id);
  if (!marks.length) return '<p style="color:var(--color-slate-400);font-size:13px;">No data</p>';

  // 10 equally-spaced buckets
  const buckets  = 10;
  const step     = exam.totalMarks / buckets;
  const counts   = Array(buckets).fill(0);

  marks.forEach(m => {
    const idx = Math.min(buckets - 1, Math.floor(m.marksObtained / step));
    counts[idx]++;
  });

  const maxC = Math.max(...counts, 1);
  const W = 340, H = 100, padL = 28, padR = 8, padT = 8, padB = 22;
  const barW = Math.floor((W - padL - padR) / buckets) - 2;

  const bars = counts.map((c, i) => {
    const barH   = ((c / maxC) * (H - padT - padB));
    const x      = padL + i * ((W - padL - padR) / buckets);
    const y      = H - padB - barH;
    const pct    = ((i * step) / exam.totalMarks) * 100;
    const color  = pct >= (exam.passingMarks / exam.totalMarks * 100) ? '#22D3A3' : '#F25F5C';
    const label  = `${Math.round(i * step)}–${Math.round((i + 1) * step)}`;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}"
            rx="2" fill="${color}" fill-opacity="0.75"
            style="transition:height .6s ease, y .6s ease;">
        <title>${label}: ${c} student${c !== 1 ? 's' : ''}</title>
      </rect>
      <text x="${x + barW / 2}" y="${H - padB + 11}"
            font-family="DM Mono, monospace" font-size="7"
            fill="#8BA3BC" text-anchor="middle">
        ${Math.round(i * step)}
      </text>
    `;
  }).join('');

  // Y-axis labels
  const yLabels = [0, Math.ceil(maxC / 2), maxC].map(v => {
    const y = H - padB - ((v / maxC) * (H - padT - padB));
    return `<text x="${padL - 4}" y="${y + 3}" font-family="DM Mono,monospace" font-size="7" fill="#8BA3BC" text-anchor="end">${v}</text>`;
  }).join('');

  // Passing mark line
  const passX = padL + (exam.passingMarks / exam.totalMarks) * (W - padL - padR);
  const passLine = `
    <line x1="${passX}" y1="${padT}" x2="${passX}" y2="${H - padB}"
          stroke="rgba(242,95,92,0.50)" stroke-width="1.5" stroke-dasharray="3 3"/>
    <text x="${passX + 3}" y="${padT + 8}"
          font-family="DM Mono,monospace" font-size="7" fill="#F25F5C">
      Pass (${exam.passingMarks})
    </text>
  `;

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
         role="img" aria-label="Score histogram"
         style="width:100%;height:auto;display:block;">
      ${yLabels}
      ${bars}
      ${passLine}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}"
            stroke="rgba(139,163,188,0.15)" stroke-width="1"/>
      <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}"
            stroke="rgba(139,163,188,0.15)" stroke-width="1"/>
    </svg>
  `;
}


/* =============================================================================
   M11. RANK / LEADERBOARD TABLE
   ============================================================================= */

function mrkRenderRanks() {
  const container = _m$('#mrk-ranks-content');
  if (!container) return;

  const exam  = mrkGetExam(MRK.activeExamId);
  const marks = exam ? mrkLoadMarks().filter(m => m.examId === exam.id) : [];

  if (!exam) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 24px;color:var(--color-slate-400);">
        <i class="fas fa-trophy" style="font-size:36px;margin-bottom:14px;display:block;opacity:.25;" aria-hidden="true"></i>
        <p style="font-size:14px;color:var(--color-white-soft);font-weight:600;">Select an exam to view rankings</p>
      </div>`;
    return;
  }

  if (!marks.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px 24px;color:var(--color-slate-400);">
        <i class="fas fa-list-ol" style="font-size:32px;margin-bottom:12px;display:block;opacity:.28;" aria-hidden="true"></i>
        <p style="font-size:13px;font-weight:600;color:var(--color-white-soft);">No marks entered for this exam</p>
      </div>`;
    return;
  }

  // Sort descending by score
  const sorted = [...marks].sort((a, b) => b.marksObtained - a.marksObtained);

  const topIcon = (rank) => {
    if (rank === 1) return `<i class="fas fa-crown" style="color:#FFD700;" aria-label="1st place"></i>`;
    if (rank === 2) return `<i class="fas fa-medal" style="color:#C0C0C0;" aria-label="2nd place"></i>`;
    if (rank === 3) return `<i class="fas fa-medal" style="color:#CD7F32;" aria-label="3rd place"></i>`;
    return `<span style="font-family:var(--font-mono);font-size:12px;color:var(--color-slate-400);">${rank}</span>`;
  };

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-title">Class Rankings</div>
          <div class="card-subtitle">${exam.title} · ${sorted.length} students ranked</div>
        </div>
        <span style="font-family:var(--font-mono);font-size:12px;color:var(--color-slate-400);">
          Top score: ${sorted[0]?.marksObtained ?? '—'} / ${exam.totalMarks}
        </span>
      </div>
      <div class="card-body card-body--flush" style="overflow-x:auto;">
        <table class="data-table" aria-label="Class rankings">
          <thead>
            <tr>
              <th scope="col" style="width:48px;">Rank</th>
              <th scope="col">Student</th>
              <th scope="col">Roll No</th>
              <th scope="col" style="text-align:center;">Score</th>
              <th scope="col" style="text-align:center;">%</th>
              <th scope="col" style="text-align:center;">Grade</th>
              <th scope="col" style="text-align:center;">Grade Point</th>
              <th scope="col" style="text-align:center;">Result</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((m, idx) => {
              const rank   = idx + 1;
              const gr     = mrkComputeGrade(m.marksObtained, exam.totalMarks);
              const passed = m.marksObtained >= exam.passingMarks;
              const rowBg  = rank <= 3 ? `background:rgba(${rank === 1 ? '255,215,0' : rank === 2 ? '192,192,192' : '205,127,50'},0.04);` : '';

              return `
                <tr style="${rowBg}transition:background .12s;"
                    onmouseenter="this.style.background='rgba(255,255,255,0.025)'"
                    onmouseleave="this.style.background='${rank <= 3 ? `rgba(${rank===1?'255,215,0':rank===2?'192,192,192':'205,127,50'},0.04)` : ''}'">
                  <td style="text-align:center;padding:10px 12px;">${topIcon(rank)}</td>
                  <td>
                    <div class="table-cell-user">
                      <div class="table-avatar"
                           style="background:${gr.color}16;border:1px solid ${gr.color}36;
                                  color:${gr.color};" aria-hidden="true">
                        ${initials(m.studentName)}
                      </div>
                      <div>
                        <div class="table-cell-user__name">${_mrkEsc(m.studentName)}</div>
                        <div class="table-cell-user__id">${_mrkEsc(m.department || '')}</div>
                      </div>
                    </div>
                  </td>
                  <td><span class="table-id">${_mrkEsc(m.rollNo)}</span></td>
                  <td style="text-align:center;font-family:var(--font-mono);font-size:14px;
                             font-weight:700;color:${gr.color};">
                    ${m.marksObtained}
                  </td>
                  <td style="text-align:center;font-family:var(--font-mono);font-size:12px;
                             color:${gr.color};">
                    ${gr.pct}%
                  </td>
                  <td style="text-align:center;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;
                                 width:28px;height:28px;border-radius:50%;
                                 background:${gr.color}18;border:1.5px solid ${gr.color}50;
                                 font-family:var(--font-mono);font-size:12px;font-weight:700;
                                 color:${gr.color};">
                      ${gr.grade}
                    </span>
                  </td>
                  <td style="text-align:center;font-family:var(--font-mono);font-size:13px;
                             font-weight:600;color:${gr.color};">
                    ${gr.gradePoint.toFixed(1)}
                  </td>
                  <td style="text-align:center;">
                    <span class="badge ${passed ? 'badge--success' : 'badge--danger'}">
                      ${passed ? 'Pass' : 'Fail'}
                    </span>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}


/* =============================================================================
   M12. STUDENT REPORT CARD MODAL
   ============================================================================= */

function mrkOpenReportCard(studentId) {
  const allMarks = mrkLoadMarks().filter(m => m.studentId === studentId);
  const allExams = mrkLoadExams();

  // Pull student info from cms_students, fall back to mark data
  const stuRecord = _mrkLoadStudents().find(s => s.id === studentId);
  const firstName = allMarks[0];

  const stuName = stuRecord?.name   || firstName?.studentName || 'Unknown Student';
  const rollNo  = stuRecord?.rollNo || firstName?.rollNo      || '—';
  const dept    = stuRecord?.department || firstName?.department || '—';
  const sem     = stuRecord?.semester   || firstName?.semester   || '—';

  const gpa     = mrkStudentGPA(studentId);

  const tableRows = allMarks.map(m => {
    const ex  = allExams.find(e => e.id === m.examId);
    const gr  = mrkComputeGrade(m.marksObtained, ex?.totalMarks || 100);
    return `
      <tr>
        <td style="padding:8px 14px;font-size:12.5px;color:var(--color-white-soft);">
          ${_mrkEsc(ex?.title || m.examId)}
        </td>
        <td style="padding:8px 14px;font-size:12px;color:var(--color-slate-400);">
          ${_mrkEsc(ex?.examType || '—')}
        </td>
        <td style="padding:8px 14px;font-size:12px;color:var(--color-slate-400);white-space:nowrap;">
          ${ex?.conductedOn ? formatDate(new Date(ex.conductedOn + 'T00:00:00')) : '—'}
        </td>
        <td style="padding:8px 14px;text-align:center;font-family:var(--font-mono);
                   font-size:13px;font-weight:700;color:${gr.color};">
          ${m.marksObtained} / ${ex?.totalMarks ?? '—'}
        </td>
        <td style="padding:8px 14px;text-align:center;font-family:var(--font-mono);
                   font-size:12px;color:${gr.color};">
          ${gr.pct}%
        </td>
        <td style="padding:8px 14px;text-align:center;">
          <span style="display:inline-flex;align-items:center;justify-content:center;
                       width:26px;height:26px;border-radius:50%;
                       background:${gr.color}18;border:1.5px solid ${gr.color}50;
                       font-family:var(--font-mono);font-size:11px;font-weight:700;
                       color:${gr.color};">
            ${gr.grade}
          </span>
        </td>
        <td style="padding:8px 14px;text-align:center;font-family:var(--font-mono);
                   font-size:12px;font-weight:600;color:${gr.color};">
          ${gr.gradePoint.toFixed(1)}
        </td>
        <td style="padding:8px 14px;text-align:center;">
          <span class="badge ${m.marksObtained >= (ex?.passingMarks || 40) ? 'badge--success' : 'badge--danger'}">
            ${m.marksObtained >= (ex?.passingMarks || 40) ? 'Pass' : 'Fail'}
          </span>
        </td>
        <td style="padding:8px 14px;font-size:11px;color:var(--color-slate-400);">
          ${_mrkEsc(m.remarks || '—')}
        </td>
      </tr>
    `;
  }).join('');

  const gpaColor = gpa === null ? 'var(--color-slate-400)'
                 : gpa >= 8    ? 'var(--color-success)'
                 : gpa >= 6    ? 'var(--color-warning)'
                 : 'var(--color-danger)';

  const modal = Modal.create({
    id:    'modal-report-card',
    title: 'Student Report Card',
    size:  'xl',
    bodyHTML: `
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:22px;
                  padding:16px 18px;border-radius:var(--radius-lg);
                  background:linear-gradient(135deg,rgba(0,212,255,0.06),rgba(255,255,255,0.02));
                  border:1px solid rgba(0,212,255,0.14);">
        <div style="width:52px;height:52px;border-radius:50%;flex-shrink:0;
                    background:linear-gradient(135deg,rgba(0,212,255,0.24),rgba(42,78,127,0.50));
                    border:2px solid rgba(0,212,255,0.35);
                    display:flex;align-items:center;justify-content:center;
                    font-size:17px;font-weight:700;color:var(--color-cyan-400);">
          ${initials(stuName)}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:17px;font-weight:700;color:#fff;">${_mrkEsc(stuName)}</div>
          <div style="font-size:12px;color:var(--color-slate-400);margin-top:3px;">
            ${_mrkEsc(rollNo)} · ${_mrkEsc(dept)} · Semester ${_mrkEsc(String(sem))}
          </div>
        </div>
        <div style="text-align:center;flex-shrink:0;">
          <div style="font-family:var(--font-mono);font-size:26px;font-weight:700;
                      color:${gpaColor};line-height:1;">
            ${gpa !== null ? gpa.toFixed(2) : '—'}
          </div>
          <div style="font-size:10px;color:var(--color-slate-400);
                      text-transform:uppercase;letter-spacing:0.07em;margin-top:3px;">GPA</div>
        </div>
      </div>

      <!-- Summary chips -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;">
        ${[
          ['Exams Taken', allMarks.length, 'var(--color-cyan-400)'],
          ['Passed', allMarks.filter(m => {
            const e = allExams.find(x => x.id === m.examId);
            return e && m.marksObtained >= e.passingMarks;
          }).length, 'var(--color-success)'],
          ['Failed', allMarks.filter(m => {
            const e = allExams.find(x => x.id === m.examId);
            return e && m.marksObtained < e.passingMarks;
          }).length, 'var(--color-danger)'],
          ['Avg %', allMarks.length ? `${(allMarks.reduce((a,m) => a + m.pct, 0) / allMarks.length).toFixed(1)}%` : '—', 'var(--color-info)'],
        ].map(([label, val, color]) => `
          <div style="padding:10px 16px;border-radius:var(--radius-md);
                      background:${color}10;border:1px solid ${color}25;
                      text-align:center;min-width:90px;">
            <div style="font-family:var(--font-mono);font-size:18px;font-weight:600;
                        color:${color};line-height:1;">${val}</div>
            <div style="font-size:10px;color:var(--color-slate-400);
                        text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">
              ${label}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Marks table -->
      ${allMarks.length ? `
        <div style="overflow-x:auto;border:1px solid var(--color-border);
                    border-radius:var(--radius-sm);max-height:340px;overflow-y:auto;">
          <table style="width:100%;border-collapse:collapse;min-width:600px;">
            <thead style="position:sticky;top:0;background:rgba(12,22,38,0.98);">
              <tr style="border-bottom:1px solid rgba(139,163,188,0.12);">
                ${['Exam','Type','Date','Score','%','Grade','GP','Result','Remarks']
                  .map(h => `<th style="padding:7px 14px;text-align:${['Score','%','Grade','GP','Result'].includes(h)?'center':'left'};
                                        font-size:10px;letter-spacing:0.08em;text-transform:uppercase;
                                        color:var(--color-slate-400);white-space:nowrap;">${h}</th>`)
                  .join('')}
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      ` : `
        <div style="text-align:center;padding:24px;color:var(--color-slate-400);">
          No exam records found for this student.
        </div>
      `}
    `,
    footerHTML: `
      <button id="btn-rc-export" style="
        display:flex;align-items:center;gap:7px;
        padding:9px 18px;border-radius:var(--radius-sm);
        border:1px solid rgba(139,163,188,0.22);
        background:rgba(255,255,255,0.04);
        color:var(--color-slate-300);
        font-family:var(--font-ui);font-size:13px;font-weight:600;cursor:pointer;">
        <i class="fas fa-file-csv" aria-hidden="true"></i> Export CSV
      </button>
      <button id="btn-rc-close" style="
        padding:9px 20px;border-radius:var(--radius-sm);
        border:1px solid rgba(139,163,188,0.22);
        background:rgba(255,255,255,0.04);
        color:var(--color-slate-300);
        font-family:var(--font-ui);font-size:13px;font-weight:600;cursor:pointer;">
        Close
      </button>
    `,
  });

  modal.open();

  modal.footer().querySelector('#btn-rc-close').addEventListener('click', () => modal.close());
  modal.footer().querySelector('#btn-rc-export').addEventListener('click', () => {
    mrkExportStudentCSV(studentId, stuName, allMarks, allExams);
    Toast.show(`Report card for <strong>${_mrkEsc(stuName)}</strong> exported`, 'success');
  });
}


/* =============================================================================
   M13. EXAM MANAGEMENT
   ============================================================================= */

/* ── M13a. Exam list card ───────────────────────────────────────────────────── */

function mrkRenderExamList() {
  const container = _m$('#mrk-exams-list');
  if (!container) return;

  const { dept, type, status } = MRK.examFilter;
  let exams = mrkLoadExams();
  if (dept   !== 'all') exams = exams.filter(e => e.department === dept);
  if (type   !== 'all') exams = exams.filter(e => e.examType   === type);
  if (status !== 'all') exams = exams.filter(e => e.status     === status);
  exams.sort((a, b) => b.conductedOn.localeCompare(a.conductedOn));

  if (!exams.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:56px 24px;color:var(--color-slate-400);">
        <i class="fas fa-file-pen" style="font-size:36px;margin-bottom:14px;display:block;opacity:.25;" aria-hidden="true"></i>
        <p style="font-size:15px;font-weight:600;color:var(--color-white-soft);margin-bottom:6px;">No exams found</p>
        <p style="font-size:13px;">Try adjusting filters or add a new exam.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-body card-body--flush" style="overflow-x:auto;">
        <table class="data-table" aria-label="Exam list">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Exam Title</th>
              <th scope="col">Department</th>
              <th scope="col">Type</th>
              <th scope="col">Sem</th>
              <th scope="col" style="text-align:center;">Total Marks</th>
              <th scope="col" style="text-align:center;">Pass Marks</th>
              <th scope="col">Date</th>
              <th scope="col">Faculty</th>
              <th scope="col" style="text-align:center;">Entries</th>
              <th scope="col" style="text-align:center;">Status</th>
              <th scope="col" aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            ${exams.map(ex => {
              const entryCount = mrkLoadMarks().filter(m => m.examId === ex.id).length;
              const typeColor  = MRK.EXAM_TYPE_COLOR[ex.examType] || 'var(--color-slate-400)';
              return `
                <tr class="mrk-exam-row" data-exam-id="${ex.id}"
                    style="transition:background .12s;cursor:default;">
                  <td><span class="table-id">${_mrkEsc(ex.code)}</span></td>
                  <td style="font-weight:600;color:var(--color-white);font-size:13px;">
                    ${_mrkEsc(ex.title)}
                  </td>
                  <td style="font-size:12px;color:var(--color-slate-300);">
                    ${_mrkEsc(ex.department)}
                  </td>
                  <td>
                    <span style="font-size:11px;font-weight:700;
                                 padding:2px 8px;border-radius:99px;
                                 background:${typeColor}14;
                                 border:1px solid ${typeColor}30;
                                 color:${typeColor};">
                      ${_mrkEsc(ex.examType)}
                    </span>
                  </td>
                  <td style="text-align:center;font-family:var(--font-mono);font-size:12px;">
                    ${ex.semester}
                  </td>
                  <td style="text-align:center;font-family:var(--font-mono);font-size:13px;
                             font-weight:600;color:var(--color-white);">
                    ${ex.totalMarks}
                  </td>
                  <td style="text-align:center;font-family:var(--font-mono);font-size:12px;
                             color:var(--color-slate-400);">
                    ${ex.passingMarks}
                  </td>
                  <td style="font-size:12px;color:var(--color-slate-400);white-space:nowrap;">
                    ${ex.conductedOn ? formatDate(new Date(ex.conductedOn + 'T00:00:00')) : '—'}
                  </td>
                  <td style="font-size:12px;color:var(--color-slate-300);">
                    ${_mrkEsc(ex.faculty || '—')}
                  </td>
                  <td style="text-align:center;">
                    <span style="font-family:var(--font-mono);font-size:12px;font-weight:600;
                                 color:${entryCount > 0 ? 'var(--color-success)' : 'var(--color-slate-400)'};">
                      ${entryCount}
                    </span>
                  </td>
                  <td style="text-align:center;">
                    <span class="badge ${MRK.EXAM_STATUS_BADGE[ex.status] || 'badge--info'}">
                      ${_mrkEsc(ex.status)}
                    </span>
                  </td>
                  <td>
                    <div style="display:flex;gap:4px;align-items:center;">
                      <button class="mrk-btn-open-gb card-action-btn" data-id="${ex.id}"
                              title="Open gradebook" aria-label="Open gradebook for ${_mrkEsc(ex.title)}">
                        <i class="fas fa-table-cells" aria-hidden="true"></i>
                      </button>
                      <button class="mrk-btn-edit-exam card-action-btn" data-id="${ex.id}"
                              title="Edit exam" aria-label="Edit ${_mrkEsc(ex.title)}">
                        <i class="fas fa-pen" aria-hidden="true"></i>
                      </button>
                      <button class="mrk-btn-del-exam" data-id="${ex.id}"
                              title="Delete exam" aria-label="Delete ${_mrkEsc(ex.title)}"
                              style="display:flex;align-items:center;justify-content:center;
                                     width:28px;height:28px;border-radius:var(--radius-sm);
                                     background:rgba(242,95,92,0.08);
                                     border:1px solid rgba(242,95,92,0.18);
                                     color:var(--color-danger);font-size:11px;cursor:pointer;
                                     transition:background .15s;">
                        <i class="fas fa-trash-can" aria-hidden="true"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Wire buttons
  _m$$('.mrk-btn-open-gb', container).forEach(btn => {
    btn.addEventListener('click', () => {
      MRK.activeExamId = btn.dataset.id;
      _m$$('.mrk-tab').forEach(t => {
        const isGB = t.dataset.tab === 'gradebook';
        t.style.background = isGB ? 'rgba(0,212,255,0.12)' : 'transparent';
        t.style.color      = isGB ? 'var(--color-cyan-400)' : 'var(--color-slate-400)';
        t.setAttribute('aria-selected', isGB);
      });
      MRK.activeTab = 'gradebook';
      const sel = _m$('#mrk-exam-select');
      if (sel) sel.value = MRK.activeExamId;
      mrkRenderActivePanel();
      mrkUpdateContextBar();
    });
  });

  _m$$('.mrk-btn-edit-exam', container).forEach(btn => {
    btn.addEventListener('click', () => mrkOpenEditExamModal(btn.dataset.id));
  });
  _m$$('.mrk-btn-del-exam', container).forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(242,95,92,0.20)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(242,95,92,0.08)');
    btn.addEventListener('click', () => {
      const ex = mrkGetExam(btn.dataset.id);
      mrkOpenDeleteExamModal(btn.dataset.id, ex?.title || 'this exam');
    });
  });
  _m$$('.mrk-exam-row', container).forEach(row => {
    row.addEventListener('mouseenter', () => row.style.background = 'rgba(255,255,255,0.025)');
    row.addEventListener('mouseleave', () => row.style.background = '');
  });
}

/* ── M13b. Add Exam Modal ───────────────────────────────────────────────────── */

function mrkOpenAddExamModal() {
  const modal = Modal.create({
    id:         'modal-add-exam',
    title:      'Create New Exam',
    size:       'lg',
    bodyHTML:   _mrkBuildExamForm(null),
    footerHTML: `
      <button id="btn-ex-cancel" style="${_mrkBtnStyle('ghost')}">Cancel</button>
      <button id="btn-ex-save"   style="${_mrkBtnStyle('primary')}">
        <i class="fas fa-plus" aria-hidden="true"></i> Create Exam
      </button>
    `,
  });

  modal.open();
  _mrkAttachInputFocus(modal.body());

  modal.footer().querySelector('#btn-ex-cancel').addEventListener('click', () => modal.close());
  const saveBtn = modal.footer().querySelector('#btn-ex-save');
  _mrkHoverBtn(saveBtn, 'primary');

  saveBtn.addEventListener('click', () => {
    const form = modal.body().querySelector('#mrk-exam-form');
    if (!_mrkValidateExamForm(form)) return;
    const data = _mrkCollectExamForm(form);
    const exam = mrkAddExam(data);
    modal.close();
    mrkRenderAll();
    Toast.show(`Exam <strong>${exam.title}</strong> created (${exam.code})`, 'success');
  });
}

/* ── M13c. Edit Exam Modal ──────────────────────────────────────────────────── */

function mrkOpenEditExamModal(id) {
  const exam = mrkGetExam(id);
  if (!exam) { Toast.show('Exam not found', 'danger'); return; }

  const modal = Modal.create({
    id:         'modal-edit-exam',
    title:      `Edit — ${exam.title}`,
    size:       'lg',
    bodyHTML:   _mrkBuildExamForm(exam),
    footerHTML: `
      <button id="btn-ex-cancel" style="${_mrkBtnStyle('ghost')}">Cancel</button>
      <button id="btn-ex-save"   style="${_mrkBtnStyle('primary')}">
        <i class="fas fa-floppy-disk" aria-hidden="true"></i> Save Changes
      </button>
    `,
  });

  modal.open();
  _mrkAttachInputFocus(modal.body());

  modal.footer().querySelector('#btn-ex-cancel').addEventListener('click', () => modal.close());
  const saveBtn = modal.footer().querySelector('#btn-ex-save');
  _mrkHoverBtn(saveBtn, 'primary');

  saveBtn.addEventListener('click', () => {
    const form = modal.body().querySelector('#mrk-exam-form');
    if (!_mrkValidateExamForm(form)) return;
    const data    = _mrkCollectExamForm(form);
    const updated = mrkUpdateExam(id, data);
    if (!updated) { Toast.show('Update failed', 'danger'); return; }
    modal.close();
    mrkRenderAll();
    Toast.show(`Exam <strong>${updated.title}</strong> updated`, 'success');
  });
}

/* ── M13d. Delete Exam Modal ────────────────────────────────────────────────── */

function mrkOpenDeleteExamModal(id, title) {
  const entryCount = mrkLoadMarks().filter(m => m.examId === id).length;
  const modal = Modal.create({
    id:    'modal-del-exam',
    title: 'Delete Exam',
    size:  'sm',
    bodyHTML: `
      <div style="text-align:center;padding:8px 0 4px;">
        <div style="width:52px;height:52px;border-radius:50%;
                    background:rgba(242,95,92,0.12);border:2px solid rgba(242,95,92,0.30);
                    display:flex;align-items:center;justify-content:center;
                    margin:0 auto 14px;font-size:20px;color:var(--color-danger);">
          <i class="fas fa-file-xmark" aria-hidden="true"></i>
        </div>
        <p style="font-size:15px;font-weight:600;color:#fff;margin-bottom:8px;">
          Delete <span style="color:var(--color-danger);">${_mrkEsc(title)}</span>?
        </p>
        <p style="font-size:13px;color:var(--color-slate-400);line-height:1.6;">
          This will permanently remove the exam<br>
          and all <strong style="color:var(--color-warning);">${entryCount} mark ${entryCount !== 1 ? 'entries' : 'entry'}</strong> associated with it.
        </p>
      </div>
    `,
    footerHTML: `
      <button id="btn-del-cancel" style="${_mrkBtnStyle('ghost')};flex:1;">Cancel</button>
      <button id="btn-del-confirm" style="${_mrkBtnStyle('danger')};flex:1;">
        <i class="fas fa-trash-can" aria-hidden="true"></i> Delete
      </button>
    `,
  });

  modal.open();
  modal.footer().querySelector('#btn-del-cancel').addEventListener('click', () => modal.close());
  const confirmBtn = modal.footer().querySelector('#btn-del-confirm');
  _mrkHoverBtn(confirmBtn, 'danger');
  confirmBtn.addEventListener('click', () => {
    mrkDeleteExam(id);
    if (MRK.activeExamId === id) MRK.activeExamId = null;
    modal.close();
    mrkRenderAll();
    Toast.show(`Exam deleted along with ${entryCount} mark ${entryCount !== 1 ? 'entries' : 'entry'}`, 'danger');
  });
}

/* ── Exam form builder ──────────────────────────────────────────────────────── */

const _EIS = `
  width:100%;padding:9px 12px;
  background:rgba(255,255,255,0.04);
  border:1px solid rgba(139,163,188,0.18);
  border-radius:var(--radius-sm,6px);
  color:var(--color-white,#F0F4F8);
  font-family:var(--font-ui,'DM Sans',sans-serif);
  font-size:13px;outline:none;
  transition:border-color .15s,box-shadow .15s;
`;

const _ELS = `
  display:block;margin-bottom:5px;font-size:11px;font-weight:700;
  letter-spacing:0.07em;text-transform:uppercase;
  color:var(--color-slate-400,#8BA3BC);
`;

const _EFW = 'margin-bottom:16px;';

function _mrkBuildExamForm(ex = null) {
  const v = ex || {};
  const opt = (arr, cur, ph = '') =>
    (ph ? `<option value="" ${!cur ? 'selected' : ''} disabled>${ph}</option>` : '') +
    arr.map(x => `<option value="${_mrkEsc(x)}" ${cur === x ? 'selected' : ''}>${_mrkEsc(x)}</option>`).join('');

  return `
  <form id="mrk-exam-form" novalidate autocomplete="off">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 18px;">

      <div style="${_EFW}grid-column:1/-1;">
        <label for="ef-title" style="${_ELS}">Exam Title *</label>
        <input id="ef-title" name="title" type="text" required
               placeholder="e.g. DSA Internal Test I"
               value="${_mrkEsc(v.title || '')}" style="${_EIS}" />
        <div class="field-error" style="color:var(--color-danger);font-size:11px;margin-top:4px;display:none;"></div>
      </div>

      <div style="${_EFW}">
        <label for="ef-subject" style="${_ELS}">Subject *</label>
        <input id="ef-subject" name="subject" type="text" required
               placeholder="e.g. Data Structures & Algorithms"
               value="${_mrkEsc(v.subject || '')}" style="${_EIS}" />
        <div class="field-error" style="color:var(--color-danger);font-size:11px;margin-top:4px;display:none;"></div>
      </div>

      <div style="${_EFW}">
        <label for="ef-dept" style="${_ELS}">Department *</label>
        <select id="ef-dept" name="department" required style="${_EIS}cursor:pointer;">
          ${opt(MRK.DEPARTMENTS, v.department, 'Select department')}
        </select>
        <div class="field-error" style="color:var(--color-danger);font-size:11px;margin-top:4px;display:none;"></div>
      </div>

      <div style="${_EFW}">
        <label for="ef-course" style="${_ELS}">Course</label>
        <input id="ef-course" name="course" type="text"
               placeholder="e.g. B.Sc. Computer Science"
               value="${_mrkEsc(v.course || '')}" style="${_EIS}" />
      </div>

      <div style="${_EFW}">
        <label for="ef-sem" style="${_ELS}">Semester</label>
        <select id="ef-sem" name="semester" style="${_EIS}cursor:pointer;">
          ${[1,2,3,4,5,6,7,8].map(n =>
            `<option value="${n}" ${(v.semester || '1') == n ? 'selected' : ''}>Semester ${n}</option>`
          ).join('')}
        </select>
      </div>

      <div style="${_EFW}">
        <label for="ef-type" style="${_ELS}">Exam Type *</label>
        <select id="ef-type" name="examType" required style="${_EIS}cursor:pointer;">
          ${opt(MRK.EXAM_TYPES, v.examType || 'Internal')}
        </select>
      </div>

      <div style="${_EFW}">
        <label for="ef-total" style="${_ELS}">Total Marks *</label>
        <input id="ef-total" name="totalMarks" type="number" required
               min="1" max="1000" placeholder="100"
               value="${v.totalMarks ?? 100}" style="${_EIS}" />
        <div class="field-error" style="color:var(--color-danger);font-size:11px;margin-top:4px;display:none;"></div>
      </div>

      <div style="${_EFW}">
        <label for="ef-pass" style="${_ELS}">Passing Marks *</label>
        <input id="ef-pass" name="passingMarks" type="number" required
               min="0" max="1000" placeholder="40"
               value="${v.passingMarks ?? 40}" style="${_EIS}" />
        <div class="field-error" style="color:var(--color-danger);font-size:11px;margin-top:4px;display:none;"></div>
      </div>

      <div style="${_EFW}">
        <label for="ef-date" style="${_ELS}">Conducted On</label>
        <input id="ef-date" name="conductedOn" type="date"
               value="${_mrkEsc(v.conductedOn || new Date().toISOString().slice(0, 10))}"
               style="${_EIS}" />
      </div>

      <div style="${_EFW}">
        <label for="ef-status" style="${_ELS}">Status</label>
        <select id="ef-status" name="status" style="${_EIS}cursor:pointer;">
          ${opt(MRK.EXAM_STATUSES, v.status || 'Scheduled')}
        </select>
      </div>

      <div style="${_EFW}">
        <label for="ef-faculty" style="${_ELS}">Faculty</label>
        <input id="ef-faculty" name="faculty" type="text"
               placeholder="e.g. Prof. Neha Gupta"
               value="${_mrkEsc(v.faculty || '')}" style="${_EIS}" />
      </div>

      <div style="${_EFW}">
        <label for="ef-venue" style="${_ELS}">Venue</label>
        <input id="ef-venue" name="venue" type="text"
               placeholder="e.g. Exam Hall A"
               value="${_mrkEsc(v.venue || '')}" style="${_EIS}" />
      </div>

    </div>
  </form>
  `;
}

function _mrkValidateExamForm(form) {
  _m$$('.field-error', form).forEach(el => { el.textContent = ''; el.style.display = 'none'; });

  const errors = {};
  const title   = form.querySelector('#ef-title');
  const subject = form.querySelector('#ef-subject');
  const dept    = form.querySelector('#ef-dept');
  const total   = form.querySelector('#ef-total');
  const passing = form.querySelector('#ef-pass');

  if (!title?.value.trim()   || title.value.trim().length < 3)  errors.title   = 'Title must be at least 3 characters';
  if (!subject?.value.trim() || subject.value.trim().length < 2) errors.subject = 'Subject is required';
  if (!dept?.value)                                               errors.dept    = 'Department is required';

  const tot = parseInt(total?.value, 10);
  const pas = parseInt(passing?.value, 10);
  if (!tot || tot < 1)    errors.total   = 'Total marks must be at least 1';
  if (isNaN(pas) || pas < 0) errors.pass = 'Passing marks must be ≥ 0';
  if (!errors.total && !errors.pass && pas > tot) errors.pass = 'Passing marks cannot exceed total marks';

  const fieldMap = [
    ['#ef-title',   'title',   title],
    ['#ef-subject', 'subject', subject],
    ['#ef-dept',    'dept',    dept],
    ['#ef-total',   'total',   total],
    ['#ef-pass',    'pass',    passing],
  ];
  fieldMap.forEach(([, key, el]) => {
    if (errors[key] && el) {
      const errEl = el.nextElementSibling;
      if (errEl?.classList.contains('field-error')) {
        errEl.textContent = errors[key];
        errEl.style.display = 'block';
        el.style.borderColor = 'rgba(242,95,92,0.50)';
      }
    }
  });

  return Object.keys(errors).length === 0;
}

function _mrkCollectExamForm(form) {
  return {
    title:        form.querySelector('#ef-title')?.value    || '',
    subject:      form.querySelector('#ef-subject')?.value  || '',
    department:   form.querySelector('#ef-dept')?.value     || '',
    course:       form.querySelector('#ef-course')?.value   || '',
    semester:     form.querySelector('#ef-sem')?.value      || '1',
    examType:     form.querySelector('#ef-type')?.value     || 'Internal',
    totalMarks:   form.querySelector('#ef-total')?.value    || 100,
    passingMarks: form.querySelector('#ef-pass')?.value     || 40,
    conductedOn:  form.querySelector('#ef-date')?.value     || '',
    status:       form.querySelector('#ef-status')?.value   || 'Scheduled',
    faculty:      form.querySelector('#ef-faculty')?.value  || '',
    venue:        form.querySelector('#ef-venue')?.value    || '',
  };
}


/* =============================================================================
   M16. CSV EXPORT
   ============================================================================= */

function mrkExportGradebookCSV() {
  const exam = mrkGetExam(MRK.activeExamId);
  if (!exam) { Toast.show('Select an exam first', 'warning'); return; }

  const marks = mrkLoadMarks().filter(m => m.examId === exam.id);
  if (!marks.length) { Toast.show('No marks to export', 'warning'); return; }

  const sorted = [...marks].sort((a, b) => b.marksObtained - a.marksObtained)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  const headers = [
    'Rank', 'Student Name', 'Roll No', 'Department', 'Semester',
    'Marks Obtained', `Total Marks (${exam.totalMarks})`,
    'Percentage', 'Grade', 'Grade Point',
    `Result (Pass ≥ ${exam.passingMarks})`, 'Remarks',
  ];

  const rows = sorted.map(m => [
    m.rank, `"${m.studentName}"`, m.rollNo, `"${m.department}"`, m.semester,
    m.marksObtained, exam.totalMarks,
    `${m.pct}%`, m.grade, m.gradePoint,
    m.marksObtained >= exam.passingMarks ? 'Pass' : 'Fail',
    `"${(m.remarks || '').replace(/"/g, '""')}"`,
  ].join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gradebook_${exam.code}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  Toast.show(`Gradebook for <strong>${exam.title}</strong> exported`, 'success');
  logActivity(`Gradebook CSV exported: <strong>${exam.title}</strong> — ${marks.length} entries`, 'info');
}

function mrkExportStudentCSV(studentId, stuName, marks, exams) {
  const headers = ['Exam', 'Type', 'Date', 'Score', 'Total', '%', 'Grade', 'Grade Point', 'Result', 'Remarks'];
  const rows = marks.map(m => {
    const ex = exams.find(e => e.id === m.examId);
    const result = ex && m.marksObtained >= ex.passingMarks ? 'Pass' : 'Fail';
    return [
      `"${(ex?.title || '').replace(/"/g, '""')}"`,
      ex?.examType || '—',
      ex?.conductedOn || '—',
      m.marksObtained, ex?.totalMarks || '—',
      `${m.pct}%`, m.grade, m.gradePoint,
      result,
      `"${(m.remarks || '').replace(/"/g, '""')}"`,
    ].join(',');
  });

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `report_card_${stuName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}


/* =============================================================================
   HELPERS
   ============================================================================= */

function _mrkEsc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _mrkBtnStyle(v) {
  const b = `display:inline-flex;align-items:center;gap:8px;
    padding:9px 20px;border-radius:var(--radius-sm,6px);
    font-family:var(--font-ui,'DM Sans',sans-serif);
    font-size:13px;font-weight:700;cursor:pointer;
    transition:background .15s,border-color .15s,box-shadow .15s;`;
  const vs = {
    primary: `${b}background:rgba(0,212,255,0.12);border:1px solid rgba(0,212,255,0.30);color:var(--color-cyan-400);`,
    ghost:   `${b}background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.22);color:var(--color-slate-300);`,
    danger:  `${b}background:rgba(242,95,92,0.10);border:1px solid rgba(242,95,92,0.28);color:var(--color-danger);`,
    success: `${b}background:rgba(34,211,163,0.10);border:1px solid rgba(34,211,163,0.26);color:var(--color-success);`,
  };
  return vs[v] || vs.ghost;
}

function _mrkHoverBtn(btn, v) {
  if (!btn) return;
  const h = {
    primary: ['rgba(0,212,255,0.22)', 'rgba(0,212,255,0.50)', '0 0 16px rgba(0,212,255,0.14)'],
    danger:  ['rgba(242,95,92,0.20)',  'rgba(242,95,92,0.45)',  '0 0 14px rgba(242,95,92,0.14)'],
    success: ['rgba(34,211,163,0.22)', 'rgba(34,211,163,0.50)', '0 0 14px rgba(34,211,163,0.14)'],
  };
  const [bg, bc, sh] = h[v] || [];
  if (!bg) return;
  btn.addEventListener('mouseenter', () => { btn.style.background = bg; btn.style.borderColor = bc; btn.style.boxShadow = sh; });
  btn.addEventListener('mouseleave', () => { btn.style.background = ''; btn.style.borderColor = ''; btn.style.boxShadow = 'none'; });
}

function _mrkAttachInputFocus(container) {
  _m$$('input, select, textarea', container).forEach(el => {
    el.addEventListener('focus', () => {
      el.style.borderColor = 'rgba(0,212,255,0.35)';
      el.style.boxShadow   = '0 0 0 3px rgba(0,212,255,0.08)';
      el.style.background  = 'rgba(0,212,255,0.04)';
    });
    el.addEventListener('blur', () => {
      el.style.borderColor = 'rgba(139,163,188,0.18)';
      el.style.boxShadow   = 'none';
      el.style.background  = 'rgba(255,255,255,0.04)';
    });
  });
}

function _mrkStyleSelect(sel) {
  sel.addEventListener('focus', () => { sel.style.borderColor = 'rgba(0,212,255,0.35)'; sel.style.boxShadow = '0 0 0 3px rgba(0,212,255,0.08)'; });
  sel.addEventListener('blur',  () => { sel.style.borderColor = 'rgba(139,163,188,0.18)'; sel.style.boxShadow = 'none'; });
}


/* =============================================================================
   RENDER DISPATCHER
   ============================================================================= */

function mrkRenderActivePanel() {
  const panels = ['gradebook', 'analytics', 'ranks', 'exams'];
  panels.forEach(p => {
    const el = _m$(`#mrk-panel-${p}`);
    if (el) el.style.display = MRK.activeTab === p ? '' : 'none';
  });

  switch (MRK.activeTab) {
    case 'gradebook': mrkRenderGradebook();  break;
    case 'analytics': mrkRenderAnalytics();  break;
    case 'ranks':     mrkRenderRanks();      break;
    case 'exams':     mrkRenderExamList();   break;
  }
}

function mrkRenderAll() {
  mrkRenderKPIs();
  mrkPopulateExamSelect();
  mrkUpdateContextBar();
  mrkRenderActivePanel();
}


/* =============================================================================
   CONTROLS WIRING — tabs, search, filters, buttons
   ============================================================================= */

function mrkInitControls() {
  // Tab switching
  _m$$('.mrk-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _m$$('.mrk-tab').forEach(t => {
        const active = t === tab;
        t.style.background = active ? 'rgba(0,212,255,0.12)' : 'transparent';
        t.style.color      = active ? 'var(--color-cyan-400)' : 'var(--color-slate-400)';
        t.setAttribute('aria-selected', active);
      });
      MRK.activeTab = tab.dataset.tab;
      MRK.page = 1;
      mrkRenderActivePanel();
    });

    tab.addEventListener('mouseenter', () => {
      if (MRK.activeTab !== tab.dataset.tab) tab.style.color = 'var(--color-white-soft)';
    });
    tab.addEventListener('mouseleave', () => {
      if (MRK.activeTab !== tab.dataset.tab) tab.style.color = 'var(--color-slate-400)';
    });
  });

  // Add exam button
  const addExamBtn = _m$('#btn-mrk-add-exam');
  if (addExamBtn) {
    addExamBtn.addEventListener('click', mrkOpenAddExamModal);
    addExamBtn.addEventListener('mouseenter', () => {
      addExamBtn.style.background   = 'rgba(0,212,255,0.20)';
      addExamBtn.style.borderColor  = 'rgba(0,212,255,0.50)';
      addExamBtn.style.boxShadow    = '0 0 16px rgba(0,212,255,0.12)';
    });
    addExamBtn.addEventListener('mouseleave', () => {
      addExamBtn.style.background   = 'rgba(0,212,255,0.10)';
      addExamBtn.style.borderColor  = 'rgba(0,212,255,0.26)';
      addExamBtn.style.boxShadow    = 'none';
    });
  }

  // Gradebook search
  const gbSearch = _m$('#mrk-gb-search');
  const gbWrap   = _m$('#mrk-gb-search-wrap');
  if (gbSearch) {
    gbSearch.addEventListener('input', debounce(e => {
      MRK.filter.query = e.target.value.trim();
      MRK.page = 1;
      mrkRenderGradebook();
    }, CMS.config.searchDebounce));
  }
  if (gbWrap) {
    gbWrap.addEventListener('focusin',  () => { gbWrap.style.borderColor = 'rgba(0,212,255,0.35)'; gbWrap.style.boxShadow = '0 0 0 3px rgba(0,212,255,0.08)'; });
    gbWrap.addEventListener('focusout', () => { gbWrap.style.borderColor = 'rgba(139,163,188,0.18)'; gbWrap.style.boxShadow = 'none'; });
  }

  // Grade filter
  const gradeFilter = _m$('#mrk-gb-grade-filter');
  if (gradeFilter) {
    gradeFilter.addEventListener('change', e => { MRK.filter.grade = e.target.value; MRK.page = 1; mrkRenderGradebook(); });
    _mrkStyleSelect(gradeFilter);
  }

  // Bulk save
  const bulkSave = _m$('#btn-mrk-bulk-save');
  if (bulkSave) {
    bulkSave.addEventListener('click', mrkBulkSave);
    _mrkHoverBtn(bulkSave, 'success');
  }

  // Export gradebook
  const exportBtn = _m$('#btn-mrk-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', mrkExportGradebookCSV);
    exportBtn.addEventListener('mouseenter', () => exportBtn.style.background = 'rgba(255,255,255,0.08)');
    exportBtn.addEventListener('mouseleave', () => exportBtn.style.background = 'rgba(255,255,255,0.03)');
  }

  // Exam list filters
  ['#mrk-exam-dept-filter', '#mrk-exam-type-filter', '#mrk-exam-status-filter'].forEach(sel => {
    const el = _m$(sel);
    if (!el) return;
    _mrkStyleSelect(el);
    el.addEventListener('change', e => {
      const key = sel.includes('dept') ? 'dept' : sel.includes('type') ? 'type' : 'status';
      MRK.examFilter[key] = e.target.value;
      if (MRK.activeTab === 'exams') mrkRenderExamList();
    });
  });
}


/* =============================================================================
   M17. INIT & AUTO-BOOT
   ============================================================================= */

const MarksModule = {
  async init() {
    // 0. Fetch real students from API
    try {
      const token = Auth.getToken();
      if (token && Auth.getRole() !== 'student') {
        const raw = await Auth.fetch('/students');
        const res = await raw.json();
        if (res.success && res.data) {
          MRK_STUDENTS = res.data.map(s => ({ ...s, id: String(s._id || s.id || '') }));
        }
      }
    } catch (e) {
      console.error('[MarksModule] Failed to fetch students:', e);
    }

    // 1. Initialise empty state if no DB connectivity
    mrkRenderAll();

    // 2. Inject section
    mrkInjectSection();

    // 3. Wire controls
    mrkInitControls();

    // 4. Hook nav
    mrkHookNav();

    // 5. Pre-render
    mrkRenderAll();

    console.info('[MarksModule] Initialised — %d exams · %d mark entries',
      mrkLoadExams().length, mrkLoadMarks().length);
  },

  // Public surface
  show:             () => {
    mrkInjectSection();
    const sec = _m$('#marks-section');
    if (sec) {
      if (Auth.getRole() === 'student') {
        sec.innerHTML = '';
        const user = Auth.getUser();
        sec.insertAdjacentHTML('beforeend', `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h2 class="section-title" style="margin-bottom:0;">My Results</h2>
          </div>
          <div style="background:rgba(12,22,38,0.7); border-radius:12px; border:1px solid rgba(139,163,188,0.15); overflow:hidden;">
            <div style="padding:40px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
               <div style="font-size:14px; color:var(--color-slate-400); margin-bottom:12px;">Cumulative GPA</div>
               <div style="font-size:56px; font-weight:700; color:var(--color-success); font-family:var(--font-mono); line-height:1;">
                 ${mrkStudentGPA(user._id)}
               </div>
            </div>
            <div style="padding:20px; display:flex; justify-content:center;">
              <button id="btn-view-my-report" style="padding:12px 24px; border-radius:6px; background:var(--color-cyan-600); color:#fff; border:none; font-weight:600; cursor:pointer;">
                View Detailed Report Card
              </button>
            </div>
          </div>
        `);
        _m$('#btn-view-my-report').addEventListener('click', () => mrkOpenReportCard(user._id));
        sec.style.display = '';
      } else {
        sec.style.display = '';
        mrkRenderAll();
      }
    }
  },
  hide:             mrkHide,
  renderAll:        mrkRenderAll,
  openAddExam:      mrkOpenAddExamModal,
  exportGradebook:  mrkExportGradebookCSV,
  openReportCard:   mrkOpenReportCard,
  hookNav:          mrkHookNav,
  computeGrade:     mrkComputeGrade,
};

/* Auto-boot: wait for app.js globals */
(function boot() {
  function tryInit() {
    if (typeof CMS === 'undefined' || typeof Modal === 'undefined') {
      setTimeout(tryInit, 80);
      return;
    }
    MarksModule.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();