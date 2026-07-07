/**
 * =============================================================================
 * MODULE: Courses
 * Matches the mobile app layout — card-based with department & semester chips
 * Uses real backend API via Auth.fetch (no localStorage)
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
      key === 'courses' ? crsShow() : crsHide();
    };

    if (window.location.hash === '#courses') {
      crsShow();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const _c$ = (sel, root = document) => root.querySelector(sel);
const _c$$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const CRS = {
  data: [],        // loaded courses (current page)
  faculties: [],   // all faculty for assignment
  filtered: [],    // courses to render (same as data now)
  activeDept: 'all',
  activeSem: 'all',
  searchQuery: '',
  currentPage: 1,
  totalPages: 1,
  totalCourses: 0,
  filterOptions: { departments: [], semesters: [] } // metadata from backend
};

function _crsEsc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function _crsInitials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/* ── Show / Hide ─────────────────────────────────────────────────────────── */
function crsShow() {
  crsInjectSection();
  const sec = _c$('#courses-section');
  if (sec) sec.style.display = '';
  crsRenderAll();
}

function crsHide() {
  const sec = _c$('#courses-section');
  if (sec) sec.style.display = 'none';
}

/* ── Section HTML ────────────────────────────────────────────────────────── */
function crsInjectSection() {
  if (_c$('#courses-section')) return;

  const section = document.createElement('section');
  section.id = 'courses-section';
  section.className = 'fade-in';
  section.style.display = 'none';

  section.innerHTML = `
    <h2 class="section-title">Courses</h2>
    <p style="color:var(--color-slate-400);font-size:13px;margin:-10px 0 20px;">Manage subjects and curriculum</p>

    <!-- Filters -->
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <select id="crs-dept-select" style="
        background:var(--color-surface);border:1px solid var(--color-border);
        color:var(--color-white-soft);padding:8px 12px;border-radius:6px;font-family:var(--font-ui);font-size:13px;outline:none;cursor:pointer;
      "></select>
      <select id="crs-sem-select" style="
        background:var(--color-surface);border:1px solid var(--color-border);
        color:var(--color-white-soft);padding:8px 12px;border-radius:6px;font-family:var(--font-ui);font-size:13px;outline:none;cursor:pointer;
      "></select>
    </div>

    <!-- Search + Actions -->
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:8px;
         background:var(--color-surface);
         border:1px solid var(--color-border);
         border-radius:var(--radius-md,10px);
         padding:0 12px;height:40px;flex:1;min-width:200px;">
      <i class="fas fa-search" style="color:var(--color-slate-400);font-size:13px;"></i>
      <input type="search" id="crs-search" placeholder="Search courses..."
        style="background:none;border:none;outline:none;
               color:var(--color-white);font-family:var(--font-ui);font-size:13px;flex:1;">
    </div>

      <input type="file" id="crs-file-upload" accept=".csv" style="display:none;">
      <div style="display:flex;gap:12px;">
        <button id="btn-crs-upload" data-roles="admin" style="
          padding:0 16px;height:38px;
          background:var(--color-surface);border:1px solid var(--color-border);
          border-radius:6px;color:var(--color-white-soft);font-weight:600;font-size:13px;
          cursor:pointer;
        "><i class="fas fa-file-csv" style="margin-right:6px;"></i> Upload CSV</button>

        <button id="btn-add-course" data-roles="admin" style="
          padding:0 18px;height:38px;
          background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.4);
          border-radius:6px;color:var(--color-cyan-400);font-weight:600;font-size:13px;
          cursor:pointer;
        "><i class="fas fa-plus" style="margin-right:6px;"></i> Add Course</button>
      </div>
    </div>

    <!-- Course Cards Container -->
    <div id="crs-cards-container" style="display:flex;flex-direction:column;gap:16px;"></div>

    <!-- Empty state -->
    <div id="crs-empty" style="display:none;text-align:center;padding:60px 24px;color:var(--color-slate-400);">
      <i class="fas fa-book-open" style="font-size:40px;margin-bottom:16px;display:block;opacity:0.28;"></i>
      <p style="font-size:15px;font-weight:600;color:var(--color-white-soft);margin-bottom:6px;">No courses found</p>
      <p style="font-size:13px;">Try adjusting your filters, or add a new course.</p>
    </div>
  `;

  const pageContent = _c$('#page-content');
  if (pageContent) pageContent.appendChild(section);

  // Wire events
  let searchTimeout;
  _c$('#crs-search', section).addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      CRS.searchQuery = e.target.value.toLowerCase();
      CRS.currentPage = 1;
      crsRenderAll(); // Fetch from server
    }, 400);
  });

  _c$('#btn-add-course', section).addEventListener('click', () => crsOpenModal());

  _c$('#btn-crs-upload', section).addEventListener('click', () => {
    _c$('#crs-file-upload', section).click();
  });

  _c$('#crs-file-upload', section).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = Auth.getToken();
      const r = await fetch('/api/courses/bulk-upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
      });
      const data = await r.json();
      if (data.success) {
        Toast.show(data.message || 'Courses uploaded!', 'success');
        crsRenderAll();
      } else {
        Toast.show(data.message || 'Upload failed', 'danger');
      }
    } catch (err) {
      Toast.show('Network error during upload', 'danger');
    }
    e.target.value = '';
  });
}

