/**
 * =============================================================================
 * ASHFORD UNIVERSITY — CMS ADMIN DASHBOARD
 * faculty.js  |  Faculty CRUD Module
 * =============================================================================
 *
 * Depends on: app.js
 *   Globals used: CMS, $, $$, lsGet, lsSet, uid, formatDate, initials,
 *                 debounce, Toast, Modal, logActivity, NavModule, DOM
 *
 * Storage key: 'cms_faculty'  →  Array<FacultyRecord>
 *
 * FacultyRecord shape:
 * {
 *   id, employeeId, title, name, email, phone, gender, dob,
 *   department, designation, specialisation, qualifications,
 *   joiningDate, status,   // 'Active' | 'On Leave' | 'Inactive' | 'Retired'
 *   courseLoad,            // number of courses currently assigned
 *   officeRoom, address,
 *   createdAt, updatedAt
 * }
 *
 * TABLE OF CONTENTS
 * -----------------
 * F1.  Config & Runtime State
 * F2.  localStorage Store
 *      F2a.  load / save / get
 *      F2b.  add / update / delete
 *      F2c.  filter / sort
 *      F2d.  generate employee ID
 * F3.  Seed Data — 12 realistic faculty records
 * F4.  Section HTML Injection
 * F5.  Section Show / Hide / Nav Hook
 * F6.  KPI Cards — render
 * F7.  Department Distribution Chart (SVG donut)
 * F8.  Faculty Grid View — card tiles
 * F9.  Faculty Table View — data table with pagination
 * F10. Controls — search, filters, view toggle, export
 * F11. Add Modal
 * F12. Edit Modal
 * F13. View (Profile) Modal
 * F14. Delete Confirmation Modal
 * F15. Form Builder — shared HTML + validation + collection
 * F16. Stat Card Sync (Active Faculty count)
 * F17. CSV Export
 * F18. Init & Auto-Boot
 * =============================================================================
 */

'use strict';

/* =============================================================================
   F1. CONFIG & RUNTIME STATE
   ============================================================================= */

let FAC_DATA = [];
const FAC = {
  storageKey:   'cms_faculty',
  ROWS_PER_PAGE: 10,

  /** Filter state */
  filter: {
    query:  '',
    status: 'all',
    dept:   'all',
    sort:   'name_asc',
  },

  /** Pagination */
  page: 1,

  /** 'grid' | 'table' — current view mode */
  viewMode: 'grid',

  /** Constant lists */
  DEPARTMENTS: [
    'Computer Science',
    'Business Admin',
    'Engineering',
    'Medical Sciences',
    'Arts & Humanities',
  ],

  DESIGNATIONS: [
    'Professor',
    'Associate Professor',
    'Assistant Professor',
    'Lecturer',
    'Senior Lecturer',
    'Visiting Faculty',
    'Adjunct Professor',
    'Head of Department',
  ],

  TITLES: ['Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.'],

  STATUSES: ['Active', 'On Leave', 'Inactive', 'Retired'],

  STATUS_BADGE: {
    'Active':   'badge--success',
    'On Leave': 'badge--warning',
    'Inactive': 'badge--danger',
    'Retired':  'badge--info',
  },

  STATUS_COLOR: {
    'Active':   'var(--color-success)',
    'On Leave': 'var(--color-warning)',
    'Inactive': 'var(--color-danger)',
    'Retired':  'var(--color-info)',
  },

  /** Avatar accent colours cycled by dept */
  DEPT_COLOR: {
    'Computer Science':  'var(--color-cyan-400)',
    'Business Admin':    'var(--color-info)',
    'Engineering':       'var(--color-success)',
    'Medical Sciences':  'var(--color-warning)',
    'Arts & Humanities': 'var(--color-danger)',
  },

  DEPT_CHART_COLOR: {
    'Computer Science':  '#00D4FF',
    'Business Admin':    '#818CF8',
    'Engineering':       '#22D3A3',
    'Medical Sciences':  '#F5A524',
    'Arts & Humanities': '#F25F5C',
  },
};

/* Convenience aliases — safe because app.js defines these globals */
const _f$  = (sel, ctx = document) => ctx.querySelector(sel);
const _f$$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];


/* =============================================================================
   F2. LOCALSTORAGE STORE
   ============================================================================= */

/* ── F2a. load / save / get ────────────────────────────────────────────────── */

async function facLoad() {
  try {
    const raw = await Auth.fetch('/faculty');
    const res = await raw.json();
    if (res.success && res.data) {
      // Map MongoDB _id to id
      return res.data.map(f => ({ ...f, id: f._id }));
    }
  } catch (err) {
    console.error('Error fetching faculty:', err);
  }
  return [];
}
function facGet(id) { return FAC_DATA.find(f => f.id === id) || null; }

/* ── F2b. add / update / delete ────────────────────────────────────────────── */

async function facAdd(data) {
  try {
    const raw = await Auth.fetch('/faculty', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    const res = await raw.json();
    if (res.success) {
      const f = res.data;
      f.id = f._id;
      FAC_DATA.push(f);
      logActivity(`Faculty added: <strong>${f.name}</strong> — ${f.department}`, 'success');
      return f;
    } else {
      Toast.show(res.message || 'Failed to add faculty', 'danger');
      return null;
    }
  } catch (err) {
    Toast.show('Network error', 'danger');
    return null;
  }
}

async function facUpdate(id, data) {
  try {
    const raw = await Auth.fetch('/faculty/' + id, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    const res = await raw.json();
    if (res.success) {
      const f = res.data;
      f.id = f._id;
      const idx = FAC_DATA.findIndex(x => x.id === id);
      if (idx !== -1) FAC_DATA[idx] = f;
      logActivity(`Faculty updated: <strong>${f.name}</strong>`, 'info');
      return f;
    } else {
      Toast.show(res.message || 'Update failed', 'danger');
      return null;
    }
  } catch (err) {
    Toast.show('Network error', 'danger');
    return null;
  }
}

async function facDelete(id) {
  try {
    const raw = await Auth.fetch('/faculty/' + id, { method: 'DELETE' });
    const res = await raw.json();
    if (res.success) {
      const idx = FAC_DATA.findIndex(x => x.id === id);
      if (idx !== -1) FAC_DATA.splice(idx, 1);
      logActivity('Faculty removed', 'danger');
      return true;
    }
    return false;
  } catch (err) {
    Toast.show('Network error', 'danger');
    return false;
  }
}

/* ── F2c. filter / sort ─────────────────────────────────────────────────────── */

function facFiltered() {
  const { query, status, dept, sort } = FAC.filter;
  let list = FAC_DATA.slice();

  if (query) {
    const q = query.toLowerCase();
    list = list.filter(f =>
      f.name.toLowerCase().includes(q)           ||
      f.employeeId.toLowerCase().includes(q)     ||
      f.email.toLowerCase().includes(q)          ||
      f.department.toLowerCase().includes(q)     ||
      f.designation.toLowerCase().includes(q)    ||
      (f.specialisation || '').toLowerCase().includes(q)
    );
  }

  if (status !== 'all') list = list.filter(f => f.status === status);
  if (dept   !== 'all') list = list.filter(f => f.department === dept);

  const [field, dir] = sort.split('_');
  list.sort((a, b) => {
    let av, bv;
    if (field === 'name')     { av = a.name;       bv = b.name; }
    if (field === 'dept')     { av = a.department;  bv = b.department; }
    if (field === 'joined')   { av = a.joiningDate; bv = b.joiningDate; }
    if (field === 'load')     { av = a.courseLoad;  bv = b.courseLoad; }
    if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === 'asc' ? av - bv : bv - av;
  });

  return list;
}

/* ── F2d. generate employee ID ─────────────────────────────────────────────── */

function _facNextEmployeeId(list) {
  const nums = list
    .map(f => parseInt((f.employeeId || '').replace(/\D/g, ''), 10))
    .filter(Boolean);
  const next = nums.length ? Math.max(...nums) + 1 : 1001;
  return `FAC-${next}`;
}


/* =============================================================================
   F3. SEED DATA (Removed per request)
   ============================================================================= */


/* =============================================================================
   F4. SECTION HTML INJECTION
   ============================================================================= */

function facInjectSection() {
  if (_f$('#faculty-section')) return;

  const section = document.createElement('section');
  section.id = 'faculty-section';
  section.setAttribute('aria-labelledby', 'faculty-section-title');
  section.setAttribute('data-module', 'faculty');
  section.style.display = 'none';

  section.innerHTML = `
    <h2 class="section-title" id="faculty-section-title">Faculty</h2>

    <!-- KPI Row -->
    <div id="fac-kpi-row" role="list" aria-label="Faculty statistics"
         style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:16px;margin-bottom:24px;">

      <div class="stat-card" id="fac-kpi-total" role="listitem" tabindex="0"
           style="cursor:pointer;" title="All faculty">
        <div class="stat-card__header">
          <div class="stat-card__label">Total Faculty</div>
          <div class="stat-card__icon-wrap stat-card__icon-wrap--cyan">
            <i class="fas fa-chalkboard-user" aria-hidden="true"></i>
          </div>
        </div>
        <div class="stat-card__value" id="fac-val-total">0</div>
        <div class="stat-card__footer">
          <i class="fas fa-users" style="color:var(--color-cyan-400);" aria-hidden="true"></i>
          <span style="margin-left:5px;" id="fac-dept-count">0 departments</span>
        </div>
      </div>

      <div class="stat-card" id="fac-kpi-active" role="listitem" tabindex="0"
           style="cursor:pointer;" title="Filter: Active">
        <div class="stat-card__header">
          <div class="stat-card__label">Active</div>
          <div class="stat-card__icon-wrap stat-card__icon-wrap--success">
            <i class="fas fa-circle-check" aria-hidden="true"></i>
          </div>
        </div>
        <div class="stat-card__value" id="fac-val-active">0</div>
        <div class="stat-card__footer">
          <span class="stat-card__delta stat-card__delta--up" id="fac-pct-active">—</span>
          <span style="margin-left:5px;">of total</span>
        </div>
      </div>

      <div class="stat-card" id="fac-kpi-leave" role="listitem" tabindex="0"
           style="cursor:pointer;" title="Filter: On Leave">
        <div class="stat-card__header">
          <div class="stat-card__label">On Leave</div>
          <div class="stat-card__icon-wrap stat-card__icon-wrap--warning">
            <i class="fas fa-calendar-minus" aria-hidden="true"></i>
          </div>
        </div>
        <div class="stat-card__value" id="fac-val-leave">0</div>
        <div class="stat-card__footer">
          <span class="stat-card__delta stat-card__delta--down" id="fac-pct-leave">—</span>
          <span style="margin-left:5px;">of total</span>
        </div>
      </div>

      <div class="stat-card" id="fac-kpi-load" role="listitem" tabindex="0">
        <div class="stat-card__header">
          <div class="stat-card__label">Avg. Course Load</div>
          <div class="stat-card__icon-wrap stat-card__icon-wrap--info">
            <i class="fas fa-book-open" aria-hidden="true"></i>
          </div>
        </div>
        <div class="stat-card__value" id="fac-val-load">0</div>
        <div class="stat-card__footer">
          <i class="fas fa-graduation-cap" style="color:var(--color-info);" aria-hidden="true"></i>
          <span style="margin-left:5px;">courses per faculty</span>
        </div>
      </div>

    </div>

    <!-- Controls Row -->
    <div id="fac-controls" style="display:flex;align-items:center;gap:10px;
         flex-wrap:wrap;margin-bottom:18px;">

      <!-- Search -->
      <div id="fac-search-wrap" style="display:flex;align-items:center;gap:7px;
           background:rgba(255,255,255,0.08);
           border:1px solid rgba(139,163,188,0.18);
           border-radius:var(--radius-md);
           padding:0 12px;height:38px;flex:1;min-width:220px;
           transition:border-color .2s,box-shadow .2s;">
        <i class="fas fa-search" aria-hidden="true"
           style="color:var(--color-slate-400);font-size:12px;flex-shrink:0;"></i>
        <input type="search" id="fac-search-input"
               placeholder="Search name, ID, email, specialisation…"
               aria-label="Search faculty"
               style="background:none;border:none;outline:none;
                      font-family:var(--font-ui);font-size:13px;
                      color:var(--color-white);flex:1;" />
      </div>

      <!-- Status filter -->
      <select id="fac-filter-status" aria-label="Filter by status"
              style="background:rgba(255,255,255,0.08);
                     border:1px solid rgba(139,163,188,0.18);
                     border-radius:var(--radius-sm);
                     color:var(--color-white-soft);
                     font-family:var(--font-ui);font-size:12px;
                     padding:8px 10px;cursor:pointer;height:38px;">
        <option value="all">All Statuses</option>
        <option value="Active">Active</option>
        <option value="On Leave">On Leave</option>
        <option value="Inactive">Inactive</option>
        <option value="Retired">Retired</option>
      </select>

      <!-- Dept filter -->
      <select id="fac-filter-dept" aria-label="Filter by department"
              style="background:rgba(255,255,255,0.08);
                     border:1px solid rgba(139,163,188,0.18);
                     border-radius:var(--radius-sm);
                     color:var(--color-white-soft);
                     font-family:var(--font-ui);font-size:12px;
                     padding:8px 10px;cursor:pointer;height:38px;">
        <option value="all">All Departments</option>
        ${FAC.DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
      </select>

      <!-- Sort -->
      <select id="fac-sort" aria-label="Sort faculty"
              style="background:rgba(255,255,255,0.08);
                     border:1px solid rgba(139,163,188,0.18);
                     border-radius:var(--radius-sm);
                     color:var(--color-white-soft);
                     font-family:var(--font-ui);font-size:12px;
                     padding:8px 10px;cursor:pointer;height:38px;">
        <option value="name_asc">Name A–Z</option>
        <option value="name_desc">Name Z–A</option>
        <option value="dept_asc">Dept A–Z</option>
        <option value="joined_desc">Newest Joined</option>
        <option value="joined_asc">Oldest Joined</option>
        <option value="load_desc">Highest Load</option>
      </select>

      <!-- View toggle -->
      <div style="display:flex;border:1px solid rgba(139,163,188,0.18);
                  border-radius:var(--radius-sm);overflow:hidden;flex-shrink:0;">
        <button id="fac-view-grid" aria-label="Grid view" title="Grid view"
                style="width:36px;height:36px;display:flex;align-items:center;
                       justify-content:center;font-size:13px;cursor:pointer;
                       background:rgba(0,212,255,0.10);
                       color:var(--color-cyan-400);border:none;
                       transition:all .15s;border-right:1px solid rgba(139,163,188,0.18);">
          <i class="fas fa-grid-2" aria-hidden="true"></i>
        </button>
        <button id="fac-view-table" aria-label="Table view" title="Table view"
                style="width:36px;height:36px;display:flex;align-items:center;
                       justify-content:center;font-size:13px;cursor:pointer;
                       background:rgba(255,255,255,0.03);
                       color:var(--color-slate-400);border:none;
                       transition:all .15s;">
          <i class="fas fa-table-list" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Export -->
      <button id="btn-fac-export" aria-label="Export faculty list as CSV" data-roles="admin"
              style="display:flex;align-items:center;gap:6px;
                     padding:0 14px;height:38px;
                     background:rgba(255,255,255,0.03);
                     border:1px solid rgba(255,255,255,0.2);
                     border-radius:var(--radius-sm);
                     color:var(--color-slate-300);
                     font-family:var(--font-ui);font-size:12px;
                     font-weight:600;cursor:pointer;
                     transition:background .15s;flex-shrink:0;">
        <i class="fas fa-file-csv" aria-hidden="true"></i> Export
      </button>

      <!-- Add Faculty -->
      <button id="btn-fac-add" aria-label="Add new faculty member" data-roles="admin"
              style="display:flex;align-items:center;gap:8px;
                     padding:0 18px;height:38px;
                     background:rgba(229,57,53,0.1);
                     border:1px solid rgba(229,57,53,0.3);
                     border-radius:var(--radius-sm);
                     color:#ef4444;
                     font-family:var(--font-ui);font-size:13px;
                     font-weight:700;cursor:pointer;flex-shrink:0;
                     transition:background .15s,border-color .15s,box-shadow .15s;">
        <i class="fas fa-user-plus" aria-hidden="true"></i> Add Faculty
      </button>

    </div>

    <!-- Result count -->
    <div id="fac-result-info"
         style="font-size:12px;color:var(--color-slate-400);margin-bottom:14px;
                min-height:18px;"></div>

    <!-- ── GRID VIEW ─────────────────────────────────────────────────── -->
    <div id="fac-grid-view">
      <div id="fac-grid" style="display:grid;
           grid-template-columns:repeat(auto-fill,minmax(260px,1fr));
           gap:16px;"></div>

      <!-- Grid empty state -->
      <div id="fac-grid-empty" style="display:none;text-align:center;
           padding:60px 24px;color:var(--color-slate-400);">
        <i class="fas fa-chalkboard-user"
           style="font-size:40px;margin-bottom:16px;display:block;opacity:.28;"
           aria-hidden="true"></i>
        <p style="font-size:15px;font-weight:600;
                  color:var(--color-white-soft);margin-bottom:6px;">
          No faculty members found
        </p>
        <p style="font-size:13px;">Try adjusting your filters, or add a new faculty member.</p>
        <button id="btn-fac-empty-add" data-roles="admin"
                style="margin-top:18px;padding:9px 22px;
                       border-radius:var(--radius-sm);
                       border:1px solid rgba(229,57,53,0.3);
                       background:rgba(229,57,53,0.1);
                       color:#ef4444;
                       font-size:13px;font-weight:700;cursor:pointer;
                       font-family:var(--font-ui);">
          <i class="fas fa-user-plus"></i> Add Faculty
        </button>
      </div>
    </div>

    <!-- ── TABLE VIEW ────────────────────────────────────────────────── -->
    <div id="fac-table-view" style="display:none;">
      <div class="card" id="fac-table-card">
        <div class="card-header">
          <div>
            <div class="card-title">Faculty Directory</div>
            <div class="card-subtitle" id="fac-table-subtitle">Loading…</div>
          </div>
        </div>
        <div class="card-body card-body--flush" style="overflow-x:auto;">
          <table class="data-table" id="fac-data-table" aria-label="Faculty directory">
            <thead>
              <tr>
                <th scope="col">Faculty</th>
                <th scope="col">Employee ID</th>
                <th scope="col">Department</th>
                <th scope="col">Designation</th>
                <th scope="col">Specialisation</th>
                <th scope="col" style="text-align:center;">Load</th>
                <th scope="col">Joined</th>
                <th scope="col" style="text-align:center;">Status</th>
                <th scope="col" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody id="fac-tbody"></tbody>
          </table>
          <div id="fac-table-empty" style="display:none;text-align:center;
               padding:48px 24px;color:var(--color-slate-400);">
            <i class="fas fa-chalkboard-user"
               style="font-size:32px;margin-bottom:12px;display:block;opacity:.28;"
               aria-hidden="true"></i>
            <p style="font-size:15px;font-weight:600;
                      color:var(--color-white-soft);margin-bottom:6px;">
              No faculty found
            </p>
            <p style="font-size:13px;">Adjust your search or filters.</p>
          </div>
        </div>

        <!-- Table pagination -->
        <div id="fac-pagination"
             style="display:flex;align-items:center;justify-content:space-between;
                    padding:10px 22px;border-top:1px solid var(--color-border);
                    background:rgba(0,0,0,0.08);">
          <span id="fac-pg-info"
                style="font-size:11px;color:var(--color-slate-400);"></span>
          <div id="fac-pg-btns" style="display:flex;gap:6px;"></div>
        </div>
      </div>
    </div>

    <!-- Department Donut Chart Card -->
    <div style="margin-top:24px;">
      <div class="card" id="fac-dept-chart-card">
        <div class="card-header">
          <div>
            <div class="card-title">Faculty by Department</div>
            <div class="card-subtitle">Distribution across all departments</div>
          </div>
        </div>
        <div class="card-body"
             style="display:flex;align-items:center;gap:32px;
                    padding:20px 22px;flex-wrap:wrap;">
          <!-- Donut SVG (rendered by JS) -->
          <div style="position:relative;flex-shrink:0;width:140px;height:140px;">
            <svg id="fac-donut-svg" viewBox="0 0 140 140"
                 xmlns="http://www.w3.org/2000/svg"
                 role="img" aria-label="Faculty department distribution chart"
                 style="width:140px;height:140px;display:block;">
            </svg>
            <div id="fac-donut-center"
                 style="position:absolute;top:50%;left:50%;
                        transform:translate(-50%,-50%);
                        text-align:center;pointer-events:none;">
              <div style="font-family:var(--font-mono);font-size:22px;
                          font-weight:500;color:var(--color-white);
                          line-height:1;" id="fac-donut-total">0</div>
              <div style="font-size:9px;color:var(--color-slate-400);
                          text-transform:uppercase;letter-spacing:0.06em;
                          margin-top:3px;">Faculty</div>
            </div>
          </div>
          <!-- Legend -->
          <div id="fac-donut-legend"
               style="flex:1;display:grid;
                      grid-template-columns:repeat(auto-fill,minmax(180px,1fr));
                      gap:10px;min-width:200px;">
          </div>
        </div>
      </div>
    </div>

  `;

  const pageContent = _f$('#page-content') || document.body;
  pageContent.appendChild(section);
}


/* =============================================================================
   F5. SECTION SHOW / HIDE / NAV HOOK
   ============================================================================= */

function facShow() {
  facInjectSection();
  const sec = _f$('#faculty-section');
  if (sec) sec.style.display = '';
  facRenderAll();
}

function facHide() {
  const sec = _f$('#faculty-section');
  if (sec) sec.style.display = 'none';
}

function facHookNav() {
  if (typeof NavModule === 'undefined' || !NavModule.setActive) return;
  const _orig = NavModule.setActive.bind(NavModule);
  NavModule.setActive = function (key) {
    _orig(key);
    key === 'faculty' ? facShow() : facHide();
  };
}


/* =============================================================================
   F6. KPI CARDS — render
   ============================================================================= */

function facRenderKPIs() {
  const list = FAC_DATA;
  const total   = list.length;
  const active  = list.filter(f => (f.status || 'Active') === 'Active').length;
  const onLeave = list.filter(f => f.status === 'On Leave').length;
  const depts   = new Set(list.map(f => f.department)).size;
  const loads   = list.map(f => f.courseLoad || 0).filter(n => n > 0);
  const avgLoad = loads.length
    ? (loads.reduce((a, b) => a + b, 0) / loads.length).toFixed(1)
    : '0';

  const set = (id, v) => { const el = _f$(`#${id}`); if (el) el.textContent = v; };

  set('fac-val-total',  total);
  set('fac-val-active', active);
  set('fac-val-leave',  onLeave);
  set('fac-val-load',   avgLoad);
  set('fac-dept-count', `${depts} department${depts !== 1 ? 's' : ''}`);

  const pctActive = total ? `${Math.round((active  / total) * 100)}%` : '—';
  const pctLeave  = total ? `${Math.round((onLeave / total) * 100)}%` : '—';

  set('fac-pct-active', pctActive);
  set('fac-pct-leave',  pctLeave);

  // Wire KPI card clicks → filter shortcuts
  const kpiActive = _f$('#fac-kpi-active');
  const kpiLeave  = _f$('#fac-kpi-leave');
  const kpiTotal  = _f$('#fac-kpi-total');

  if (kpiActive && !kpiActive._wired) {
    kpiActive.addEventListener('click', () => _facSetStatusFilter('Active'));
    kpiActive._wired = true;
  }
  if (kpiLeave && !kpiLeave._wired) {
    kpiLeave.addEventListener('click',  () => _facSetStatusFilter('On Leave'));
    kpiLeave._wired = true;
  }
  if (kpiTotal && !kpiTotal._wired) {
    kpiTotal.addEventListener('click',  () => _facSetStatusFilter('all'));
    kpiTotal._wired = true;
  }
}

function _facSetStatusFilter(status) {
  FAC.filter.status = status;
  FAC.page = 1;
  const sel = _f$('#fac-filter-status');
  if (sel) sel.value = status;
  facRenderList();
}


/* =============================================================================
   F7. DEPARTMENT DISTRIBUTION DONUT CHART (SVG)
   ============================================================================= */

function facRenderDonut() {
  const svg     = _f$('#fac-donut-svg');
  const legend  = _f$('#fac-donut-legend');
  const center  = _f$('#fac-donut-total');
  if (!svg || !legend) return;

  const list = FAC_DATA;
  const total = list.length;
  if (center) center.textContent = total;

  // Count by dept
  const counts = {};
  FAC.DEPARTMENTS.forEach(d => { counts[d] = 0; });
  list.forEach(f => { if (counts[f.department] !== undefined) counts[f.department]++; });

  const cx = 70, cy = 70, r = 54, gap = 3;
  const circ = 2 * Math.PI * r;

  // Remove old paths
  [...svg.children].filter(el => el.tagName !== 'defs').forEach(el => el.remove());

  // Background ring
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bg.setAttribute('cx', cx); bg.setAttribute('cy', cy); bg.setAttribute('r', r);
  bg.setAttribute('fill', 'none');
  bg.setAttribute('stroke', 'rgba(255,255,255,0.05)');
  bg.setAttribute('stroke-width', '18');
  svg.appendChild(bg);

  if (!total) {
    legend.innerHTML = '<span style="font-size:12px;color:var(--color-slate-400);">No faculty data</span>';
    return;
  }

  let offset = 0;
  const legendItems = [];

  FAC.DEPARTMENTS.forEach(dept => {
    const count = counts[dept] || 0;
    if (!count) return;

    const pct   = count / total;
    const dash  = (pct * circ) - gap;
    const color = FAC.DEPT_CHART_COLOR[dept] || '#8BA3BC';

    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    arc.setAttribute('cx', cx);
    arc.setAttribute('cy', cy);
    arc.setAttribute('r', r);
    arc.setAttribute('fill', 'none');
    arc.setAttribute('stroke', color);
    arc.setAttribute('stroke-width', '18');
    arc.setAttribute('stroke-dasharray', `${dash} ${circ - dash}`);
    arc.setAttribute('stroke-dashoffset', -offset + (circ * 0.25));
    arc.setAttribute('stroke-linecap', 'round');
    arc.style.filter = `drop-shadow(0 0 4px ${color}60)`;
    arc.style.transition = 'stroke-dasharray 0.8s ease';
    arc.appendChild(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'title'), {
      textContent: `${dept}: ${count} (${Math.round(pct * 100)}%)`,
    }));
    svg.appendChild(arc);

    offset += pct * circ;
    legendItems.push({ dept, count, pct: Math.round(pct * 100), color });
  });

  legend.innerHTML = legendItems.map(item => `
    <div style="display:flex;align-items:center;gap:10px;
                padding:10px 14px;border-radius:var(--radius-md);
                background:rgba(255,255,255,0.02);
                border:1px solid rgba(139,163,188,0.10);
                transition:border-color .15s,background .15s;cursor:pointer;"
         class="fac-legend-item"
         data-dept="${_facEsc(item.dept)}"
         role="button" tabindex="0"
         aria-label="Filter by ${item.dept}">
      <div style="width:10px;height:10px;border-radius:50%;flex-shrink:0;
                  background:${item.color};
                  box-shadow:0 0 6px ${item.color}80;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;color:var(--color-white);
                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${_facEsc(item.dept)}
        </div>
      </div>
      <div style="font-family:var(--font-mono);font-size:13px;font-weight:500;
                  color:${item.color};">${item.count}</div>
      <div style="font-size:11px;color:var(--color-slate-400);
                  min-width:28px;text-align:right;">${item.pct}%</div>
    </div>
  `).join('');

  // Wire legend clicks → dept filter
  _f$$('.fac-legend-item', legend).forEach(item => {
    const dept = item.dataset.dept;
    item.addEventListener('click', () => {
      FAC.filter.dept = dept;
      FAC.page = 1;
      const sel = _f$('#fac-filter-dept');
      if (sel) sel.value = dept;
      facRenderList();
    });
    item.addEventListener('mouseenter', () => {
      item.style.background   = 'rgba(255,255,255,0.05)';
      item.style.borderColor  = 'rgba(139,163,188,0.22)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background   = 'rgba(255,255,255,0.02)';
      item.style.borderColor  = 'rgba(139,163,188,0.10)';
    });
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); item.click(); }
    });
  });
}