/* ── Fetch Data ──────────────────────────────────────────────────────────── */
async function crsLoad() {
  try {
    // Build query string for Server-Side Pagination
    let url = `/courses?page=${CRS.currentPage}&limit=100`;
    if (CRS.activeDept !== 'all') url += `&department=${encodeURIComponent(CRS.activeDept)}`;
    if (CRS.activeSem !== 'all') url += `&semester=${encodeURIComponent(CRS.activeSem)}`;
    if (CRS.searchQuery) url += `&search=${encodeURIComponent(CRS.searchQuery)}`;

    // Use Promise.all to fetch metadata, courses, and faculties
    const fetchPromises = [
      Auth.fetch(url),
      Auth.fetch('/faculty')
    ];
    
    // Only fetch filter options if we haven't yet, or occasionally
    if (CRS.filterOptions.departments.length === 0) {
      fetchPromises.push(Auth.fetch('/courses/filters'));
    }

    const responses = await Promise.all(fetchPromises);
    const crsRes = await responses[0].json();
    const facRes = await responses[1].json();

    if (responses.length > 2) {
      const filtersRes = await responses[2].json();
      if (filtersRes.success && filtersRes.data) {
        CRS.filterOptions = filtersRes.data;
        crsRenderDropdowns();
      }
    }

    if (crsRes.success && crsRes.data) {
      CRS.data = crsRes.data;
      CRS.filtered = crsRes.data; // Server-side handles filtering
      CRS.currentPage = crsRes.page;
      CRS.totalPages = crsRes.pages;
      CRS.totalCourses = crsRes.total;
    } else {
      CRS.data = [];
      CRS.filtered = [];
    }

    if (facRes.success && facRes.data) {
      CRS.faculties = facRes.data;
    }
  } catch (err) {
    console.error('Course/Faculty fetch error:', err);
    Toast.show('Failed to load courses', 'danger');
  }
}

/* ── Render All ──────────────────────────────────────────────────────────── */
async function crsRenderAll() {
  await crsLoad();
  crsRenderCards();
}

/* ── Render Department & Semester Dropdowns ──────────────────────────────── */
function crsRenderDropdowns() {
  // Department dropdown
  const deptSelect = _c$('#crs-dept-select');
  if (deptSelect) {
    const depts = CRS.filterOptions.departments || [];
    let deptHTML = `<option value="all" ${CRS.activeDept === 'all' ? 'selected' : ''}>All Departments</option>`;
    depts.forEach(d => {
      deptHTML += `<option value="${_crsEsc(d)}" ${CRS.activeDept === d ? 'selected' : ''}>${_crsEsc(d)}</option>`;
    });
    deptSelect.innerHTML = deptHTML;
    // We must overwrite the event listener to avoid stacking, or just use one
    // The easiest is cloning the node
    const newSelect = deptSelect.cloneNode(true);
    deptSelect.parentNode.replaceChild(newSelect, deptSelect);
    newSelect.addEventListener('change', (e) => {
      CRS.activeDept = e.target.value;
      CRS.currentPage = 1;
      crsRenderAll(); // Server fetch
    });
  }

  // Semester dropdown
  const semSelect = _c$('#crs-sem-select');
  if (semSelect) {
    const sems = CRS.filterOptions.semesters || [];
    // Sort semesters numerically if possible
    sems.sort((a,b) => {
      const nA = parseInt(a);
      const nB = parseInt(b);
      return (isNaN(nA) || isNaN(nB)) ? a.localeCompare(b) : nA - nB;
    });

    let semHTML = `<option value="all" ${CRS.activeSem === 'all' ? 'selected' : ''}>All Semesters</option>`;
    sems.forEach(s => {
      semHTML += `<option value="${_crsEsc(s)}" ${CRS.activeSem === s ? 'selected' : ''}>Semester ${_crsEsc(s)}</option>`;
    });
    semSelect.innerHTML = semHTML;

    // Use cloneNode to clear previous event listeners
    const newSemSelect = semSelect.cloneNode(true);
    semSelect.parentNode.replaceChild(newSemSelect, semSelect);
    newSemSelect.addEventListener('change', (e) => {
      CRS.activeSem = e.target.value;
      CRS.currentPage = 1;
      crsRenderAll(); // Server fetch
    });
  }
}