/* =============================================================================
   F8. FACULTY GRID VIEW — card tiles
   ============================================================================= */

function facRenderGrid(list) {
  const grid      = _f$('#fac-grid');
  const emptyEl   = _f$('#fac-grid-empty');
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  grid.innerHTML = list.map(f => {
    const initial = initials(f.name);
    const status = f.status || 'Active';
    const statusBadge = FAC.STATUS_BADGE[status] || 'badge--success';
    const load = f.courseLoad || 0;

    return `
      <div class="card fac-card" data-id="${f.id}"
           style="transition:transform .2s,box-shadow .2s;cursor:default;padding:0;overflow:hidden;">

        <div style="padding:18px 20px 14px;">

          <!-- Avatar + Name + Status -->
          <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
            <div style="width:44px;height:44px;border-radius:50%;flex-shrink:0;
                        background:rgba(229,57,53,0.1);
                        border:2px solid rgba(229,57,53,0.25);
                        display:flex;align-items:center;justify-content:center;
                        font-size:16px;font-weight:700;color:#ef4444;
                        font-family:var(--font-ui);">
              ${initial}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div>
                  <div style="font-size:15px;font-weight:700;color:var(--color-white);line-height:1.3;">
                    ${_facEsc(f.name)}
                  </div>
                  <div style="font-size:12px;color:var(--color-slate-400);margin-top:2px;">
                    ${_facEsc(f.designation || '')}
                  </div>
                </div>
                <span class="badge ${statusBadge}" style="flex-shrink:0;">${_facEsc(status)}</span>
              </div>
            </div>
          </div>

          <!-- Department + Load -->
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding-top:12px;border-top:1px solid var(--color-border);">
            <div style="display:flex;gap:16px;font-size:12px;color:var(--color-slate-400);">
              <span><i class="fas fa-building-columns" style="margin-right:4px;"></i>${_facEsc(f.department)}</span>
              <span><i class="fas fa-book" style="margin-right:4px;"></i>Load: ${load}</span>
            </div>
            <button class="fac-btn-edit" data-id="${f.id}" data-roles="admin"
                    style="display:flex;align-items:center;gap:5px;
                           padding:5px 12px;border-radius:6px;
                           background:none;border:1px solid rgba(229,57,53,0.25);
                           color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;
                           transition:all 0.15s;font-family:var(--font-ui);">
              <i class="fas fa-pen" style="font-size:10px;"></i> Edit
            </button>
          </div>

        </div>
      </div>
    `;
  }).join('');

  // Card hover lift
  _f$$('.fac-card', grid).forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transform   = 'translateY(-3px)';
      card.style.boxShadow   = '0 4px 20px rgba(0,0,0,0.25)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform   = '';
      card.style.boxShadow   = '';
    });
  });

  // Edit button click
  _f$$('.fac-btn-edit', grid).forEach(btn => {
    btn.addEventListener('click', () => facOpenEditModal(btn.dataset.id));
  });
}


/* =============================================================================
   F9. FACULTY TABLE VIEW — data table with pagination
   ============================================================================= */

function facRenderTable(list) {
  const tbody    = _f$('#fac-tbody');
  const emptyEl  = _f$('#fac-table-empty');
  const subtitle = _f$('#fac-table-subtitle');
  const pgInfo   = _f$('#fac-pg-info');
  const pgBtns   = _f$('#fac-pg-btns');
  if (!tbody) return;

  const total  = list.length;
  const pages  = Math.max(1, Math.ceil(total / FAC.ROWS_PER_PAGE));
  if (FAC.page > pages) FAC.page = 1;

  const start = (FAC.page - 1) * FAC.ROWS_PER_PAGE;
  const end   = Math.min(start + FAC.ROWS_PER_PAGE, total);
  const page  = list.slice(start, end);

  if (subtitle) subtitle.textContent = total ? `${total} faculty member${total !== 1 ? 's' : ''}` : 'No results';
  if (pgInfo)   pgInfo.textContent   = total ? `Showing ${start + 1}–${end} of ${total}` : '';

  if (!total) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    if (pgBtns)  pgBtns.innerHTML = '';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = page.map(f => {
    const color = FAC.DEPT_COLOR[f.department] || 'var(--color-slate-400)';
    return `
      <tr class="fac-table-row" data-id="${f.id}">
        <td>
          <div class="table-cell-user">
            <div class="table-avatar"
                 style="background:${color}16;border:1px solid ${color}36;color:${color};"
                 aria-hidden="true">
              ${initials(f.name)}
            </div>
            <div>
              <div class="table-cell-user__name">
                ${_facEsc(f.title)} ${_facEsc(f.name)}
              </div>
              <div class="table-cell-user__id">
                ${_facEsc(f.email)}
              </div>
            </div>
          </div>
        </td>
        <td><span class="table-id">${_facEsc(f.employeeId)}</span></td>
        <td style="font-size:12px;color:var(--color-slate-300);">
          ${_facEsc(f.department)}
        </td>
        <td style="font-size:12px;color:var(--color-white-soft);">
          ${_facEsc(f.designation)}
        </td>
        <td style="font-size:11.5px;color:var(--color-slate-400);
                   max-width:160px;overflow:hidden;text-overflow:ellipsis;
                   white-space:nowrap;"
            title="${_facEsc(f.specialisation || '')}">
          ${_facEsc(f.specialisation || '—')}
        </td>
        <td style="text-align:center;font-family:var(--font-mono);font-size:12px;">
          ${f.courseLoad}
        </td>
        <td style="font-size:12px;color:var(--color-slate-400);white-space:nowrap;">
          ${f.joiningDate ? formatDate(new Date(f.joiningDate + 'T00:00:00')) : '—'}
        </td>
        <td style="text-align:center;">
          <span class="badge ${FAC.STATUS_BADGE[f.status] || 'badge--info'}">
            ${_facEsc(f.status)}
          </span>
        </td>
        <td>
          <div style="display:flex;gap:4px;align-items:center;">
            <button class="fac-btn-view card-action-btn" data-id="${f.id}"
                    title="View profile" aria-label="View ${_facEsc(f.name)}">
              <i class="fas fa-eye" aria-hidden="true"></i>
            </button>
            <button data-roles="admin" class="fac-btn-edit card-action-btn" data-id="${f.id}"
                    title="Edit" aria-label="Edit ${_facEsc(f.name)}">
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
            <button class="fac-btn-delete" data-id="${f.id}" data-roles="admin"
                    title="Delete" aria-label="Delete ${_facEsc(f.name)}"
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
  }).join('');

  // Row hover
  _f$$('.fac-table-row', tbody).forEach(row => {
    row.addEventListener('mouseenter', () => row.style.background = 'rgba(255,255,255,0.025)');
    row.addEventListener('mouseleave', () => row.style.background = '');
  });

  // Button actions
  _f$$('.fac-btn-view', tbody).forEach(btn => {
    btn.addEventListener('click', () => facOpenViewModal(btn.dataset.id));
  });
  _f$$('.fac-btn-edit', tbody).forEach(btn => {
    btn.addEventListener('click', () => facOpenEditModal(btn.dataset.id));
  });
  _f$$('.fac-btn-delete', tbody).forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(242,95,92,0.20)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(242,95,92,0.08)');
    btn.addEventListener('click', () => {
      const f = facGet(btn.dataset.id);
      facOpenDeleteModal(btn.dataset.id, f ? `${f.title} ${f.name}` : 'this faculty member');
    });
  });

  // Pagination
  _facRenderPagination(pgBtns, pages);
}

function _facRenderPagination(container, totalPages) {
  if (!container) return;
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const bs = (active) => `
    min-width:30px;height:30px;border-radius:var(--radius-sm);
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:600;cursor:pointer;padding:0 6px;
    font-family:var(--font-mono);
    border:1px solid ${active ? 'rgba(0,212,255,0.35)' : 'rgba(139,163,188,0.18)'};
    background:${active ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)'};
    color:${active ? 'var(--color-cyan-400)' : 'var(--color-slate-300)'};
    transition:background .12s;
  `;

  const prev = document.createElement('button');
  prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
  prev.style.cssText = bs(false);
  prev.disabled = FAC.page === 1;
  if (FAC.page > 1) {
    prev.addEventListener('click', () => { FAC.page--; facRenderList(); });
    prev.addEventListener('mouseenter', () => prev.style.background = 'rgba(255,255,255,0.08)');
    prev.addEventListener('mouseleave', () => prev.style.background = 'rgba(255,255,255,0.03)');
  }
  container.appendChild(prev);

  const maxP = 5;
  let s = Math.max(1, FAC.page - 2);
  let e = Math.min(totalPages, s + maxP - 1);
  s = Math.max(1, e - maxP + 1);

  for (let p = s; p <= e; p++) {
    const pb = document.createElement('button');
    pb.textContent = String(p);
    pb.style.cssText = bs(p === FAC.page);
    if (p !== FAC.page) {
      pb.addEventListener('click', () => { FAC.page = p; facRenderList(); });
      pb.addEventListener('mouseenter', () => pb.style.background = 'rgba(255,255,255,0.08)');
      pb.addEventListener('mouseleave', () => pb.style.background = 'rgba(255,255,255,0.03)');
    }
    container.appendChild(pb);
  }

  const next = document.createElement('button');
  next.innerHTML = '<i class="fas fa-chevron-right"></i>';
  next.style.cssText = bs(false);
  next.disabled = FAC.page === totalPages;
  if (FAC.page < totalPages) {
    next.addEventListener('click', () => { FAC.page++; facRenderList(); });
    next.addEventListener('mouseenter', () => next.style.background = 'rgba(255,255,255,0.08)');
    next.addEventListener('mouseleave', () => next.style.background = 'rgba(255,255,255,0.03)');
  }
  container.appendChild(next);
}


/* =============================================================================
   F10. CONTROLS — search, filters, view toggle, export
   ============================================================================= */

function facInitControls() {
  // Search
  const searchInput = _f$('#fac-search-input');
  const searchWrap  = _f$('#fac-search-wrap');

  if (searchInput) {
    searchInput.addEventListener('input', debounce(e => {
      FAC.filter.query = e.target.value.trim();
      FAC.page = 1;
      facRenderList();
    }, CMS.config.searchDebounce));
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

  // Status filter
  const statusSel = _f$('#fac-filter-status');
  if (statusSel) {
    statusSel.addEventListener('change', e => {
      FAC.filter.status = e.target.value;
      FAC.page = 1;
      facRenderList();
    });
    _facStyleSelect(statusSel);
  }

  // Dept filter
  const deptSel = _f$('#fac-filter-dept');
  if (deptSel) {
    deptSel.addEventListener('change', e => {
      FAC.filter.dept = e.target.value;
      FAC.page = 1;
      facRenderList();
    });
    _facStyleSelect(deptSel);
  }

  // Sort
  const sortSel = _f$('#fac-sort');
  if (sortSel) {
    sortSel.addEventListener('change', e => {
      FAC.filter.sort = e.target.value;
      FAC.page = 1;
      facRenderList();
    });
    _facStyleSelect(sortSel);
  }

  // View toggle
  const btnGrid  = _f$('#fac-view-grid');
  const btnTable = _f$('#fac-view-table');

  if (btnGrid) {
    btnGrid.addEventListener('click', () => {
      FAC.viewMode = 'grid';
      _facApplyViewToggle();
      facRenderList();
    });
  }
  if (btnTable) {
    btnTable.addEventListener('click', () => {
      FAC.viewMode = 'table';
      _facApplyViewToggle();
      facRenderList();
    });
  }

  // Export
  const exportBtn = _f$('#btn-fac-export');
  if (exportBtn) {
    exportBtn.addEventListener('click', facExportCSV);
    exportBtn.addEventListener('mouseenter', () => exportBtn.style.background = 'rgba(255,255,255,0.08)');
    exportBtn.addEventListener('mouseleave', () => exportBtn.style.background = 'rgba(255,255,255,0.03)');
  }

  // Add Faculty button
  const addBtn = _f$('#btn-fac-add');
  if (addBtn) {
    addBtn.addEventListener('click', facOpenAddModal);
    addBtn.addEventListener('mouseenter', () => {
      addBtn.style.background = 'rgba(229,57,53,0.2)';
      addBtn.style.borderColor = 'rgba(229,57,53,0.5)';
      addBtn.style.boxShadow  = '0 0 16px rgba(229,57,53,0.15)';
    });
    addBtn.addEventListener('mouseleave', () => {
      addBtn.style.background = 'rgba(229,57,53,0.1)';
      addBtn.style.borderColor = 'rgba(229,57,53,0.3)';
      addBtn.style.boxShadow  = 'none';
    });
  }

  // Empty-state add button
  const emptyAdd = _f$('#btn-fac-empty-add');
  if (emptyAdd) emptyAdd.addEventListener('click', facOpenAddModal);
}

function _facApplyViewToggle() {
  const gridView  = _f$('#fac-grid-view');
  const tableView = _f$('#fac-table-view');
  const btnGrid   = _f$('#fac-view-grid');
  const btnTable  = _f$('#fac-view-table');

  const isGrid = FAC.viewMode === 'grid';

  if (gridView)  gridView.style.display  = isGrid ? '' : 'none';
  if (tableView) tableView.style.display = isGrid ? 'none' : '';

  if (btnGrid) {
    btnGrid.style.background = isGrid ? 'rgba(0,212,255,0.10)' : 'rgba(255,255,255,0.03)';
    btnGrid.style.color      = isGrid ? 'var(--color-cyan-400)' : 'var(--color-slate-400)';
  }
  if (btnTable) {
    btnTable.style.background = isGrid ? 'rgba(255,255,255,0.03)' : 'rgba(0,212,255,0.10)';
    btnTable.style.color      = isGrid ? 'var(--color-slate-400)' : 'var(--color-cyan-400)';
  }
}

function _facStyleSelect(sel) {
  sel.addEventListener('focus', () => {
    sel.style.borderColor = 'rgba(0,212,255,0.35)';
    sel.style.boxShadow   = '0 0 0 3px rgba(0,212,255,0.08)';
  });
  sel.addEventListener('blur', () => {
    sel.style.borderColor = 'rgba(139,163,188,0.18)';
    sel.style.boxShadow   = 'none';
  });
}


/* =============================================================================
   F11. ADD MODAL
   ============================================================================= */

function facOpenAddModal() {
  const modal = Modal.create({
    id:         'modal-fac-add',
    title:      'Add New Faculty Member',
    size:       'lg',
    bodyHTML:   _facBuildForm(null),
    footerHTML: `
      <button id="btn-fac-cancel"
        style="${_facBtnStyle('ghost')}">Cancel</button>
      <button id="btn-fac-save"
        style="${_facBtnStyle('danger')}">
        <i class="fas fa-user-plus" aria-hidden="true"></i> Add Faculty
      </button>
    `,
  });

  modal.open();
  _facAttachInputFocus(modal.body());

  modal.footer().querySelector('#btn-fac-cancel')
    .addEventListener('click', () => modal.close());

  const saveBtn = modal.footer().querySelector('#btn-fac-save');
  _facHoverBtn(saveBtn, 'danger');
  saveBtn.addEventListener('click', async () => {
    const form = modal.body().querySelector('#fac-form');
    if (!_facValidate(form)) return;
    const data    = _facCollect(form);
    const faculty = await facAdd(data);
    if (!faculty) return;
    modal.close();
    facRenderAll();
    facSyncStatCard();
    Toast.show(
      `<strong>${faculty.title} ${faculty.name}</strong> added to faculty directory`,
      'success'
    );
  });
}


/* =============================================================================
   F12. EDIT MODAL
   ============================================================================= */

function facOpenEditModal(id) {
  const f = facGet(id);
  if (!f) { Toast.show('Faculty record not found', 'danger'); return; }

  const modal = Modal.create({
    id:         'modal-fac-edit',
    title:      `Edit — ${f.title} ${f.name}`,
    size:       'lg',
    bodyHTML:   _facBuildForm(f),
    footerHTML: `
      <button id="btn-fac-del"
        style="${_facBtnStyle('danger')};margin-right:auto;">
        <i class="fas fa-trash-can" aria-hidden="true"></i> Delete
      </button>
      <button id="btn-fac-cancel"
        style="${_facBtnStyle('ghost')}">Cancel</button>
      <button id="btn-fac-save"
        style="${_facBtnStyle('primary')}">
        <i class="fas fa-floppy-disk" aria-hidden="true"></i> Save Changes
      </button>
    `,
  });

  modal.open();
  _facAttachInputFocus(modal.body());

  modal.footer().querySelector('#btn-fac-cancel')
    .addEventListener('click', () => modal.close());

  modal.footer().querySelector('#btn-fac-del')
    .addEventListener('click', () => {
      modal.close();
      facOpenDeleteModal(id, `${f.title} ${f.name}`);
    });

  const saveBtn = modal.footer().querySelector('#btn-fac-save');
  _facHoverBtn(saveBtn, 'primary');
  saveBtn.addEventListener('click', async () => {
    const form = modal.body().querySelector('#fac-form');
    if (!_facValidate(form)) return;
    const data    = _facCollect(form);
    const updated = await facUpdate(id, data);
    if (!updated) return;
    if (!updated) { Toast.show('Update failed — record not found', 'danger'); return; }
    modal.close();
    facRenderAll();
    facSyncStatCard();
    Toast.show(`<strong>${updated.title} ${updated.name}</strong> updated`, 'success');
  });
}


/* =============================================================================
   F13. VIEW (PROFILE) MODAL
   ============================================================================= */

function facOpenViewModal(id) {
  const f = facGet(id);
  if (!f) { Toast.show('Faculty record not found', 'danger'); return; }

  const color     = FAC.DEPT_COLOR[f.department]   || 'var(--color-slate-400)';
  const statusC   = FAC.STATUS_COLOR[f.status]      || 'var(--color-slate-400)';
  const statusBdg = FAC.STATUS_BADGE[f.status]      || 'badge--info';

  const row = (icon, label, value, accent = false) => value ? `
    <div style="display:flex;align-items:flex-start;gap:12px;
                padding:9px 0;border-bottom:1px solid rgba(139,163,188,0.08);">
      <i class="${icon}" aria-hidden="true"
         style="width:16px;text-align:center;flex-shrink:0;margin-top:2px;
                font-size:12px;color:${accent ? color : 'var(--color-slate-400)'};"></i>
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;
                   letter-spacing:0.07em;color:var(--color-slate-400);
                   min-width:110px;flex-shrink:0;">${label}</span>
      <span style="font-size:13px;color:var(--color-white-soft);flex:1;">
        ${value}
      </span>
    </div>
  ` : '';

  const bodyHTML = `
    <!-- Hero header -->
    <div style="display:flex;align-items:center;gap:18px;margin-bottom:24px;
                padding:18px;border-radius:var(--radius-lg);
                background:linear-gradient(135deg,${color}12,rgba(255,255,255,0.02));
                border:1px solid ${color}28;">
      <div style="width:60px;height:60px;border-radius:50%;flex-shrink:0;
                  background:linear-gradient(135deg,${color}30,${color}10);
                  border:2px solid ${color}50;
                  display:flex;align-items:center;justify-content:center;
                  font-size:20px;font-weight:700;color:${color};
                  box-shadow:0 0 20px ${color}28;">
        ${initials(f.name)}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:19px;font-weight:700;color:#fff;
                    letter-spacing:-0.01em;line-height:1.2;">
          ${_facEsc(f.title)} ${_facEsc(f.name)}
        </div>
        <div style="font-size:13px;color:${color};font-weight:600;margin-top:4px;">
          ${_facEsc(f.designation)}
        </div>
        <div style="font-size:12px;color:var(--color-slate-400);margin-top:2px;">
          ${_facEsc(f.department)}
          &nbsp;·&nbsp;
          <span style="font-family:var(--font-mono);">${_facEsc(f.employeeId)}</span>
        </div>
      </div>
      <span class="badge ${statusBdg}" style="align-self:flex-start;flex-shrink:0;">
        ${_facEsc(f.status)}
      </span>
    </div>

    <!-- Stats strip -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px;">
      <div style="text-align:center;padding:12px 8px;
                  background:rgba(0,212,255,0.06);
                  border:1px solid rgba(0,212,255,0.14);
                  border-radius:var(--radius-md);">
        <div style="font-family:var(--font-mono);font-size:22px;font-weight:500;
                    color:var(--color-cyan-400);line-height:1;">
          ${f.courseLoad}
        </div>
        <div style="font-size:10px;color:var(--color-slate-400);
                    text-transform:uppercase;letter-spacing:0.07em;margin-top:4px;">
          Courses
        </div>
      </div>
      <div style="text-align:center;padding:12px 8px;
                  background:rgba(129,140,248,0.06);
                  border:1px solid rgba(129,140,248,0.14);
                  border-radius:var(--radius-md);">
        <div style="font-family:var(--font-mono);font-size:22px;font-weight:500;
                    color:var(--color-info);line-height:1;">
          ${f.joiningDate
            ? Math.floor((Date.now() - new Date(f.joiningDate + 'T00:00:00').getTime())
                         / (365.25 * 24 * 3600 * 1000))
            : '—'}
        </div>
        <div style="font-size:10px;color:var(--color-slate-400);
                    text-transform:uppercase;letter-spacing:0.07em;margin-top:4px;">
          Yrs Service
        </div>
      </div>
      <div style="text-align:center;padding:12px 8px;
                  background:${color}08;border:1px solid ${color}20;
                  border-radius:var(--radius-md);">
        <div style="font-size:11px;font-weight:700;color:${color};
                    line-height:1.3;word-break:break-word;">
          ${_facEsc(f.gender || '—')}
        </div>
        <div style="font-size:10px;color:var(--color-slate-400);
                    text-transform:uppercase;letter-spacing:0.07em;margin-top:4px;">
          Gender
        </div>
      </div>
    </div>

    <!-- Detail rows — two columns -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px;">
      <div>
        ${row('fas fa-envelope',     'Email',          `<a href="mailto:${_facEsc(f.email)}" style="color:var(--color-cyan-400);">${_facEsc(f.email)}</a>`, true)}
        ${row('fas fa-phone',        'Phone',          f.phone)}
        ${row('fas fa-cake-candles', 'Date of Birth',  f.dob ? formatDate(new Date(f.dob + 'T00:00:00')) : '')}
        ${row('fas fa-calendar-plus','Joining Date',   f.joiningDate ? formatDate(new Date(f.joiningDate + 'T00:00:00')) : '')}
        ${row('fas fa-door-open',    'Office Room',    f.officeRoom)}
      </div>
      <div>
        ${row('fas fa-flask',        'Specialisation', f.specialisation,  true)}
        ${row('fas fa-graduation-cap','Qualifications',f.qualifications)}
        ${row('fas fa-location-dot', 'Address',        f.address)}
        ${row('fas fa-clock',        'Last Updated',   formatDate(new Date(f.updatedAt)))}
      </div>
    </div>
  `;

  const modal = Modal.create({
    id:         'modal-fac-view',
    title:      'Faculty Profile',
    size:       'lg',
    bodyHTML,
    footerHTML: `
      <button id="btn-fac-view-edit"
        style="${_facBtnStyle('primary')}">
        <i class="fas fa-pen" aria-hidden="true"></i> Edit Profile
      </button>
      <button id="btn-fac-view-close"
        style="${_facBtnStyle('ghost')}">Close</button>
    `,
  });

  modal.open();

  modal.footer().querySelector('#btn-fac-view-close')
    .addEventListener('click', () => modal.close());

  modal.footer().querySelector('#btn-fac-view-edit')
    .addEventListener('click', () => {
      modal.close();
      setTimeout(() => facOpenEditModal(id), 280);
    });
}


/* =============================================================================
   F14. DELETE CONFIRMATION MODAL
   ============================================================================= */

function facOpenDeleteModal(id, displayName) {
  const modal = Modal.create({
    id:       'modal-fac-delete',
    title:    'Delete Faculty Member',
    size:     'sm',
    bodyHTML: `
      <div style="text-align:center;padding:8px 0 4px;">
        <div style="width:56px;height:56px;border-radius:50%;
                    background:rgba(242,95,92,0.12);
                    border:2px solid rgba(242,95,92,0.30);
                    display:flex;align-items:center;justify-content:center;
                    margin:0 auto 16px;font-size:22px;
                    color:var(--color-danger);">
          <i class="fas fa-user-minus" aria-hidden="true"></i>
        </div>
        <p style="font-size:15px;font-weight:600;color:#fff;margin-bottom:8px;">
          Remove <span style="color:var(--color-danger);">${_facEsc(displayName)}</span>?
        </p>
        <p style="font-size:13px;color:var(--color-slate-400);line-height:1.6;">
          This will permanently delete the faculty record and all<br>
          associated data. This action cannot be undone.
        </p>
      </div>
    `,
    footerHTML: `
      <button id="btn-fac-del-cancel"
        style="${_facBtnStyle('ghost')};flex:1;">Cancel</button>
      <button id="btn-fac-del-confirm"
        style="${_facBtnStyle('danger')};flex:1;">
        <i class="fas fa-user-minus" aria-hidden="true"></i> Yes, Remove
      </button>
    `,
  });

  modal.open();

  modal.footer().querySelector('#btn-fac-del-cancel')
    .addEventListener('click', () => modal.close());

  const confirmBtn = modal.footer().querySelector('#btn-fac-del-confirm');
  _facHoverBtn(confirmBtn, 'danger');
  confirmBtn.addEventListener('click', async () => {
    const ok = facDelete(id);
    modal.close();
    if (ok) {
      facRenderAll();
      facSyncStatCard();
      Toast.show(`<strong>${_facEsc(displayName)}</strong> removed from faculty directory`, 'danger');
    } else {
      Toast.show('Delete failed — record not found', 'warning');
    }
  });
}


/* =============================================================================
   F15. FORM BUILDER — shared HTML, validation, collection
   ============================================================================= */

const _IS = `
  width:100%;padding:9px 12px;
  background:var(--color-navy-800);
  border:1px solid var(--color-border);
  border-radius:var(--radius-sm,6px);
  color:var(--color-white);
  font-family:var(--font-ui,'DM Sans',sans-serif);
  font-size:14px;outline:none;
  transition:border-color .15s,box-shadow .15s;
`;

const _LS = `
  display:block;margin-bottom:6px;
  font-size:12px;font-weight:700;
  letter-spacing:0.05em;text-transform:uppercase;
  color:rgba(255,255,255,0.9);
`;

const _FW = 'margin-bottom:16px;';

function _facBuildForm(f = null) {
  const v = f || {};

  const opt = (arr, cur, placeholder = '') =>
    (placeholder ? `<option value="" ${!cur ? 'selected' : ''} disabled>${placeholder}</option>` : '') +
    arr.map(x => `<option value="${_facEsc(x)}" ${cur === x ? 'selected' : ''}>${_facEsc(x)}</option>`).join('');

  return `
  <form id="fac-form" novalidate autocomplete="off">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 18px;">

      <!-- Title + Full Name -->
      <div style="${_FW}">
        <label style="${_LS}">Title &amp; Full Name *</label>
        <div style="display:flex;gap:8px;">
          <select id="ff-title" name="title"
            style="${_IS}width:auto;min-width:72px;flex-shrink:0;cursor:pointer;">
            ${opt(FAC.TITLES, v.title || 'Dr.')}
          </select>
          <input id="ff-name" name="name" type="text" required
            placeholder="e.g. Neha Gupta"
            value="${_facEsc(v.name || '')}"
            style="${_IS}flex:1;" />
        </div>
        <div class="field-error"
             style="color:var(--color-danger);font-size:11px;margin-top:4px;display:none;"></div>
      </div>

      <!-- Email -->
      <div style="${_FW}">
        <label for="ff-email" style="${_LS}">Email Address *</label>
        <input id="ff-email" name="email" type="email" required
          placeholder="faculty@nims.edu"
          value="${_facEsc(v.email || '')}"
          style="${_IS}" />
        <div class="field-error"
             style="color:var(--color-danger);font-size:11px;margin-top:4px;display:none;"></div>
      </div>

      <!-- Phone -->
      <div style="${_FW}">
        <label for="ff-phone" style="${_LS}">Phone</label>
        <input id="ff-phone" name="phone" type="tel"
          placeholder="+91 98765 43210"
          value="${_facEsc(v.phone || '')}"
          style="${_IS}" />
      </div>

      <!-- Gender -->
      <div style="${_FW}">
        <label for="ff-gender" style="${_LS}">Gender</label>
        <select id="ff-gender" name="gender"
          style="${_IS}cursor:pointer;">
          ${opt(['Male','Female','Non-binary','Prefer not to say'], v.gender || 'Prefer not to say')}
        </select>
      </div>

      <!-- Date of Birth -->
      <div style="${_FW}">
        <label for="ff-dob" style="${_LS}">Date of Birth</label>
        <input id="ff-dob" name="dob" type="date"
          value="${_facEsc(v.dob || '')}"
          style="${_IS}" />
      </div>

      <!-- Joining Date -->
      <div style="${_FW}">
        <label for="ff-joining" style="${_LS}">Joining Date</label>
        <input id="ff-joining" name="joiningDate" type="date"
          value="${_facEsc(v.joiningDate || new Date().toISOString().slice(0,10))}"
          style="${_IS}" />
      </div>

      <!-- Department -->
      <div style="${_FW}">
        <label for="ff-dept" style="${_LS}">Department *</label>
        <select id="ff-dept" name="department" required
          style="${_IS}cursor:pointer;">
          ${opt(FAC.DEPARTMENTS, v.department, 'Select department')}
        </select>
        <div class="field-error"
             style="color:var(--color-danger);font-size:11px;margin-top:4px;display:none;"></div>
      </div>

      <!-- Designation -->
      <div style="${_FW}">
        <label for="ff-designation" style="${_LS}">Designation *</label>
        <select id="ff-designation" name="designation" required
          style="${_IS}cursor:pointer;">
          ${opt(FAC.DESIGNATIONS, v.designation || 'Lecturer', 'Select designation')}
        </select>
        <div class="field-error"
             style="color:var(--color-danger);font-size:11px;margin-top:4px;display:none;"></div>
      </div>

      <!-- Specialisation -->
      <div style="${_FW}">
        <label for="ff-spec" style="${_LS}">Specialisation</label>
        <input id="ff-spec" name="specialisation" type="text"
          placeholder="e.g. Machine Learning & Deep Learning"
          value="${_facEsc(v.specialisation || '')}"
          style="${_IS}" />
      </div>

      <!-- Course Load -->
      <div style="${_FW}">
        <label for="ff-load" style="${_LS}">Course Load</label>
        <input id="ff-load" name="courseLoad" type="number"
          min="0" max="12"
          placeholder="0"
          value="${v.courseLoad !== undefined ? v.courseLoad : 0}"
          style="${_IS}" />
      </div>

      <!-- Status -->
      <div style="${_FW}">
        <label for="ff-status" style="${_LS}">Employment Status</label>
        <select id="ff-status" name="status"
          style="${_IS}cursor:pointer;">
          ${opt(FAC.STATUSES, v.status || 'Active')}
        </select>
      </div>

      <!-- Office Room -->
      <div style="${_FW}">
        <label for="ff-office" style="${_LS}">Office Room</label>
        <input id="ff-office" name="officeRoom" type="text"
          placeholder="e.g. CS-214"
          value="${_facEsc(v.officeRoom || '')}"
          style="${_IS}" />
      </div>

      <!-- Qualifications — full width -->
      <div style="${_FW}grid-column:1/-1;">
        <label for="ff-qual" style="${_LS}">Qualifications</label>
        <input id="ff-qual" name="qualifications" type="text"
          placeholder="e.g. Ph.D. IIT Delhi, M.Tech NIT Trichy"
          value="${_facEsc(v.qualifications || '')}"
          style="${_IS}" />
      </div>

      <!-- Address — full width -->
      <div style="${_FW}grid-column:1/-1;">
        <label for="ff-address" style="${_LS}">Address</label>
        <textarea id="ff-address" name="address" rows="2"
          placeholder="Street, City, State, PIN"
          style="${_IS}resize:vertical;">${_facEsc(v.address || '')}</textarea>
      </div>

    </div>
  </form>
  `;
}

function _facAttachInputFocus(container) {
  _f$$('input, select, textarea', container).forEach(el => {
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

function _facValidate(form) {
  // Clear previous errors
  _f$$('.field-error', form).forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });

  const errors = {};
  const name   = form.querySelector('#ff-name');
  const email  = form.querySelector('#ff-email');
  const dept   = form.querySelector('#ff-dept');
  const desig  = form.querySelector('#ff-designation');

  if (!name?.value.trim() || name.value.trim().length < 2)
    errors.name = 'Full name must be at least 2 characters';

  const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email?.value.trim() || !emailRx.test(email.value.trim()))
    errors.email = 'Enter a valid email address';

  if (!dept?.value)
    errors.dept = 'Please select a department';

  if (!desig?.value)
    errors.desig = 'Please select a designation';

  // Show error messages
  const fieldMap = [
    ['#ff-name',        'name',  name],
    ['#ff-email',       'email', email],
    ['#ff-dept',        'dept',  dept],
    ['#ff-designation', 'desig', desig],
  ];

  fieldMap.forEach(([, errKey, el]) => {
    if (errors[errKey] && el) {
      const errEl = el.tagName === 'SELECT'
        ? el.nextElementSibling
        : el.closest('div')?.querySelector('.field-error') || el.nextElementSibling;
      if (errEl && errEl.classList.contains('field-error')) {
        errEl.textContent   = errors[errKey];
        errEl.style.display = 'block';
        el.style.borderColor = 'rgba(242,95,92,0.50)';
      }
    }
  });

  return Object.keys(errors).length === 0;
}

function _facCollect(form) {
  return {
    title:          form.querySelector('#ff-title')?.value        || 'Dr.',
    name:           form.querySelector('#ff-name')?.value         || '',
    email:          form.querySelector('#ff-email')?.value        || '',
    phone:          form.querySelector('#ff-phone')?.value        || '',
    gender:         form.querySelector('#ff-gender')?.value       || '',
    dob:            form.querySelector('#ff-dob')?.value          || '',
    department:     form.querySelector('#ff-dept')?.value         || '',
    designation:    form.querySelector('#ff-designation')?.value  || '',
    specialisation: form.querySelector('#ff-spec')?.value         || '',
    qualifications: form.querySelector('#ff-qual')?.value         || '',
    joiningDate:    form.querySelector('#ff-joining')?.value      || '',
    status:         form.querySelector('#ff-status')?.value       || 'Active',
    courseLoad:     form.querySelector('#ff-load')?.value         || 0,
    officeRoom:     form.querySelector('#ff-office')?.value       || '',
    address:        form.querySelector('#ff-address')?.value      || '',
  };
}


/* =============================================================================
   F16. STAT CARD SYNC — update "Active Faculty" on dashboard
   ============================================================================= */

function facSyncStatCard() {
  const active  = FAC_DATA.filter(f => (f.status || 'Active') === 'Active').length;
  const statEl  = document.getElementById('stat-val-faculty');
  if (statEl) statEl.textContent = active;
}


/* =============================================================================
   F17. CSV EXPORT
   ============================================================================= */

function facExportCSV() {
  const list = facFiltered();
  if (!list.length) {
    Toast.show('No records to export', 'warning');
    return;
  }

  const headers = [
    'Employee ID', 'Title', 'Full Name', 'Email', 'Phone',
    'Gender', 'Date of Birth', 'Department', 'Designation',
    'Specialisation', 'Qualifications', 'Joining Date',
    'Status', 'Course Load', 'Office Room', 'Address',
  ];

  const rows = list.map(f => [
    f.employeeId, f.title, f.name, f.email, f.phone,
    f.gender, f.dob, f.department, f.designation,
    `"${(f.specialisation  || '').replace(/"/g, '""')}"`,
    `"${(f.qualifications  || '').replace(/"/g, '""')}"`,
    f.joiningDate, f.status, f.courseLoad, f.officeRoom,
    `"${(f.address         || '').replace(/"/g, '""')}"`,
  ].join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `faculty_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  Toast.show(
    `${list.length} faculty record${list.length !== 1 ? 's' : ''} exported as CSV`,
    'success'
  );
  logActivity(
    `Faculty CSV export — <strong>${list.length}</strong> records`,
    'info'
  );
}


/* =============================================================================
   HELPERS
   ============================================================================= */

function _facEsc(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Shared inline button styles */
function _facBtnStyle(variant) {
  const base = `
    display:inline-flex;align-items:center;gap:8px;
    padding:9px 20px;border-radius:var(--radius-sm,6px);
    font-family:var(--font-ui,'DM Sans',sans-serif);
    font-size:13px;font-weight:700;cursor:pointer;
    transition:background .15s,border-color .15s,box-shadow .15s;
  `;
  const variants = {
    primary: `${base}
      background:rgba(0,212,255,0.12);
      border:1px solid rgba(0,212,255,0.30);
      color:var(--color-cyan-400);`,
    ghost: `${base}
      background:rgba(255,255,255,0.08);
      border:1px solid rgba(255,255,255,0.2);
      color:var(--color-slate-300);`,
    danger: `${base}
      background:rgba(242,95,92,0.10);
      border:1px solid rgba(242,95,92,0.28);
      color:var(--color-danger);`,
  };
  return variants[variant] || variants.ghost;
}

/** Hover glow effect for modal buttons */
function _facHoverBtn(btn, variant) {
  if (!btn) return;
  const hoverStyles = {
    primary: ['rgba(0,212,255,0.22)', 'rgba(0,212,255,0.50)', '0 0 16px rgba(0,212,255,0.15)'],
    danger:  ['rgba(242,95,92,0.20)', 'rgba(242,95,92,0.45)', '0 0 14px rgba(242,95,92,0.15)'],
  };
  const [bg, bc, sh] = hoverStyles[variant] || [];
  if (!bg) return;
  btn.addEventListener('mouseenter', () => {
    btn.style.background   = bg;
    btn.style.borderColor  = bc;
    btn.style.boxShadow    = sh;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background   = '';
    btn.style.borderColor  = '';
    btn.style.boxShadow    = 'none';
  });
}


/* =============================================================================
   RENDER LIST — dispatch to grid or table
   ============================================================================= */

function facRenderList() {
  const list    = facFiltered();
  const infoEl  = _f$('#fac-result-info');

  if (infoEl) {
    infoEl.textContent = list.length
      ? `${list.length} faculty member${list.length !== 1 ? 's' : ''} found`
      : 'No faculty members match your filters';
  }

  if (FAC.viewMode === 'grid') {
    facRenderGrid(list);
  } else {
    facRenderTable(list);
  }
}

async function facRenderAll() {
  FAC_DATA = await facLoad();
  facRenderKPIs();
  facRenderList();
  facRenderDonut();
}


/* =============================================================================
   F18. INIT & AUTO-BOOT
   ============================================================================= */

const FacultyModule = {
  async init() {
    // 0. Skip initialization for students (they don't have access to faculty list)
    if (typeof Auth !== 'undefined' && Auth.getRole() === 'student') {
      console.info('[FacultyModule] Skipped initialization for student role');
      return;
    }

    // 1. Inject section HTML
    facInjectSection();

    // 2. Wire controls (search, filters, toggles, buttons)
    facInitControls();

    // 3. Hook NavModule routing
    facHookNav();

    // 4. Pre-render data (fetches from API)
    await facRenderAll();

    // 5. Sync dashboard stat card
    facSyncStatCard();

    console.info('[FacultyModule] Initialised — %d records', FAC_DATA.length);
  },

  // Public surface
  show:       facShow,
  hide:       facHide,
  renderAll:  facRenderAll,
  exportCSV:  facExportCSV,
  openAdd:    facOpenAddModal,
  hookNav:    facHookNav,
  syncStat:   facSyncStatCard,
};

/* Auto-boot: wait for app.js globals, then initialise */
(function boot() {
  function tryInit() {
    if (typeof CMS === 'undefined' || typeof Modal === 'undefined') {
      setTimeout(tryInit, 80);
      return;
    }
    FacultyModule.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();