/* ── Render Course Cards ─────────────────────────────────────────────────── */
function crsRenderCards() {
  const container = _c$('#crs-cards-container');
  const emptyEl = _c$('#crs-empty');
  if (!container) return;

  if (CRS.filtered.length === 0) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Backend already handles limit, just render what we have
  let htmlStr = CRS.filtered.map(c => {
    // Find assigned faculty name
    let facName = 'Unassigned';
    if (c.facultyId) {
      const facId = typeof c.facultyId === 'object' ? (c.facultyId._id || c.facultyId) : c.facultyId;
      const fac = CRS.faculties.find(f => f.id === facId);
      if (fac) facName = fac.name;
      // If populated from backend
      if (typeof c.facultyId === 'object' && c.facultyId.name) {
        facName = c.facultyId.name;
      }
    }

    const codePrefix = c.courseCode ? `${_crsEsc(c.courseCode)}: ` : '';
    const statusClass = c.status === 'Active' ? 'badge--success' : 'badge--danger';

    return `
      <div class="crs-card card" style="padding:0;overflow:hidden;">
        <div style="padding:18px 20px 14px;display:flex;gap:14px;align-items:flex-start;">
          <!-- Icon -->
          <div style="width:44px;height:44px;border-radius:10px;
                      background:rgba(229,57,53,0.1);
                      display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i class="fas fa-book-open" style="color:#ef4444;font-size:18px;"></i>
          </div>
          <!-- Info -->
          <div style="flex:1;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
              <div>
                <div style="font-size:15px;font-weight:700;color:var(--color-white);line-height:1.3;">
                  ${codePrefix}${_crsEsc(c.name)}
                </div>
                <div style="font-size:12px;color:var(--color-slate-400);margin-top:3px;">
                  ${_crsEsc(c.department)} · Sem ${_crsEsc(c.semester || '—')}${c.section ? ` · Sec ${_crsEsc(c.section)}` : ''}
                </div>
              </div>
              <span class="badge ${statusClass}" style="flex-shrink:0;">${_crsEsc(c.status)}</span>
            </div>
          </div>
        </div>
        <!-- Bottom row -->
        <div style="padding:0 20px 14px;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;gap:16px;font-size:12px;color:var(--color-slate-400);">
            <span><i class="fas fa-users" style="margin-right:4px;"></i>${c.credits} Credits</span>
            <span><i class="fas fa-user" style="margin-right:4px;"></i>${_crsEsc(facName)}</span>
          </div>
          <div class="crs-card__actions" style="margin-top:16px; display:flex; gap:8px;">
            <button class="btn-crs-edit" data-id="${c.id}" data-roles="admin" style="
              flex:1; padding:8px; border-radius:6px;
              background:rgba(255,255,255,0.06); border:1px solid rgba(139,163,188,0.2);
              color:var(--color-slate-300); font-size:12.5px; font-weight:600; cursor:pointer;
            "><i class="fas fa-edit"></i> Edit / Assign</button>
            <button class="btn-crs-delete" data-id="${c.id}" data-roles="admin" style="
              padding:8px 12px; border-radius:6px;
              background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3);
              color:#EF4444; font-size:12.5px; font-weight:600; cursor:pointer;
            "><i class="fas fa-trash-alt"></i></button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Add Pagination Controls
  if (CRS.totalPages > 1) {
    htmlStr += `
      <div style="display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between; align-items:center; padding:16px; margin-top:20px; background:var(--color-surface); border-radius:10px; border:1px solid var(--color-border);">
        <button id="btn-crs-prev" ${CRS.currentPage === 1 ? 'disabled' : ''} style="
          padding:8px 16px; border-radius:6px; cursor:${CRS.currentPage === 1 ? 'not-allowed' : 'pointer'};
          background:${CRS.currentPage === 1 ? 'var(--color-border)' : 'var(--color-cyan-400)'};
          color:${CRS.currentPage === 1 ? 'var(--color-slate-400)' : '#FFFFFF'};
          border:none; font-weight:600; flex:1; min-width:80px;
        "><i class="fas fa-chevron-left"></i> Prev</button>
        
        <div style="color:var(--color-white-soft); font-size:14px; text-align:center; flex:2; min-width:120px;">
          Page <b style="color:var(--color-white);">${CRS.currentPage}</b> of <b style="color:var(--color-white);">${CRS.totalPages}</b> 
        </div>

        <button id="btn-crs-next" ${CRS.currentPage === CRS.totalPages ? 'disabled' : ''} style="
          padding:8px 16px; border-radius:6px; cursor:${CRS.currentPage === CRS.totalPages ? 'not-allowed' : 'pointer'};
          background:${CRS.currentPage === CRS.totalPages ? 'var(--color-border)' : 'var(--color-cyan-400)'};
          color:${CRS.currentPage === CRS.totalPages ? 'var(--color-slate-400)' : '#FFFFFF'};
          border:none; font-weight:600; flex:1; min-width:80px;
        ">Next <i class="fas fa-chevron-right"></i></button>
      </div>
    `;
  }

  container.innerHTML = htmlStr;

  // Wire pagination buttons
  const btnPrev = _c$('#btn-crs-prev', container);
  const btnNext = _c$('#btn-crs-next', container);
  if (btnPrev && !btnPrev.disabled) {
    btnPrev.addEventListener('click', () => {
      CRS.currentPage--;
      crsRenderAll(); // Fetch previous page
    });
  }
  if (btnNext && !btnNext.disabled) {
    btnNext.addEventListener('click', () => {
      CRS.currentPage++;
      crsRenderAll(); // Fetch next page
    });
  }

  // Wire actions
  _c$$('.btn-crs-edit', container).forEach(btn => {
    btn.addEventListener('click', () => crsOpenModal(btn.dataset.id));
  });
  _c$$('.btn-crs-delete', container).forEach(btn => {
    btn.addEventListener('click', () => crsOpenDelete(btn.dataset.id));
  });
}

/* ── Add / Edit Modal ────────────────────────────────────────────────────── */
async function crsOpenModal(id = null) {
  const isEdit = !!id;
  let c = { courseCode: '', name: '', department: '', semester: '', credits: 3, status: 'Active', facultyId: '' };
  if (isEdit) {
    const found = CRS.data.find(x => x.id === id);
    if (found) c = { ...found };
  }

  // Build faculty options
  let facultyOptions = '<option value="">— Unassigned —</option>';
  CRS.faculties.forEach(f => {
    const selected = (c.facultyId && (c.facultyId === f.id || (typeof c.facultyId === 'object' && c.facultyId._id === f.id))) ? 'selected' : '';
    facultyOptions += `<option value="${f.id}" ${selected}>${_crsEsc(f.name)} (${_crsEsc(f.department)})</option>`;
  });

  const bodyHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      <div class="form-group">
        <label class="form-label">Course Name *</label>
        <input type="text" id="crs-in-name" class="form-control" value="${_crsEsc(c.name)}" placeholder="e.g. Data Structures">
      </div>
      <div class="form-group">
        <label class="form-label">Course Code *</label>
        <input type="text" id="crs-in-code" class="form-control" value="${_crsEsc(c.courseCode)}" placeholder="e.g. CS201">
      </div>
      <div class="form-group">
        <label class="form-label">Department *</label>
        <input type="text" id="crs-in-dept" class="form-control" value="${_crsEsc(c.department)}" placeholder="e.g. Computer Science">
      </div>
      <div class="form-group">
        <label class="form-label">Semester *</label>
        <input type="text" id="crs-in-sem" class="form-control" value="${_crsEsc(c.semester)}" placeholder="e.g. 3">
      </div>
      <div class="form-group">
        <label class="form-label">Section</label>
        <select id="crs-in-section" class="form-control">
          <option value="" ${!c.section ? 'selected' : ''}>-- None --</option>
          <option value="A" ${c.section === 'A' ? 'selected' : ''}>Section A</option>
          <option value="B" ${c.section === 'B' ? 'selected' : ''}>Section B</option>
          <option value="C" ${c.section === 'C' ? 'selected' : ''}>Section C</option>
          <option value="D" ${c.section === 'D' ? 'selected' : ''}>Section D</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Credits</label>
        <input type="number" id="crs-in-credits" class="form-control" value="${c.credits || 3}" min="1" max="10">
      </div>
      <div class="form-group">
        <label class="form-label">Status</label>
        <select id="crs-in-status" class="form-control">
          <option value="Active" ${c.status === 'Active' ? 'selected' : ''}>Active</option>
          <option value="Inactive" ${c.status === 'Inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>
      <div class="form-group" style="grid-column:1/-1;">
        <label class="form-label">Assign Faculty</label>
        <select id="crs-in-faculty" class="form-control">
          ${facultyOptions}
        </select>
      </div>
    </div>
  `;

  const modal = Modal.create({
    id: 'modal-crs',
    title: isEdit ? 'Edit Course' : 'Add New Course',
    size: 'md',
    bodyHTML,
    footerHTML: `
      <button id="btn-crs-save" style="
        padding:9px 20px;border-radius:6px;
        background:var(--color-cyan-400);color:#fff;
        font-size:13px;font-weight:700;border:none;cursor:pointer;
      ">${isEdit ? 'Save Changes' : 'Add Course'}</button>
      <button id="btn-crs-cancel" style="
        padding:9px 20px;border-radius:6px;
        background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.22);
        color:var(--color-slate-300);font-size:13px;font-weight:600;cursor:pointer;
      ">Cancel</button>
    `
  });

  _c$('#btn-crs-cancel', modal.footer()).addEventListener('click', () => modal.close());
  _c$('#btn-crs-save', modal.footer()).addEventListener('click', async () => {
    const payload = {
      name: _c$('#crs-in-name').value.trim(),
      courseCode: _c$('#crs-in-code').value.trim(),
      department: _c$('#crs-in-dept').value.trim(),
      semester: _c$('#crs-in-sem').value.trim(),
      section: _c$('#crs-in-section').value,
      credits: parseInt(_c$('#crs-in-credits').value, 10),
      status: _c$('#crs-in-status').value,
      facultyId: _c$('#crs-in-faculty').value || null,
    };

    if (!payload.name || !payload.courseCode || !payload.department || !payload.semester) {
      Toast.show('Please fill all required fields', 'warning');
      return;
    }

    try {
      const url = isEdit ? '/courses/' + id : '/courses';
      const method = isEdit ? 'PUT' : 'POST';
      const raw = await Auth.fetch(url, {
        method,
        body: JSON.stringify(payload)
      });
      const res = await raw.json();
      if (res.success) {
        Toast.show(isEdit ? 'Course updated!' : 'Course added!', 'success');
        modal.close();
        crsRenderAll();
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
function crsOpenDelete(id) {
  const c = CRS.data.find(x => x.id === id);
  if (!c) return;

  const modal = Modal.create({
    id: 'modal-crs-del',
    title: 'Delete Course',
    size: 'sm',
    bodyHTML: `
      <div style="text-align:center;padding:10px 0;">
        <i class="fas fa-exclamation-circle" style="font-size:32px;color:var(--color-danger);margin-bottom:12px;"></i>
        <p style="font-size:14px;color:#fff;margin:0;">Are you sure you want to delete <strong>${_crsEsc(c.courseCode || c.name)}</strong>?</p>
        <p style="font-size:12px;color:var(--color-slate-400);margin-top:4px;">This action cannot be undone.</p>
      </div>
    `,
    footerHTML: `
      <button id="btn-crs-del-confirm" style="
        padding:9px 20px;border-radius:6px;
        background:var(--color-danger);color:#fff;
        font-size:13px;font-weight:700;border:none;cursor:pointer;
      ">Delete</button>
      <button id="btn-crs-del-cancel" style="
        padding:9px 20px;border-radius:6px;
        background:rgba(255,255,255,0.04);border:1px solid rgba(139,163,188,0.22);
        color:var(--color-slate-300);font-size:13px;font-weight:600;cursor:pointer;
      ">Cancel</button>
    `
  });

  _c$('#btn-crs-del-cancel', modal.footer()).addEventListener('click', () => modal.close());
  _c$('#btn-crs-del-confirm', modal.footer()).addEventListener('click', async () => {
    try {
      const raw = await Auth.fetch('/courses/' + id, { method: 'DELETE' });
      const res = await raw.json();
      if (res.success) {
        Toast.show('Course deleted', 'success');
        modal.close();
        crsRenderAll();
      } else {
        Toast.show(res.message || 'Delete failed', 'danger');
      }
    } catch (err) {
      Toast.show('Network error', 'danger');
    }
  });

  modal.open();
}
