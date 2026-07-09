/**
 * =============================================================================
 * NIMS UNIVERSITY — CMS ADMIN DASHBOARD
 * app.js  |  Core Application Logic
 * =============================================================================
 *
 * TABLE OF CONTENTS
 * -----------------
 * 01. App Bootstrap & Config
 * 02. DOM Cache — Query all elements once at startup
 * 03. Utility Helpers
 * 04. Toast Notification System
 * 05. Modal System (generic open/close engine)
 * 06. Sidebar Module
 *     06a. Collapse / Expand
 *     06b. Mobile Overlay
 *     06c. Keyboard Navigation
 * 07. Navigation Module
 *     07a. Active state switching
 *     07b. Breadcrumb update
 *     07c. Hash routing
 * 08. Header Module
 *     08a. Search (focus, clear, keyboard shortcut)
 *     08b. Notifications panel
 *     08c. Refresh button with spin animation
 *     08d. Fullscreen toggle
 *     08e. Theme toggle (dark / light)
 * 09. Student CRUD Module
 *     09a. localStorage Store
 *     09b. Student Modal UI (Add / Edit / View / Delete)
 *     09c. Table Renderer
 *     09d. Search & Filter
 *     09e. Stat Counter Sync
 * 10. Quick Actions Module
 * 11. Chart Interactions
 * 12. Semester Arc Animator
 * 13. Activity Feed — live append
 * 14. Keyboard Shortcuts
 * 15. Init
 * =============================================================================
 */

'use strict';

/* =============================================================================
   01. APP BOOTSTRAP & CONFIG
   ============================================================================= */

const CMS = {
  /** Application-wide configuration */
  config: {
    appName:          'NIMS University CMS',
    storageKey:       'cms_students',
    activityKey:      'cms_activity_log',
    themeKey:         'cms_theme',
    sidebarStateKey:  'cms_sidebar_collapsed',
    semesterProgress: 64,          // percent (0–100)
    toastDuration:    3800,        // ms before auto-dismiss
    searchDebounce:   280,         // ms
    animDuration:     320,         // ms, matches CSS transitions
  },

  /** Runtime state */
  state: {
    activeSection:      'dashboard',
    sidebarCollapsed:   false,
    mobileSidebarOpen:  false,
    studentFilter:      { query: '', status: 'all', dept: 'all' },
    editingStudentId:   null,       // null = Add mode, string = Edit mode
    notifPanelOpen:     false,
    searchOpen:         false,
  },

  /** Registered cleanup functions (event listeners on dynamic elements) */
  _cleanups: [],
};


/* =============================================================================
   02. DOM CACHE — query everything once
   ============================================================================= */

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const DOM = {};   // populated in initDOMCache()

function initDOMCache() {
  // Layout
  DOM.sidebar         = $('#sidebar');
  DOM.mainWrapper     = $('#main-wrapper');
  DOM.pageContent     = $('#page-content');
  DOM.sidebarBackdrop = $('#sidebar-backdrop');  // may not exist yet — created by JS

  // Sidebar
  DOM.sidebarBrand    = $('#sidebar-brand');
  DOM.semesterFill    = $('#semester-fill');
  DOM.semesterPct     = $('#semester-pct');
  DOM.semesterTrack   = $('.semester-arc__track');
  DOM.sidebarUserMenu = $('#sidebar-user-menu');
  DOM.navItems        = $$('.nav-item');

  // Header
  DOM.topHeader       = $('#top-header');
  DOM.breadcrumbPage  = $('.breadcrumb__page');
  DOM.breadcrumbSub   = $('.breadcrumb__sub');
  DOM.headerSearch    = $('#header-search');
  DOM.searchInput     = $('#header-search-input');
  DOM.btnRefresh      = $('#btn-refresh');
  DOM.btnHelp         = $('#btn-help');
  DOM.btnAlerts       = $('#btn-alerts');
  DOM.btnNotif        = $('#btn-notifications');
  DOM.btnTheme        = $('#btn-theme-toggle');
  DOM.btnFullscreen   = $('#btn-fullscreen');

  // Notification panel
  DOM.notifModal      = $('#notification-modal');
  DOM.notifList       = $('#notification-list');
  DOM.btnMarkRead     = $('#btn-mark-all-read');

  // Stats
  
  // Stats
  DOM.statValStudents = $('#stat-val-students');
  DOM.statValFaculty = $('#stat-val-faculty');
  DOM.statValCourses = $('#stat-val-courses');
  DOM.statValFees = $('#stat-val-fees');


  // Admissions table
  DOM.admissionsTbody = $('#admissions-tbody');
  DOM.btnFilterAdm    = $('#btn-filter-admissions');

  // Quick actions
  DOM.qaNewStudent    = $('#qa-new-student');
  DOM.qaIssueCert     = $('#qa-issue-cert');
  DOM.qaAttendance    = $('#qa-mark-attendance');
  DOM.qaFee           = $('#qa-collect-fee');
  DOM.qaExam          = $('#qa-schedule-exam');
  DOM.qaNotice        = $('#qa-post-notice');

  // Activity feed
  DOM.activityFeed    = $('.activity-feed');

  // Chart
  DOM.chartYearSelect = $('#chart-year-select');
  DOM.chartBarsEnroll = $$('.chart-bar--enrolled');
  DOM.chartBarsPassed = $$('.chart-bar--passed');

  // Badges
  DOM.admissionsBadge = $('#admissions-badge');
  DOM.noticeBadge     = $('#noticeboard-badge');
}


/* =============================================================================
   03. UTILITY HELPERS
   ============================================================================= */

/**
 * Debounce — returns a function that delays invoking fn until after `wait` ms
 * have elapsed since the last invocation.
 */
function debounce(fn, wait) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Generate a unique ID string with an optional prefix.
 * Uses crypto.randomUUID when available, falls back to Date + random.
 */
function uid(prefix = 'id') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().split('-')[0]}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Format a Date object to a readable string: "18 Jun 2026"
 */
function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/**
 * Get initials from a full name (max 2 characters).
 */
function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .map(w => w[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Generate a sequential admission number like "ADM-2026-XXXX".
 */
function nextAdmissionNo(students) {
  const nums = students
    .map(s => parseInt((s.admissionNo || '').replace(/\D/g, ''), 10))
    .filter(Boolean);
  const next = nums.length ? Math.max(...nums) + 1 : 42;
  return `ADM-2026-${String(next).padStart(4, '0')}`;
}

/**
 * Generate a student roll number based on year + dept code.
 */
function generateRollNo(dept) {
  const codes = {
    'Computer Science': 'CS',
    'Business Admin':   'BA',
    'Engineering':      'EN',
    'Medical Sciences': 'ME',
    'Arts & Humanities':'AH',
  };
  const code = codes[dept] || 'GN';
  const rand  = Math.floor(1000 + Math.random() * 9000);
  return `241${code}${rand}`;
}

/**
 * Safely parse JSON from localStorage; return fallback on failure.
 */
function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Safely write JSON to localStorage.
 */
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('[CMS] localStorage write failed:', e);
    return false;
  }
}

/**
 * Trap focus within a given element (for modals).
 * Returns an unlisten function.
 */
function trapFocus(container) {
  const focusable = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const els = $$(focusable, container).filter(el => !el.closest('[hidden]'));
  if (!els.length) return () => {};
  const first = els[0];
  const last  = els[els.length - 1];

  function handler(e) {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  container.addEventListener('keydown', handler);
  first.focus();
  return () => container.removeEventListener('keydown', handler);
}


/* =============================================================================
   04. TOAST NOTIFICATION SYSTEM
   ============================================================================= */

/**
 * Toast variants: 'success' | 'danger' | 'warning' | 'info'
 *
 * Usage:
 *   Toast.show('Student added successfully', 'success');
 */
const Toast = (() => {
  let container;

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'false');
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }
    return container;
  }

  const icons = {
    success: 'fas fa-circle-check',
    danger:  'fas fa-circle-xmark',
    warning: 'fas fa-triangle-exclamation',
    info:    'fas fa-circle-info',
  };

  const colors = {
    success: 'var(--color-success)',
    danger:  'var(--color-danger)',
    warning: 'var(--color-warning)',
    info:    'var(--color-info)',
  };

  function show(message, type = 'info', duration = CMS.config.toastDuration) {
    const c = getContainer();

    const toast = document.createElement('div');
    toast.setAttribute('role', 'alert');
    toast.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: var(--radius-md, 10px);
      background: #D90429;
      border: 1px solid #B80322;
      box-shadow: 0 8px 24px rgba(217, 4, 41, 0.25);
      color: #FFFFFF;
      font-family: var(--font-ui, 'DM Sans', sans-serif);
      font-size: 13px;
      font-weight: 500;
      max-width: 360px;
      pointer-events: all;
      opacity: 0;
      transform: translateX(20px);
      transition: opacity 0.22s ease, transform 0.22s ease;
      cursor: default;
    `;

    toast.innerHTML = `
      <i class="${icons[type] || icons.info}" style="color:#FFFFFF;font-size:15px;flex-shrink:0;" aria-hidden="true"></i>
      <span style="flex:1;line-height:1.45;color:#FFFFFF;">${message}</span>
      <button aria-label="Dismiss notification" style="
        background:rgba(255,255,255,0.15);border:none;cursor:pointer;
        color:#FFFFFF;font-size:12px;
        padding:2px 6px;border-radius:4px;flex-shrink:0;
        transition:background 0.15s;
      " onmouseenter="this.style.background='rgba(255,255,255,0.25)'" onmouseleave="this.style.background='rgba(255,255,255,0.15)'">
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    `;

    c.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
      });
    });

    // Dismiss button
    toast.querySelector('button').addEventListener('click', () => dismiss(toast));

    // Auto dismiss
    const timer = setTimeout(() => dismiss(toast), duration);

    function dismiss(el) {
      clearTimeout(timer);
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 260);
    }
  }

  return { show };
})();


/* =============================================================================
   05. MODAL SYSTEM
   ============================================================================= */

/**
 * Generic modal engine.
 * Creates, opens, closes, and destroys a full-screen overlay modal.
 *
 * Usage:
 *   const modal = Modal.create({ title, bodyHTML, footerHTML, size, onClose });
 *   modal.open();
 */
const Modal = (() => {
  let activeModal   = null;
  let unlockFocus   = null;

  function create({ title = '', bodyHTML = '', footerHTML = '', size = 'md', id = uid('modal'), onClose = null } = {}) {
    const widths = { sm: '420px', md: '560px', lg: '760px', xl: '960px' };

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title);
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 5000;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      background: rgba(0,0,0,0.60);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      opacity: 0;
      transition: opacity 0.22s ease;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      width: 100%;
      max-width: ${widths[size] || widths.md};
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      background: var(--color-surface, rgba(12, 22, 38, 0.96));
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      
      -webkit-
      border: 1px solid #E5E7EB;
      border-radius: var(--radius-xl, 20px);
      box-shadow: 0 12px 30px rgba(0,0,0,0.1);
      overflow: hidden;
      transform: translateY(24px) scale(0.97);
      transition: transform 0.28s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease;
      opacity: 0;
    `;

    panel.innerHTML = `
      <div class="cms-modal__header" style="
        display:flex; align-items:center; justify-content:space-between;
        padding:18px 24px 16px;
        border-bottom:1px solid var(--color-border);
        background: var(--color-cyan-glow);
        flex-shrink:0;
      ">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="
            width:3px; height:18px; border-radius:99px;
            background:linear-gradient(180deg, #F25F5C, #D90429);
            box-shadow:0 0 8px rgba(242,95,92,0.40);
            flex-shrink:0;
          "></div>
          <h2 class="cms-modal__title" style="
            font-family:var(--font-ui,'DM Sans',sans-serif);
            font-size:16px; font-weight:700;
            color:var(--color-cyan-400,#00D4FF);
            margin:0; letter-spacing:-0.01em;
          ">${title}</h2>
        </div>
        <button class="cms-modal__close" aria-label="Close dialog" style="
          width:32px; height:32px; display:flex;
          align-items:center; justify-content:center;
          border-radius:var(--radius-sm,6px); border:1px solid transparent;
          color:var(--color-slate-400,#8BA3BC);
          background:none; cursor:pointer;
          font-size:14px;
          transition:background 0.15s, color 0.15s, border-color 0.15s;
        ">
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
      <div class="cms-modal__body" style="
        padding:24px; overflow-y:auto; flex:1;
        scrollbar-width: thin; scrollbar-color: var(--color-navy-600) transparent;
      ">
        ${bodyHTML}
      </div>
      ${footerHTML ? `<div class="cms-modal__footer" style="
        padding:16px 24px; border-top:1px solid var(--color-border);
        background: var(--color-navy-800);
        display:flex; justify-content:flex-end; gap:12px;
        flex-shrink:0;
      ">${footerHTML}</div>` : ''}
    `;

    // Close-button hover styles via JS (avoids needing stylesheet)
    const closeBtn = panel.querySelector('.cms-modal__close');
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background     = 'rgba(255,255,255,0.06)';
      closeBtn.style.color          = '#fff';
      closeBtn.style.borderColor    = 'rgba(255,255,255,0.10)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background     = 'none';
      closeBtn.style.color          = 'var(--color-slate-400,#8BA3BC)';
      closeBtn.style.borderColor    = 'transparent';
    });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function open() {
      activeModal = modal;
      document.body.style.overflow = 'hidden';
      overlay.style.opacity = '1';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          panel.style.transform = 'translateY(0) scale(1)';
          panel.style.opacity   = '1';
        });
      });
      unlockFocus = trapFocus(panel);
    }

    function close(triggerCallback = true) {
      overlay.style.opacity   = '0';
      panel.style.transform   = 'translateY(24px) scale(0.97)';
      panel.style.opacity     = '0';
      document.body.style.overflow = '';
      if (unlockFocus) { unlockFocus(); unlockFocus = null; }
      activeModal = null;
      setTimeout(() => {
        overlay.remove();
        if (triggerCallback && typeof onClose === 'function') onClose();
      }, 280);
    }

    // Wire close button & overlay click
    closeBtn.addEventListener('click', () => close());
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });

    // ESC key
    function escHandler(e) {
      if (e.key === 'Escape' && activeModal === modal) {
        close();
        document.removeEventListener('keydown', escHandler);
      }
    }
    document.addEventListener('keydown', escHandler);

    const modal = {
      overlay,
      panel,
      open,
      close,
      body:   () => panel.querySelector('.cms-modal__body'),
      footer: () => panel.querySelector('.cms-modal__footer'),
    };

    return modal;
  }

  /** Close whatever modal is currently open */
  function closeActive() {
    if (activeModal) activeModal.close();
  }

  return { create, closeActive };
})();


/* =============================================================================
   06. SIDEBAR MODULE
   ============================================================================= */

const SidebarModule = (() => {

  /* ── 06a. Collapse / Expand ──────────────────────────────────────────── */

  function isCollapsed() {
    return DOM.sidebar.classList.contains('sidebar--collapsed');
  }

  function collapse() {
    DOM.sidebar.classList.add('sidebar--collapsed');
    DOM.mainWrapper.style.marginLeft = 'var(--sidebar-collapsed, 64px)';
    DOM.sidebar.setAttribute('aria-expanded', 'false');
    lsSet(CMS.config.sidebarStateKey, true);
    CMS.state.sidebarCollapsed = true;

    // Show tooltip labels on collapsed nav items
    $$('.nav-item', DOM.sidebar).forEach(item => {
      item.setAttribute('title', item.textContent.trim());
    });
  }

  function expand() {
    DOM.sidebar.classList.remove('sidebar--collapsed');
    DOM.mainWrapper.style.marginLeft = 'var(--sidebar-width, 256px)';
    DOM.sidebar.setAttribute('aria-expanded', 'true');
    lsSet(CMS.config.sidebarStateKey, false);
    CMS.state.sidebarCollapsed = false;

    $$('.nav-item', DOM.sidebar).forEach(item => {
      item.removeAttribute('title');
    });
  }

  function toggle() {
    isCollapsed() ? expand() : collapse();
  }

  /* ── 06b. Mobile Overlay ─────────────────────────────────────────────── */

  function ensureBackdrop() {
    if (!DOM.sidebarBackdrop) {
      const bd = document.createElement('div');
      bd.id = 'sidebar-backdrop';
      bd.style.cssText = `
        display:none; position:fixed; inset:0;
        z-index:99; background:rgba(0,0,0,0.55);
        backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);
        opacity:0; transition:opacity 0.25s ease;
      `;
      document.body.appendChild(bd);
      DOM.sidebarBackdrop = bd;

      bd.addEventListener('click', closeMobile);
    }
  }

  function openMobile() {
    ensureBackdrop();
    DOM.sidebar.classList.add('sidebar--mobile-open');
    DOM.sidebarBackdrop.style.display = 'block';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        DOM.sidebarBackdrop.style.opacity = '1';
      });
    });
    document.body.style.overflow = 'hidden';
    CMS.state.mobileSidebarOpen = true;
  }

  function closeMobile() {
    DOM.sidebar.classList.remove('sidebar--mobile-open');
    if (DOM.sidebarBackdrop) {
      DOM.sidebarBackdrop.style.opacity = '0';
      setTimeout(() => {
        if (DOM.sidebarBackdrop) DOM.sidebarBackdrop.style.display = 'none';
      }, 260);
    }
    document.body.style.overflow = '';
    CMS.state.mobileSidebarOpen = false;
  }

  function isMobile() {
    return window.innerWidth <= 1024;
  }

  /* ── 06c. Hamburger Button (injected into header) ──────────────────────*/

  function injectHamburger() {
    if ($('#btn-sidebar-toggle')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-sidebar-toggle';
    btn.className = 'header-action-btn';
    btn.setAttribute('aria-label', 'Toggle sidebar');
    btn.setAttribute('title', 'Toggle sidebar');
    btn.style.display = 'none';  // shown via CSS media query or JS mobile check
    btn.innerHTML = '<i class="fas fa-bars" aria-hidden="true"></i>';

    btn.addEventListener('click', () => {
      if (isMobile()) {
        CMS.state.mobileSidebarOpen ? closeMobile() : openMobile();
      } else {
        toggle();
      }
    });

    // Insert as first child of header
    DOM.topHeader.insertBefore(btn, DOM.topHeader.firstChild);

    // Show on mobile
    if (isMobile()) btn.style.display = 'flex';
    window.addEventListener('resize', debounce(() => {
      btn.style.display = isMobile() ? 'flex' : 'none';
      if (!isMobile() && CMS.state.mobileSidebarOpen) closeMobile();
    }, 200));
  }

  /* ── 06d. Keyboard Navigation ───────────────────────────────────────── */

  function initKeyNav() {
    DOM.sidebar.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isMobile() && CMS.state.mobileSidebarOpen) {
        closeMobile();
      }
    });

    // Allow Enter/Space to activate nav items when focused via keyboard
    DOM.navItems.forEach(item => {
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          item.click();
        }
      });
    });
  }

  function init() {
    // Restore persisted state
    const wasCollapsed = lsGet(CMS.config.sidebarStateKey, false);
    if (wasCollapsed && !isMobile()) collapse();

    // Brand click toggles sidebar
    DOM.sidebarBrand.addEventListener('click', () => {
      if (isMobile()) {
        CMS.state.mobileSidebarOpen ? closeMobile() : openMobile();
      } else {
        toggle();
      }
    });

    DOM.sidebarUserMenu.addEventListener('click', () => {
      Toast.show('User profile settings — coming soon', 'info');
    });

    DOM.sidebarUserMenu.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        DOM.sidebarUserMenu.click();
      }
    });

    const logoutLink = $('#nav-logout-link');
    if (logoutLink) {
      logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        Auth.logout();
      });
    }

    injectHamburger();
    initKeyNav();
  }

  return { init, toggle, collapse, expand, openMobile, closeMobile };
})();


/* =============================================================================
   07. NAVIGATION MODULE
   ============================================================================= */

const NavModule = (() => {

  /** Map from nav id → human-readable label + subtitle */
    const navMeta = {
      dashboard:   { label: 'Dashboard',      sub: 'Overview & Statistics' },
      analytics:   { label: 'Analytics',      sub: 'Trends & Insights' },
      noticeboard: { label: 'Notices',        sub: 'Active Announcements' },
      students:    { label: 'Students',       sub: 'Manage Student Records' },
      faculty:     { label: 'Faculty',        sub: 'Staff Directory & Attendance' },
      departments: { label: 'Departments',    sub: 'Academic Departments' },
      courses:     { label: 'Courses',        sub: 'Course Catalogue' },
      timetable:   { label: 'Timetable',      sub: 'Schedule Management' },
      examinations:{ label: 'Marks',          sub: 'Exam Schedules & Results' },
      admissions:  { label: 'Admissions',     sub: 'New Enrolments & Applications' },
      attendance:  { label: 'Attendance',     sub: 'Daily Attendance Records' },
      fees:        { label: 'Fee Management', sub: 'Collections & Pending Dues' },
      library:     { label: 'Library',        sub: 'Book Issues & Returns' },
      hostel:      { label: 'Hostel',         sub: 'Room Allocation & Management' },
      transport:   { label: 'Transport',      sub: 'Route & Vehicle Management' },
      reports:     { label: 'Reports',        sub: 'Generate & Download Reports' },
      users:       { label: 'User Roles',     sub: 'Access Control Management' },
      settings:    { label: 'Settings',       sub: 'System Configuration' },
      audit:       { label: 'Audit Logs',     sub: 'System Activity Trail' },
      profile:     { label: 'Profile',        sub: 'My Account' },
      registration:{ label: 'Registration',   sub: 'Complete your profile' },
    };

  /* ── 07a. Active state switching ───────────────────────────────────── */

  function setActive(sectionKey) {
    // Remove active from all nav items
    DOM.navItems.forEach(item => {
      item.classList.remove('nav-item--active');
      item.removeAttribute('aria-current');
    });

    // Apply active to matching item
    const target = $(`#nav-${sectionKey}`);
    if (target) {
      target.classList.add('nav-item--active');
      target.setAttribute('aria-current', 'page');
    }

    CMS.state.activeSection = sectionKey;

    updateBreadcrumb(sectionKey);
    updatePageTitle(sectionKey);
    updateHash(sectionKey);

    const dashboardContent = $('#dashboard-content');
    if (dashboardContent) {
      dashboardContent.style.display = sectionKey === 'dashboard' ? '' : 'none';
    }

    const moduleSections = {
      students:    'students-section',
      faculty:     'faculty-section',
      attendance:  'attendance-section',
      examinations:'marks-section',
      analytics:   'analytics-section',
      noticeboard: 'noticeboard-section',
      departments: 'departments-section',
      courses:     'courses-section',
      timetable:   'timetable-section',
      admissions:  'admissions-section',
      fees:        'fees-section',
      library:     'library-section',
      hostel:      'hostel-section',
      transport:   'transport-section',
      reports:     'reports-section',
      users:       'users-section',
      settings:    'settings-section',
      audit:       'audit-section',
      profile:     'profile-section',
      registration:'registration-section'
    };

    Object.entries(moduleSections).forEach(([key, sectionId]) => {
      let section = $(`#${sectionId}`);
      
      // Auto-generate placeholder or custom module views
      const selfInjecting = ['students', 'faculty', 'attendance', 'examinations', 'courses', 'timetable'];
      if (!section && !selfInjecting.includes(key)) {
        section = document.createElement('section');
        section.id = sectionId;
        
        const user = Auth.getUser() || {};
        
        if (key === 'profile') {
          const profImg = user.profilePic ? `<img src="${user.profilePic}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : initials(user.name || 'U');
          
          section.innerHTML = `
            <h2 class="section-title">My Profile</h2>
            <div class="card" style="max-width:600px; margin:0 auto; padding: 24px; text-align:center; position:relative;">
              <div style="position:relative; width:120px; height:120px; margin:0 auto 24px;">
                <div id="profile-avatar-display" style="width:120px; height:120px; border-radius:50%; background:linear-gradient(135deg,var(--color-cyan-600),var(--color-blue-700)); color:#fff; font-size:48px; font-weight:700; display:flex; align-items:center; justify-content:center; overflow:hidden;">
                  ${profImg}
                </div>
                <label for="profile-pic-upload" style="position:absolute; bottom:0; right:0; width:36px; height:36px; background:#C8102E; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; border:3px solid var(--color-surface); box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                  <i class="fas fa-camera"></i>
                </label>
                <input type="file" id="profile-pic-upload" accept="image/*" style="display:none;" onchange="uploadProfilePicture(event)">
              </div>
              <h3 style="font-size:28px; margin-bottom:8px; color:var(--color-white);">${user.name}</h3>
              <div style="color:var(--color-slate-400); font-size:16px; margin-bottom:24px;">${user.email}</div>
              
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; text-align:left; background:var(--color-navy-800); padding:24px; border-radius:12px; border:1px solid var(--color-border);">
                <div>
                  <div style="font-size:12px; color:var(--color-slate-400); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Role</div>
                  <div style="font-size:16px; font-weight:600; color:var(--color-white); text-transform:capitalize;">${user.role}</div>
                </div>
                <div>
                  <div style="font-size:12px; color:var(--color-slate-400); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.05em;">Status</div>
                  <div style="font-size:16px; font-weight:600; color:var(--color-success);">Active</div>
                </div>
              </div>
            </div>
          `;
          
          window.uploadProfilePicture = async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) return Toast.show('Image too large (max 2MB)', 'error');
            
            const reader = new FileReader();
            reader.onload = async function(e) {
              const base64 = e.target.result;
              try {
                Toast.show('Uploading picture...', 'info');
                const res = await Auth.fetch('/auth/profile-pic', {
                  method: 'PUT',
                  body: JSON.stringify({ profilePic: base64 })
                });
                const body = await res.json();
                if (body.success) {
                  Toast.show('Profile picture updated!', 'success');
                  // Update current user session
                  const currentUser = Auth.getUser();
                  currentUser.profilePic = base64;
                  Auth.save(Auth.getToken(), currentUser);
                  // Refresh UI
                  NavModule.navigate('profile');
                  const sidebarAvatar = document.querySelector('.sidebar-user__avatar');
                  if (sidebarAvatar) sidebarAvatar.innerHTML = `<img src="${base64}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
                } else {
                  Toast.show(body.message || 'Failed to upload', 'error');
                }
              } catch (err) {
                Toast.show('Upload error', 'error');
              }
            };
            reader.readAsDataURL(file);
          };
        } else if (key === 'noticeboard') {
          section.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
              <div>
                <h2 class="section-title" style="margin-bottom:8px;">Campus Noticeboard</h2>
                <p style="color:var(--color-slate-400); font-size:14px;">Stay updated with the latest announcements, events, and academic notices.</p>
              </div>
              <button id="btn-post-notice-page" onclick="NoticeModule.openPostModal()" style="display:flex; align-items:center; gap:8px; padding:0 18px; height:38px; background:rgba(0,212,255,0.12); border:1px solid rgba(0,212,255,0.28); border-radius:var(--radius-sm); color:var(--color-cyan-400); font-weight:700; font-size:13px; cursor:pointer; transition:background 0.2s, box-shadow 0.2s;" onmouseover="this.style.background='rgba(0,212,255,0.2)';this.style.boxShadow='var(--shadow-glow)';" onmouseout="this.style.background='rgba(0,212,255,0.12)';this.style.boxShadow='none';">
                <i class="fas fa-plus"></i> New Notice
              </button>
            </div>
            
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:24px;">
              <!-- Notice 1: Pinned -->
              <div style="background:var(--color-card); border-radius:var(--radius-md); border:1px solid rgba(0,212,255,0.3); padding:24px; position:relative; overflow:hidden; box-shadow:var(--shadow-glow);">
                <div style="position:absolute; top:0; left:0; width:4px; height:100%; background:var(--color-cyan-400);"></div>
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                  <span style="background:rgba(0,212,255,0.15); color:var(--color-cyan-400); padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;"><i class="fas fa-thumbtack" style="margin-right:4px;"></i> Pinned</span>
                  <span style="color:var(--color-slate-400); font-size:12px;"><i class="far fa-clock" style="margin-right:4px;"></i> 2 hours ago</span>
                </div>
                <h3 style="color:var(--color-white); font-size:18px; font-weight:700; margin-bottom:12px; line-height:1.4;">Mid-Semester Examination Schedule 2025</h3>
                <p style="color:var(--color-slate-300); font-size:14px; line-height:1.6; margin-bottom:20px;">The mid-semester examination timetable for all undergraduate programs has been finalized. Please check the attached schedule for your respective departments.</p>
                <div style="display:flex; align-items:center; gap:12px; border-top:1px solid var(--color-border); padding-top:16px;">
                  <div style="width:32px; height:32px; border-radius:50%; background:var(--color-navy-600); display:flex; align-items:center; justify-content:center; color:var(--color-cyan-400); font-size:12px; font-weight:700;">AR</div>
                  <div>
                    <div style="color:var(--color-white); font-size:13px; font-weight:600;">Academic Registry</div>
                    <div style="color:var(--color-slate-400); font-size:11px;">University Admin</div>
                  </div>
                </div>
              </div>

              <!-- Notice 2 -->
              <div style="background:var(--color-surface); border-radius:var(--radius-md); border:1px solid var(--color-border); padding:24px; transition:transform 0.2s, box-shadow 0.2s; cursor:pointer;" onmouseover="this.style.transform='translateY(-4px)'; this.style.borderColor='var(--color-border-bright)';" onmouseout="this.style.transform='none'; this.style.borderColor='var(--color-border)';">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                  <span style="background:var(--color-warning-bg); color:var(--color-warning); padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Event</span>
                  <span style="color:var(--color-slate-400); font-size:12px;">Yesterday</span>
                </div>
                <h3 style="color:var(--color-white); font-size:17px; font-weight:700; margin-bottom:12px; line-height:1.4;">Annual Tech Symposium: Innovex 2025</h3>
                <p style="color:var(--color-slate-300); font-size:14px; line-height:1.6; margin-bottom:20px;">Registration is now open for Innovex 2025. Participate in hackathons, robotics challenges, and paper presentations.</p>
                <div style="display:flex; align-items:center; gap:12px; border-top:1px solid var(--color-border); padding-top:16px;">
                  <div style="width:32px; height:32px; border-radius:50%; background:var(--color-navy-600); display:flex; align-items:center; justify-content:center; color:var(--color-cyan-400); font-size:12px; font-weight:700;">CS</div>
                  <div>
                    <div style="color:var(--color-white); font-size:13px; font-weight:600;">Computer Science Dept</div>
                    <div style="color:var(--color-slate-400); font-size:11px;">Event Committee</div>
                  </div>
                </div>
              </div>
              
              <!-- Notice 3 -->
              <div style="background:var(--color-surface); border-radius:var(--radius-md); border:1px solid var(--color-border); padding:24px; transition:transform 0.2s, box-shadow 0.2s; cursor:pointer;" onmouseover="this.style.transform='translateY(-4px)'; this.style.borderColor='var(--color-border-bright)';" onmouseout="this.style.transform='none'; this.style.borderColor='var(--color-border)';">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                  <span style="background:var(--color-danger-bg); color:var(--color-danger); padding:4px 10px; border-radius:20px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">Urgent</span>
                  <span style="color:var(--color-slate-400); font-size:12px;">May 20, 2025</span>
                </div>
                <h3 style="color:var(--color-white); font-size:17px; font-weight:700; margin-bottom:12px; line-height:1.4;">Library Book Return Deadline</h3>
                <p style="color:var(--color-slate-300); font-size:14px; line-height:1.6; margin-bottom:20px;">All students must return books issued before March 2025 to the central library by this Friday to avoid late fees.</p>
                <div style="display:flex; align-items:center; gap:12px; border-top:1px solid var(--color-border); padding-top:16px;">
                  <div style="width:32px; height:32px; border-radius:50%; background:var(--color-navy-600); display:flex; align-items:center; justify-content:center; color:var(--color-cyan-400); font-size:12px; font-weight:700;">LB</div>
                  <div>
                    <div style="color:var(--color-white); font-size:13px; font-weight:600;">Central Library</div>
                    <div style="color:var(--color-slate-400); font-size:11px;">Administration</div>
                  </div>
                </div>
              </div>
            </div>
          `;
        } else if (key === 'settings') {
          section.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
              <div>
                <h2 class="section-title" style="margin-bottom:8px;">System Settings</h2>
                <p style="color:var(--color-slate-400); font-size:14px;">Manage your preferences, security, and application settings.</p>
              </div>
              <button style="display:flex; align-items:center; gap:8px; padding:0 18px; height:38px; background:var(--color-cyan-400); border:none; border-radius:var(--radius-sm); color:var(--color-navy-900); font-weight:700; font-size:13px; cursor:pointer; box-shadow:0 4px 12px rgba(0,212,255,0.3); transition:transform 0.15s, box-shadow 0.15s;" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 16px rgba(0,212,255,0.4)';" onmouseout="this.style.transform='none';this.style.boxShadow='0 4px 12px rgba(0,212,255,0.3)';">
                <i class="fas fa-save"></i> Save Changes
              </button>
            </div>
            
            <div style="display:flex; gap:24px; align-items:flex-start; flex-wrap:wrap;">
              <!-- Sidebar Tabs -->
              <div style="width:240px; background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:12px 0; flex-shrink:0;">
                <div style="padding:10px 20px; color:var(--color-cyan-400); background:rgba(0,212,255,0.08); border-left:3px solid var(--color-cyan-400); font-weight:600; cursor:pointer; display:flex; align-items:center; gap:10px;">
                  <i class="fas fa-user-shield" style="width:16px;"></i> Account Security
                </div>
                <div style="padding:10px 20px; color:var(--color-slate-300); font-weight:500; cursor:pointer; display:flex; align-items:center; gap:10px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='none'">
                  <i class="fas fa-bell" style="width:16px;"></i> Notifications
                </div>
                <div style="padding:10px 20px; color:var(--color-slate-300); font-weight:500; cursor:pointer; display:flex; align-items:center; gap:10px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='none'">
                  <i class="fas fa-paint-brush" style="width:16px;"></i> Appearance
                </div>
                <div style="padding:10px 20px; color:var(--color-slate-300); font-weight:500; cursor:pointer; display:flex; align-items:center; gap:10px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='none'">
                  <i class="fas fa-database" style="width:16px;"></i> Data & Privacy
                </div>
              </div>
              
              <!-- Content Area -->
              <div style="flex:1; min-width:300px; display:flex; flex-direction:column; gap:24px;">
                <!-- Security Card -->
                <div style="background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-md); overflow:hidden;">
                  <div style="padding:20px 24px; border-bottom:1px solid var(--color-border); background:rgba(0,0,0,0.1);">
                    <h3 style="color:var(--color-white); font-size:16px; font-weight:600;">Password & Authentication</h3>
                  </div>
                  <div style="padding:24px; display:flex; flex-direction:column; gap:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                      <div>
                        <div style="color:var(--color-white); font-size:14px; font-weight:500; margin-bottom:4px;">Change Password</div>
                        <div style="color:var(--color-slate-400); font-size:13px;">It's a good idea to use a strong password that you're not using elsewhere.</div>
                      </div>
                      <button id="btn-settings-change-pwd" style="padding:8px 16px; background:none; border:1px solid var(--color-border); border-radius:var(--radius-sm); color:var(--color-white); font-size:13px; font-weight:600; cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">Update</button>
                    </div>
                    <div style="height:1px; background:var(--color-border);"></div>
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
                      <div>
                        <div style="color:var(--color-white); font-size:14px; font-weight:500; margin-bottom:4px;">Two-Factor Authentication (2FA)</div>
                        <div style="color:var(--color-slate-400); font-size:13px;">Add an extra layer of security to your account.</div>
                      </div>
                      <div style="width:40px; height:22px; background:var(--color-cyan-400); border-radius:20px; position:relative; cursor:pointer;" onclick="const k=this.children[0]; k.style.left=k.style.left==='2px'?'20px':'2px'; this.style.background=k.style.left==='20px'?'var(--color-cyan-400)':'var(--color-slate-400)';">
                        <div style="width:18px; height:18px; background:#fff; border-radius:50%; position:absolute; top:2px; left:20px; box-shadow:0 1px 3px rgba(0,0,0,0.3); transition:left 0.2s;"></div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Sessions Card -->
                <div style="background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-md); overflow:hidden;">
                  <div style="padding:20px 24px; border-bottom:1px solid var(--color-border); background:rgba(0,0,0,0.1);">
                    <h3 style="color:var(--color-white); font-size:16px; font-weight:600;">Active Sessions</h3>
                  </div>
                  <div style="padding:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 24px; border-bottom:1px solid var(--color-border); flex-wrap:wrap; gap:16px;">
                      <div style="display:flex; align-items:center; gap:16px;">
                        <div style="width:40px; height:40px; border-radius:8px; background:rgba(0,212,255,0.1); color:var(--color-cyan-400); display:flex; align-items:center; justify-content:center; font-size:20px;">
                          <i class="fab fa-apple"></i>
                        </div>
                        <div>
                          <div style="color:var(--color-white); font-size:14px; font-weight:600; margin-bottom:2px;">MacBook Pro · Safari</div>
                          <div style="color:var(--color-slate-400); font-size:12px;">Jaipur, India · Current Session</div>
                        </div>
                      </div>
                      <span style="color:var(--color-success); font-size:12px; font-weight:700; background:var(--color-success-bg); padding:4px 10px; border-radius:20px;">Active Now</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 24px; flex-wrap:wrap; gap:16px;">
                      <div style="display:flex; align-items:center; gap:16px;">
                        <div style="width:40px; height:40px; border-radius:8px; background:rgba(255,255,255,0.05); color:var(--color-slate-400); display:flex; align-items:center; justify-content:center; font-size:20px;">
                          <i class="fab fa-android"></i>
                        </div>
                        <div>
                          <div style="color:var(--color-white); font-size:14px; font-weight:600; margin-bottom:2px;">Samsung Galaxy S23 · Chrome</div>
                          <div style="color:var(--color-slate-400); font-size:12px;">Delhi, India · Last active 2 days ago</div>
                        </div>
                      </div>
                      <button style="padding:6px 12px; background:none; border:1px solid var(--color-danger); border-radius:var(--radius-sm); color:var(--color-danger); font-size:12px; font-weight:600; cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='var(--color-danger-bg)'" onmouseout="this.style.background='none'">Revoke</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        } else {
          section.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60vh; text-align:center; color:var(--color-slate-400);">
              <div style="width:80px; height:80px; border-radius:50%; background:var(--color-cyan-glow); display:flex; align-items:center; justify-content:center; margin-bottom:24px;">
                <i class="fas fa-person-digging" style="font-size:32px; color:var(--color-cyan-400);"></i>
              </div>
              <h2 style="color:var(--color-white); font-family:var(--font-display); font-size:28px; margin-bottom:12px;">${navMeta[key]?.label || key} Module</h2>
              <p style="font-size:16px; max-width:400px; line-height:1.6;">This module is currently under development. Please check back later for updates.</p>
            </div>
          `;
        }
        
        const pageContent = $('#page-content');
        if (pageContent) pageContent.appendChild(section);
      }

      if (section) {
        section.style.display = sectionKey === key ? '' : 'none';
      }
    });

    // When "Students" is activated, always re-fetch from API then render
    if (sectionKey === 'students') {
      StudentModule.fetchAndRender();
    }
    
    if (sectionKey === 'registration') {
      loadStudentRegistrationForm();
    }
  }

  /* ── 07b. Breadcrumb update ─────────────────────────────────────────── */

  function updateBreadcrumb(key) {
    const meta = navMeta[key] || { label: key, sub: '' };
    if (DOM.breadcrumbPage) DOM.breadcrumbPage.textContent = meta.label;
    if (DOM.breadcrumbSub)  DOM.breadcrumbSub.textContent  = meta.sub;
  }

  /* ── 07c. Hash routing ──────────────────────────────────────────────── */

  function updateHash(key) {
    // Update URL hash without triggering a scroll
    history.replaceState(null, '', `#${key}`);
  }

  function readHash() {
    const hash = location.hash.replace('#', '').trim();
    return hash && navMeta[hash] ? hash : 'dashboard';
  }

  function updatePageTitle(key) {
    const meta = navMeta[key] || {};
    document.title = `${meta.label || key} — NIMS University CMS`;
  }

  /* ── Attach click listeners ─────────────────────────────────────────── */

  function initNavClicks() {
    DOM.navItems.forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const href = item.getAttribute('href') || '';
        const key  = href.replace('#', '').trim();

        if (item.id === 'nav-logout-link') {
          Auth.logout();
          return;
        }

        if (!navMeta[key]) {
          Toast.show(`${item.textContent.trim()} — module coming soon`, 'info');
          return;
        }

        setActive(key);

        // Close mobile sidebar after navigation
        if (CMS.state.mobileSidebarOpen) SidebarModule.closeMobile();
      });
    });
  }

  function init() {
    initNavClicks();
    setActive(readHash());

    // Also handle popstate (browser back/forward)
    window.addEventListener('popstate', () => {
      setActive(readHash());
    });
  }

  return { init, setActive };
})();


/* =============================================================================
   08. HEADER MODULE
   ============================================================================= */

const HeaderModule = (() => {

  /* ── 08a. Search ────────────────────────────────────────────────────── */

  function initSearch() {
    // ⌘K / Ctrl+K shortcut to focus search
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        DOM.searchInput.focus();
        DOM.searchInput.select();
      }
    });

    // Escape to blur
    DOM.searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        DOM.searchInput.blur();
        DOM.searchInput.value = '';
      }
    });

    // Live search — routes to student module when on students section
    DOM.searchInput.addEventListener('input', debounce(e => {
      const q = e.target.value.trim();
      if (CMS.state.activeSection === 'students' && StudentModule) {
        CMS.state.studentFilter.query = q;
        // currentPage reset is handled inside ensureStudentSection's own listener
        StudentModule.renderTable();
      }
    }, CMS.config.searchDebounce));
  }

  /* ── 08b. Notifications panel ───────────────────────────────────────── */

  function initNotifications() {
    if (!DOM.btnNotif || !DOM.notifModal) return;

    DOM.btnNotif.addEventListener('click', e => {
      e.stopPropagation();
      toggleNotifPanel();
    });

    DOM.btnAlerts.addEventListener('click', () => {
      Toast.show('No critical system alerts at this time', 'success');
    });

    if (DOM.btnMarkRead) {
      DOM.btnMarkRead.addEventListener('click', () => {
        $$('.notification-entry--unread', DOM.notifModal).forEach(el => {
          el.classList.remove('notification-entry--unread');
          // Remove the left cyan border indicator
          el.style.removeProperty('background');
        });
        Toast.show('All notifications marked as read', 'success');
        // Remove badge dot
        const badge = DOM.btnNotif.querySelector('.action-badge');
        if (badge) badge.remove();
      });
    }

    // Close when clicking outside
    document.addEventListener('click', e => {
      if (CMS.state.notifPanelOpen && !DOM.notifModal.contains(e.target) && e.target !== DOM.btnNotif) {
        closeNotifPanel();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && CMS.state.notifPanelOpen) closeNotifPanel();
    });
  }

  function toggleNotifPanel() {
    CMS.state.notifPanelOpen ? closeNotifPanel() : openNotifPanel();
  }

  function openNotifPanel() {
    DOM.notifModal.classList.add('modal--open');
    DOM.notifModal.setAttribute('aria-hidden', 'false');
    DOM.btnNotif.setAttribute('aria-expanded', 'true');
    CMS.state.notifPanelOpen = true;
  }

  function closeNotifPanel() {
    DOM.notifModal.classList.remove('modal--open');
    DOM.notifModal.setAttribute('aria-hidden', 'true');
    DOM.btnNotif.setAttribute('aria-expanded', 'false');
    CMS.state.notifPanelOpen = false;
  }

  /* ── 08c. Refresh button ─────────────────────────────────────────────── */

  function initRefresh() {
    if (!DOM.btnRefresh) return;
    DOM.btnRefresh.addEventListener('click', () => {
      const icon = DOM.btnRefresh.querySelector('i');
      if (icon) {
        icon.style.transition = 'transform 0.8s ease';
        icon.style.transform  = 'rotate(360deg)';
        setTimeout(() => {
          icon.style.transition = 'none';
          icon.style.transform  = 'rotate(0deg)';
        }, 860);
      }
      StudentModule.renderTable();
      Toast.show('Dashboard data refreshed', 'success');
    });
  }

  /* ── 08d. Fullscreen toggle ──────────────────────────────────────────── */

  function initFullscreen() {
    if (!DOM.btnFullscreen) return;
    DOM.btnFullscreen.addEventListener('click', () => {
      const icon = DOM.btnFullscreen.querySelector('i');
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
          if (icon) { icon.className = 'fas fa-compress'; }
          DOM.btnFullscreen.setAttribute('aria-label', 'Exit fullscreen');
        }).catch(() => {});
      } else {
        document.exitFullscreen().then(() => {
          if (icon) { icon.className = 'fas fa-expand'; }
          DOM.btnFullscreen.setAttribute('aria-label', 'Toggle fullscreen');
        }).catch(() => {});
      }
    });

    document.addEventListener('fullscreenchange', () => {
      const icon = DOM.btnFullscreen.querySelector('i');
      if (!document.fullscreenElement && icon) {
        icon.className = 'fas fa-expand';
      }
    });
  }

  /* ── 08e. Theme toggle ───────────────────────────────────────────────── */

  function initTheme() {
    if (!DOM.btnTheme) return;

    const saved = lsGet('cms_theme_v2', 'light');
    applyTheme(saved);

    DOM.btnTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next    = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      lsSet('cms_theme_v2', next);
      localStorage.setItem('cms_theme_v2', next);
      Toast.show(`Switched to ${next} mode`, 'info');
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = DOM.btnTheme ? DOM.btnTheme.querySelector('i') : null;
    if (theme === 'light') {
      if (icon) icon.className = 'fas fa-moon';
      DOM.btnTheme && DOM.btnTheme.setAttribute('aria-label', 'Switch to dark mode');
    } else {
      if (icon) icon.className = 'fas fa-circle-half-stroke';
      DOM.btnTheme && DOM.btnTheme.setAttribute('aria-label', 'Switch to light mode');
    }
  }

  /* ── 08f. Help ───────────────────────────────────────────────────────── */

  function initHelp() {
    if (!DOM.btnHelp) return;
    DOM.btnHelp.addEventListener('click', () => {
      Toast.show('Documentation portal — coming soon', 'info');
    });
  }

  function init() {
    initSearch();
    initNotifications();
    initRefresh();
    initFullscreen();
    initTheme();
    initHelp();
  }

  return { init };
})();


/* =============================================================================
   09. STUDENT CRUD MODULE
   ============================================================================= */

const StudentModule = (() => {

  /* ────────────────────────────────────────────────────────────────────────
     09a. localStorage Store
  ─────────────────────────────────────────────────────────────────────────*/

  const DEPARTMENTS = [
    'Computer Science',
    'Business Admin',
    'Engineering',
    'Medical Sciences',
    'Arts & Humanities',
  ];

  const STATUSES = ['Enrolled', 'Pending', 'Under Review', 'Rejected', 'Suspended'];

  // In-memory cache populated from API. Never seeded from localStorage.
  let studentsCache = [];

  /** Fetch ALL students from the backend API. Always replaces the cache — no localStorage. */
  async function fetchStudentsFromAPI() {
    if (Auth.getRole() === 'student') return studentsCache;
    try {
      const response = await Auth.fetch('/students');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      const raw = (result && Array.isArray(result.data)) ? result.data : [];
      // Normalise _id → id so every cache lookup uses s.id consistently
      studentsCache = raw.map(s => ({ ...s, id: String(s._id || s.id || '') }));
    } catch (err) {
      console.error('[CMS] fetchStudentsFromAPI failed:', err);
      // Keep whatever was already in cache so the UI doesn't blank out
    }
    return studentsCache;
  }

  /** Return the live in-memory cache. */
  function loadStudents() {
    return studentsCache;
  }

  /** Look up a single student from the cache by id. */
  function getStudent(id) {
    return studentsCache.find(s => s.id === id) || null;
  }



  /** Update an existing student via API. Returns updated student or null. */
  async function updateStudent(id, data) {
    try {
      const res = await Auth.fetch(`/students/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || 'Update failed');
      }
      const result = await res.json();
      await fetchStudentsFromAPI();
      const updated = result.data || result.student || null;
      if (updated) logActivity(`Student record updated: <strong>${updated.name}</strong>`);
      return updated;
    } catch (err) {
      console.error('[CMS] PUT student failed', err);
      throw err;
    }
  }

  /** Delete a student via API. Returns true if deleted. */
  async function deleteStudent(id) {
    try {
      const student = getStudent(id);
      const res = await Auth.fetch(`/students/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || 'Delete failed');
      }
      await fetchStudentsFromAPI();
      if (student) logActivity(`Student record deleted: <strong>${student.name}</strong>`, 'danger');
      return true;
    } catch (err) {
      console.error('[CMS] DELETE student failed', err);
      throw err;
    }
  }

  /**
   * Safe lowercase helper — returns '' for null/undefined/non-string values
   * so `.includes()` never throws a TypeError.
   */
  function sl(val) {
    return val == null ? '' : String(val).toLowerCase();
  }

  /** Filter and sort students based on current filter state. Pure — no side effects. */
  function filteredStudents() {
    const { query, status, dept } = CMS.state.studentFilter;
    let list = loadStudents();

    if (query) {
      const q = query.toLowerCase().trim();
      list = list.filter(s =>
        sl(s.name).includes(q)        ||
        sl(s.rollNo).includes(q)      ||
        sl(s.admissionNo).includes(q) ||
        sl(s.email).includes(q)       ||
        sl(s.department).includes(q)  ||
        sl(s.semester).includes(q)    ||
        sl(s.section).includes(q)
      );
    }

    if (status !== 'all') {
      list = list.filter(s => s.status === status);
    }

    if (dept !== 'all') {
      list = list.filter(s => s.department === dept);
    }

    // Newest first
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /* ────────────────────────────────────────────────────────────────────────
     09b. Student Modal UI
  ─────────────────────────────────────────────────────────────────────────*/

  const inputStyle = `
    width:100%; padding:9px 12px;
    background:var(--color-navy-800);
    border:1px solid var(--color-border);
    border-radius:var(--radius-sm,6px);
    color:var(--color-white);
    font-family:var(--font-ui,'DM Sans',sans-serif);
    font-size:13px;
    outline:none;
    transition:border-color 0.15s, box-shadow 0.15s;
  `;

  const labelStyle = `
    display:block; margin-bottom:5px;
    font-size:11px; font-weight:700;
    letter-spacing:0.07em; text-transform:uppercase;
    color:#8BA3BC;
  `;

  const fieldWrap = `margin-bottom:16px;`;

  function buildFormHTML(student = null) {
    const v = student || {};
    const deptOptions = DEPARTMENTS.map(d =>
      `<option value="${d}" ${v.department === d ? 'selected' : ''}>${d}</option>`
    ).join('');

    const statusOptions = STATUSES.map(s =>
      `<option value="${s}" ${(v.status || 'Pending') === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    return `
    <form id="student-form" novalidate autocomplete="off">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px;">

        <div style="${fieldWrap}">
          <label for="sf-name" style="${labelStyle}">Full Name *</label>
          <input id="sf-name" name="name" type="text" required
            placeholder="e.g. Priya Kapoor"
            value="${v.name || ''}"
            style="${inputStyle}" />
          <div class="field-error" style="color:var(--color-danger,#F25F5C);font-size:11px;margin-top:4px;display:none;"></div>
        </div>

        <div style="${fieldWrap}">
          <label for="sf-email" style="${labelStyle}">Email Address *</label>
          <input id="sf-email" name="email" type="email" required
            placeholder="student@nims.edu"
            value="${v.email || ''}"
            style="${inputStyle}" />
          <div class="field-error" style="color:var(--color-danger,#F25F5C);font-size:11px;margin-top:4px;display:none;"></div>
        </div>

        <div style="${fieldWrap}">
          <label for="sf-phone" style="${labelStyle}">Phone Number</label>
          <input id="sf-phone" name="phone" type="tel"
            placeholder="+91 98765 43210"
            value="${v.phone || ''}"
            style="${inputStyle}" />
        </div>

        <div style="${fieldWrap}">
          <label for="sf-dob" style="${labelStyle}">Date of Birth</label>
          <input id="sf-dob" name="dob" type="date"
            value="${v.dob || ''}"
            style="${inputStyle}" />
        </div>

        <div style="${fieldWrap}">
          <label for="sf-dept" style="${labelStyle}">Department *</label>
          <select id="sf-dept" name="department" required style="${inputStyle}cursor:pointer;">
            <option value="" disabled ${!v.department ? 'selected' : ''}>Select department</option>
            ${deptOptions}
          </select>
          <div class="field-error" style="color:var(--color-danger,#F25F5C);font-size:11px;margin-top:4px;display:none;"></div>
        </div>

        <div style="${fieldWrap}">
          <label for="sf-batch" style="${labelStyle}">Batch *</label>
          <select id="sf-batch" name="batch" required style="${inputStyle}cursor:pointer;">
            <option value="" disabled ${!v.batch ? 'selected' : ''}>Select batch</option>
            ${['2021-2025','2022-2026','2023-2027','2024-2028','2025-2029'].map(b =>
              `<option value="${b}" ${(v.batch || '') === b ? 'selected' : ''}>${b}</option>`
            ).join('')}
          </select>
          <div class="field-error" style="color:var(--color-danger,#F25F5C);font-size:11px;margin-top:4px;display:none;"></div>
        </div>


        <div style="${fieldWrap}">
          <label for="sf-rollno" style="${labelStyle}">Student ID</label>
          <input id="sf-rollno" name="rollNo" type="text"
            placeholder="Leave blank to auto-generate"
            value="${v.rollNo || ''}"
            style="${inputStyle}" />
          <div class="field-error" style="color:var(--color-danger,#F25F5C);font-size:11px;margin-top:4px;display:none;"></div>
        </div>

        <div style="${fieldWrap}">
          <label for="sf-course" style="${labelStyle}">Course / Programme *</label>
          <input id="sf-course" name="course" type="text" required
            placeholder="e.g. B.Sc. Computer Science"
            value="${v.course || ''}"
            style="${inputStyle}" />
          <div class="field-error" style="color:var(--color-danger,#F25F5C);font-size:11px;margin-top:4px;display:none;"></div>
        </div>

        <div style="${fieldWrap}">
          <label for="sf-semester" style="${labelStyle}">Semester</label>
          <select id="sf-semester" name="semester" style="${inputStyle}cursor:pointer;">
            ${[1,2,3,4,5,6,7,8].map(n =>
              `<option value="${n}" ${(v.semester || '1') == n ? 'selected' : ''}>Semester ${n}</option>`
            ).join('')}
          </select>
        </div>

        <div style="${fieldWrap}">
          <label for="sf-section" style="${labelStyle}">Section</label>
          <select id="sf-section" name="section" style="${inputStyle}cursor:pointer;">
            <option value="" ${!v.section ? 'selected' : ''}>None</option>
            ${['A','B','C','D'].map(s =>
              `<option value="${s}" ${(v.section || '') === s ? 'selected' : ''}>Section ${s}</option>`
            ).join('')}
          </select>
        </div>

        <div style="${fieldWrap}">
          <label for="sf-gender" style="${labelStyle}">Gender</label>
          <select id="sf-gender" name="gender" style="${inputStyle}cursor:pointer;">
            ${['Male','Female','Non-binary','Prefer not to say'].map(g =>
              `<option value="${g}" ${(v.gender || 'Prefer not to say') === g ? 'selected' : ''}>${g}</option>`
            ).join('')}
          </select>
        </div>

        <div style="${fieldWrap}grid-column:1/-1;">
          <label for="sf-address" style="${labelStyle}">Address</label>
          <textarea id="sf-address" name="address" rows="2"
            placeholder="Street, City, State, PIN"
            style="${inputStyle}resize:vertical;">${v.address || ''}</textarea>
        </div>

        <div style="${fieldWrap}">
          <label for="sf-status" style="${labelStyle}">Admission Status</label>
          <select id="sf-status" name="status" style="${inputStyle}cursor:pointer;">
            ${statusOptions}
          </select>
        </div>

        <div style="${fieldWrap};display:flex;align-items:center;gap:10px;padding-top:20px;">
          <input id="sf-fees" name="feesPaid" type="checkbox" ${v.feesPaid ? 'checked' : ''}
            style="width:15px;height:15px;accent-color:var(--color-cyan-400,#00D4FF);cursor:pointer;" />
          <label for="sf-fees" style="font-size:13px;font-weight:500;color:var(--color-white-soft,#E2EAF4);cursor:pointer;">
            Fees Paid for This Semester
          </label>
        </div>

      </div>

    </form>
    `;
  }

  /** Focus styles via event listeners (applied to dynamically created inputs) */
  function attachInputFocus(container) {
    $$('input, select, textarea', container).forEach(el => {
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

  /** Validate the student form. Returns { valid, errors } */
  function validateForm(form) {
    const errors = {};

    const name   = form.querySelector('#sf-name');
    const email  = form.querySelector('#sf-email');
    const dept   = form.querySelector('#sf-dept');
    const batch  = form.querySelector('#sf-batch');
    const rollNo = form.querySelector('#sf-rollno');
    const course = form.querySelector('#sf-course');

    if (!name.value.trim() || name.value.trim().length < 2) {
      errors.name = 'Full name must be at least 2 characters';
    }

    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.value.trim() || !emailRx.test(email.value.trim())) {
      errors.email = 'Enter a valid email address';
    }

    if (!dept.value) {
      errors.department = 'Please select a department';
    }

    if (!batch.value) {
      errors.batch = 'Please select a batch';
    }

    if (rollNo.value.trim() && rollNo.value.trim().length < 4) {
      errors.rollNo = 'Student ID must be at least 4 characters or leave blank';
    }

    if (!course.value.trim() || course.value.trim().length < 2) {
      errors.course = 'Course / programme name is required';
    }

    // Render errors
    form.querySelectorAll('.field-error').forEach(el => {
      el.textContent = '';
      el.style.display = 'none';
    });

    // Map field-id → error key
    const fieldMap = {
      'sf-name': 'name',
      'sf-email': 'email',
      'sf-dept': 'department',
      'sf-batch': 'batch',
      'sf-rollno': 'rollNo',
      'sf-course': 'course',
    };
    Object.entries(fieldMap).forEach(([fieldId, errKey]) => {
      if (errors[errKey]) {
        const field   = form.querySelector(`#${fieldId}`);
        const errEl   = field?.nextElementSibling;
        if (errEl && errEl.classList.contains('field-error')) {
          errEl.textContent    = errors[errKey];
          errEl.style.display  = 'block';
          field.style.borderColor = 'rgba(242,95,92,0.50)';
        }
      }
    });

    return { valid: Object.keys(errors).length === 0 };
  }

  /** Collect form data as a plain object */
  function collectForm(form) {
    return {
      name:       form.querySelector('#sf-name').value,
      email:      form.querySelector('#sf-email').value,
      rollNo:     form.querySelector('#sf-rollno').value,
      phone:      form.querySelector('#sf-phone').value,
      dob:        form.querySelector('#sf-dob').value,
      department: form.querySelector('#sf-dept').value,
      batch:      form.querySelector('#sf-batch').value,
      course:     form.querySelector('#sf-course').value,
      semester:   form.querySelector('#sf-semester').value,
      section:    form.querySelector('#sf-section').value,
      gender:     form.querySelector('#sf-gender').value,
      address:    form.querySelector('#sf-address').value,
      status:     form.querySelector('#sf-status').value,
      feesPaid:   form.querySelector('#sf-fees').checked,
    };
  }

  /* ── Open Add Modal ─────────────────────────────────────────────────── */

  function openAddModal() {
    CMS.state.editingStudentId = null;

    const modal = Modal.create({
      id:       'modal-add-student',
      title:    'Enrol New Student',
      size:     'lg',
      bodyHTML: buildFormHTML(),
      footerHTML: `
        <button id="btn-modal-cancel" style="
          padding:9px 20px; border-radius:var(--radius-sm,6px);
          border:1px solid rgba(139,163,188,0.22);
          background:rgba(255,255,255,0.04);
          color:var(--color-slate-300,#B0C4D8);
          font-size:13px; font-weight:600; cursor:pointer;
          transition:background 0.15s, border-color 0.15s;
        ">Cancel</button>
        <button id="btn-modal-save" style="
          padding:9px 24px; border-radius:var(--radius-sm,6px);
          border:1px solid rgba(0,212,255,0.30);
          background:rgba(0,212,255,0.12);
          color:var(--color-cyan-400,#00D4FF);
          font-size:13px; font-weight:700; cursor:pointer;
          transition:background 0.15s, border-color 0.15s, box-shadow 0.15s;
          display:flex;align-items:center;gap:8px;
        "><i class="fas fa-user-plus" aria-hidden="true"></i> Enrol Student</button>
      `,
    });

    modal.open();
    attachInputFocus(modal.body());

    modal.footer().querySelector('#btn-modal-cancel').addEventListener('click', () => modal.close());

    const saveBtn = modal.footer().querySelector('#btn-modal-save');
    saveBtn.addEventListener('mouseenter', () => {
      saveBtn.style.background = 'rgba(0,212,255,0.20)';
      saveBtn.style.borderColor = 'rgba(0,212,255,0.50)';
      saveBtn.style.boxShadow = '0 0 16px rgba(0,212,255,0.15)';
    });
    saveBtn.addEventListener('mouseleave', () => {
      saveBtn.style.background = 'rgba(0,212,255,0.12)';
      saveBtn.style.borderColor = 'rgba(0,212,255,0.30)';
      saveBtn.style.boxShadow = 'none';
    });

    saveBtn.addEventListener('click', async () => {
      const form = modal.body().querySelector('#student-form');
      const { valid } = validateForm(form);
      if (!valid) return;

      const data = collectForm(form);

      try {
        const res = await Auth.fetch('/students', {
          method: 'POST',
          body: JSON.stringify(data),
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const msg = errBody.message || errBody.error || res.statusText || 'Server error';
          Toast.show(`Failed to enrol student — ${msg}`, 'danger');
          return;
        }

        const result = await res.json().catch(() => null);

        // Reload from API, reset search state, then refresh UI
        await fetchStudentsFromAPI();
        CMS.state.studentFilter = { query: '', status: 'all', dept: 'all' };
        currentPage = 1;
        // Clear the search inputs so they match the reset state
        const si = $('#students-search');
        if (si) si.value = '';
        DOM.searchInput.value = '';
        const fs = $('#filter-status');
        if (fs) fs.value = 'all';
        const fd = $('#filter-dept');
        if (fd) fd.value = 'all';

        modal.close();
        renderTable();

        const created = result && (result.data || result.student) ? (result.data || result.student) : null;
        const name = created?.name || data.name;
        const adm  = created?.admissionNo || '';
        Toast.show(`<strong>${name}</strong> enrolled successfully ${adm ? `(${adm})` : ''}`, 'success');
      } catch (err) {
        console.error('[CMS] POST /api/students failed', err);
        Toast.show('Failed to enrol student — network error', 'danger');
      }
    });
  }

  /* ── Open Edit Modal ────────────────────────────────────────────────── */

  function openEditModal(id) {
    const student = getStudent(id);
    if (!student) {
      Toast.show('Student record not found', 'danger');
      return;
    }

    CMS.state.editingStudentId = id;

    const modal = Modal.create({
      id:       'modal-edit-student',
      title:    `Edit — ${student.name}`,
      size:     'lg',
      bodyHTML: buildFormHTML(student),
      footerHTML: `
        <button id="btn-modal-delete" style="
          padding:9px 18px; border-radius:var(--radius-sm,6px);
          border:1px solid rgba(242,95,92,0.28);
          background:rgba(242,95,92,0.08);
          color:var(--color-danger,#F25F5C);
          font-size:13px; font-weight:700; cursor:pointer;
          margin-right:auto;
          transition:background 0.15s;
        "><i class="fas fa-trash-can" aria-hidden="true"></i> Delete</button>
        <button id="btn-modal-cancel" style="
          padding:9px 20px; border-radius:var(--radius-sm,6px);
          border:1px solid rgba(139,163,188,0.22);
          background:rgba(255,255,255,0.04);
          color:var(--color-slate-300,#B0C4D8);
          font-size:13px; font-weight:600; cursor:pointer;
        ">Cancel</button>
        <button id="btn-modal-save" style="
          padding:9px 24px; border-radius:var(--radius-sm,6px);
          border:1px solid rgba(0,212,255,0.30);
          background:rgba(0,212,255,0.12);
          color:var(--color-cyan-400,#00D4FF);
          font-size:13px; font-weight:700; cursor:pointer;
          display:flex;align-items:center;gap:8px;
        "><i class="fas fa-floppy-disk" aria-hidden="true"></i> Save Changes</button>
      `,
    });

    modal.open();
    attachInputFocus(modal.body());

    modal.footer().querySelector('#btn-modal-cancel').addEventListener('click', () => modal.close());

    modal.footer().querySelector('#btn-modal-delete').addEventListener('click', () => {
      modal.close();
      openDeleteConfirm(id, student.name);
    });

    modal.footer().querySelector('#btn-modal-save').addEventListener('click', async () => {
      const form = modal.body().querySelector('#student-form');
      const { valid } = validateForm(form);
      if (!valid) return;

      const data = collectForm(form);
      try {
        const updated = await updateStudent(id, data);
        modal.close();
        renderTable();
        const name = updated?.name || data.name;
        Toast.show(`<strong>${name}</strong>'s record updated`, 'success');
      } catch (err) {
        Toast.show(`Update failed — ${err.message}`, 'danger');
      }
    });
  }

  /* ── Open View / Detail Modal ───────────────────────────────────────── */

  function openViewModal(id) {
    const s = getStudent(id);
    if (!s) {
      Toast.show('Student record not found', 'danger');
      return;
    }

    const primaryColor = '#C8102E';
    const badgeColors = {
      Enrolled:     ['rgba(34,211,163,0.12)', 'var(--color-success)', 'rgba(34,211,163,0.25)'],
      Pending:      ['rgba(245,165,36,0.12)',  'var(--color-warning)', 'rgba(245,165,36,0.25)'],
      'Under Review':['rgba(129,140,248,0.12)','var(--color-info)',   'rgba(129,140,248,0.25)'],
      Rejected:     ['rgba(242,95,92,0.12)',   'var(--color-danger)', 'rgba(242,95,92,0.25)'],
      Suspended:    ['rgba(242,95,92,0.12)',   'var(--color-danger)', 'rgba(242,95,92,0.25)'],
    };
    const [bg, fg, border] = badgeColors[s.status] || badgeColors.Pending;

    const row = (label, value) => `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:9px 0;border-bottom:1px solid rgba(139,163,188,0.10);">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;
                     letter-spacing:0.07em;color:var(--color-slate-400,#8BA3BC);">${label}</span>
        <span style="font-size:13px;font-weight:500;
                     color:var(--color-white-soft,#E2EAF4);text-align:right;max-width:60%;">${value || '—'}</span>
      </div>
    `;

    const bodyHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;
                  padding:16px;background:rgba(0,212,255,0.04);
                  border:1px solid rgba(0,212,255,0.12);border-radius:var(--radius-md,10px);">
        <div style="
          width:52px;height:52px;border-radius:50%;flex-shrink:0;
          background:linear-gradient(135deg,rgba(0,212,255,0.20),rgba(42,78,127,0.50));
          border:2px solid rgba(0,212,255,0.30);
          display:flex;align-items:center;justify-content:center;
          font-size:18px;font-weight:700;
          color:var(--color-cyan-400,#00D4FF);
          font-family:var(--font-ui,'DM Sans',sans-serif);
          box-shadow:0 0 16px rgba(0,212,255,0.15);
        ">${initials(s.name)}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:17px;font-weight:700;color:#fff;letter-spacing:-0.01em;">${s.name}</div>
          <div style="font-size:12px;color:var(--color-slate-400,#8BA3BC);margin-top:3px;">
            ${s.admissionNo} · ${s.rollNo}
          </div>
        </div>
        <span style="
          display:inline-flex;align-items:center;gap:5px;
          padding:4px 12px;border-radius:99px;
          background:${bg};color:${fg};
          border:1px solid ${border};
          font-size:11px;font-weight:700;
          letter-spacing:0.04em;
        ">
          <span style="width:5px;height:5px;border-radius:50%;background:${fg};display:inline-block;"></span>
          ${s.status}
        </span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 24px;">
        <div>
          ${row('Email', `<a href="mailto:${s.email}" style="color:var(--color-cyan-400,#00D4FF);">${s.email}</a>`)}
          ${row('Phone', s.phone)}
          ${row('Date of Birth', s.dob ? new Date(s.dob).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '')}
          ${row('Gender', s.gender)}
          ${row('Enrolled On', formatDate(new Date(s.createdAt)))}
        </div>
        <div>
          ${row('Department', s.department)}
          ${row('Course', s.course)}
          ${row('Semester', `Semester ${s.semester}`)}
          ${row('Fees Paid', s.feesPaid ? '<span style="color:var(--color-success,#22D3A3);">✓ Yes</span>' : '<span style="color:var(--color-danger,#F25F5C);">✗ No</span>')}
          ${row('Last Updated', formatDate(new Date(s.updatedAt)))}
        </div>
      </div>

      ${s.address ? `
        <div style="margin-top:4px;">
          ${row('Address', s.address)}
        </div>
      ` : ''}
    `;

    const modal = Modal.create({
      id:       'modal-view-student',
      title:    'Student Profile',
      size:     'lg',
      bodyHTML,
      footerHTML: `
        <button id="btn-modal-edit" style="
          padding:9px 20px; border-radius:var(--radius-sm,6px);
          border:1px solid rgba(0,212,255,0.28);
          background:rgba(0,212,255,0.08);
          color:var(--color-cyan-400,#00D4FF);
          font-size:13px; font-weight:700; cursor:pointer;
          display:flex;align-items:center;gap:8px;
        "><i class="fas fa-pen" aria-hidden="true"></i> Edit Student</button>
        <button id="btn-modal-close" style="
          padding:9px 20px; border-radius:var(--radius-sm,6px);
          border:1px solid rgba(139,163,188,0.22);
          background:rgba(255,255,255,0.04);
          color:var(--color-slate-300,#B0C4D8);
          font-size:13px; font-weight:600; cursor:pointer;
        ">Close</button>
      `,
    });

    modal.open();

    modal.footer().querySelector('#btn-modal-close').addEventListener('click', () => modal.close());
    modal.footer().querySelector('#btn-modal-edit').addEventListener('click', () => {
      modal.close();
      setTimeout(() => openEditModal(id), 280);
    });
  }

  /* ── Delete Confirmation ─────────────────────────────────────────────── */

  function openDeleteConfirm(id, name) {
    const modal = Modal.create({
      id:       'modal-delete-confirm',
      title:    'Delete Student Record',
      size:     'sm',
      bodyHTML: `
        <div style="text-align:center;padding:8px 0 4px;">
          <div style="
            width:56px;height:56px;border-radius:50%;
            background:rgba(242,95,92,0.12);
            border:2px solid rgba(242,95,92,0.30);
            display:flex;align-items:center;justify-content:center;
            margin:0 auto 16px;font-size:22px;
            color:var(--color-danger,#F25F5C);
          "><i class="fas fa-trash-can" aria-hidden="true"></i></div>
          <p style="font-size:15px;font-weight:600;color:#fff;margin-bottom:8px;">
            Delete <span style="color:var(--color-danger,#F25F5C);">${name}</span>?
          </p>
          <p style="font-size:13px;color:var(--color-slate-400,#8BA3BC);line-height:1.6;">
            This action is permanent and cannot be undone.<br>
            All associated data will be removed from the system.
          </p>
        </div>
      `,
      footerHTML: `
        <button id="btn-del-cancel" style="
          padding:9px 20px; border-radius:var(--radius-sm,6px);
          border:1px solid rgba(139,163,188,0.22);
          background:rgba(255,255,255,0.04);
          color:var(--color-slate-300,#B0C4D8);
          font-size:13px; font-weight:600; cursor:pointer; flex:1;
        ">Cancel</button>
        <button id="btn-del-confirm" style="
          padding:9px 20px; border-radius:var(--radius-sm,6px);
          border:1px solid rgba(242,95,92,0.40);
          background:rgba(242,95,92,0.16);
          color:var(--color-danger,#F25F5C);
          font-size:13px; font-weight:700; cursor:pointer; flex:1;
          display:flex;align-items:center;justify-content:center;gap:7px;
        "><i class="fas fa-trash-can" aria-hidden="true"></i> Yes, Delete</button>
      `,
    });

    modal.open();

    modal.footer().querySelector('#btn-del-cancel').addEventListener('click', () => modal.close());

    modal.footer().querySelector('#btn-del-confirm').addEventListener('click', async () => {
      try {
        await deleteStudent(id);
        modal.close();
        renderTable();
        Toast.show(`Student record for <strong>${name}</strong> deleted`, 'danger');
      } catch (err) {
        modal.close();
        Toast.show(`Delete failed — ${err.message}`, 'warning');
      }
    });
  }

  /* ────────────────────────────────────────────────────────────────────────
     09c. Table Renderer — renders the Students page table
  ─────────────────────────────────────────────────────────────────────────*/

  /**
   * Ensures the Students section has a full management UI.
   * Called once when nav switches to "students".
   */
  function ensureStudentSection() {
    // If we're on the students section but page-content only has
    // the dashboard sections, inject a student management view.
    let section = $('#students-section');
    if (section) return;   // already injected

    section = document.createElement('section');
    section.id = 'students-section';
    section.setAttribute('aria-labelledby', 'students-section-title');

    section.innerHTML = `
      <h2 class="section-title" id="students-section-title">Students</h2>

      <!-- Controls bar -->
      <div id="students-controls" style="
        display:flex; gap:12px; align-items:center; flex-wrap:wrap;
        margin-bottom:16px;
      ">
        <!-- Search -->
        <div style="
          display:flex; align-items:center; gap:8px;
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(139,163,188,0.18);
          border-radius:var(--radius-md,10px);
          padding:0 12px; height:38px; flex:1; min-width:200px;
          transition:border-color 0.2s, box-shadow 0.2s;
        " id="students-search-wrap">
          <i class="fas fa-search" style="color:var(--color-slate-400,#8BA3BC);font-size:12px;" aria-hidden="true"></i>
          <input type="search" id="students-search" placeholder="Search by name, ID, email, department…"
            style="
              background:none;border:none;outline:none;
              font-family:var(--font-ui,'DM Sans',sans-serif);font-size:13px;
              color:var(--color-cyan-400,#00D4FF);flex:1;
            " aria-label="Search students" />
        </div>

        <!-- Status filter -->
        <select id="filter-status" aria-label="Filter by status" style="
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(139,163,188,0.18);
          border-radius:var(--radius-sm,6px);
          color:var(--color-white-soft,#E2EAF4);
          font-family:var(--font-ui,'DM Sans',sans-serif);
          font-size:12px; padding:8px 10px; cursor:pointer;
          height:38px; outline:none;
        ">
          <option value="all">All Statuses</option>
          <option value="Enrolled">Enrolled</option>
          <option value="Pending">Pending</option>
          <option value="Under Review">Under Review</option>
          <option value="Rejected">Rejected</option>
          <option value="Suspended">Suspended</option>
        </select>

        <!-- Dept filter -->
        <select id="filter-dept" aria-label="Filter by department" style="
          background:rgba(255,255,255,0.04);
          border:1px solid rgba(139,163,188,0.18);
          border-radius:var(--radius-sm,6px);
          color:var(--color-white-soft,#E2EAF4);
          font-family:var(--font-ui,'DM Sans',sans-serif);
          font-size:12px; padding:8px 10px; cursor:pointer;
          height:38px; outline:none;
        ">
          <option value="all">All Departments</option>
          ${DEPARTMENTS.map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>

        <!-- Add button -->
        <button id="btn-add-student" style="
          display:flex; align-items:center; gap:8px;
          padding:0 18px; height:38px;
          background:rgba(0,212,255,0.12);
          border:1px solid rgba(0,212,255,0.28);
          border-radius:var(--radius-sm,6px);
          color:var(--color-cyan-400,#00D4FF);
          font-family:var(--font-ui,'DM Sans',sans-serif);
          font-size:13px; font-weight:700; cursor:pointer;
          white-space:nowrap;
          transition:background 0.15s, border-color 0.15s, box-shadow 0.15s;
        ">
          <i class="fas fa-user-plus" aria-hidden="true"></i> Enrol Student
        </button>
      </div>

      <!-- Table card -->
      <div class="card" id="students-table-card">
        <div class="card-header">
          <div>
            <div class="card-title">Student Records</div>
            <div class="card-subtitle" id="students-table-count">Loading…</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="btn-export-csv" style="
              display:flex;align-items:center;gap:6px;
              padding:5px 12px;border-radius:var(--radius-sm,6px);
              border:1px solid rgba(139,163,188,0.22);
              background:rgba(255,255,255,0.03);
              color:var(--color-slate-300,#B0C4D8);
              font-size:12px;font-weight:600;cursor:pointer;
              font-family:var(--font-ui,'DM Sans',sans-serif);
              transition:background 0.15s;
            ">
              <i class="fas fa-file-csv" aria-hidden="true"></i> Export CSV
            </button>
          </div>
        </div>
        <div class="card-body card-body--flush">
          <div style="overflow-x:auto;">
            <table class="data-table" id="students-data-table" aria-label="Student records">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Admission No</th>
                  <th scope="col">Student ID</th>
                  <th scope="col">Department</th>
                  <th scope="col">Batch</th>
                  <th scope="col">Course</th>
                  <th scope="col">Sem</th>
                  <th scope="col">Section</th>
                  <th scope="col">Fees</th>
                  <th scope="col">Status</th>
                  <th scope="col">Enrolled</th>
                  <th scope="col" aria-label="Actions"></th>
                </tr>
              </thead>
              <tbody id="students-tbody"></tbody>
            </table>
          </div>
        </div>

        <!-- Empty state -->
        <div id="students-empty" style="
          display:none; text-align:center;
          padding:48px 24px; color:var(--color-slate-400,#8BA3BC);
        ">
          <i class="fas fa-user-graduate" style="font-size:36px;margin-bottom:14px;display:block;opacity:0.35;" aria-hidden="true"></i>
          <p style="font-size:15px;font-weight:600;color:var(--color-white-soft,#E2EAF4);margin-bottom:6px;">No students found</p>
          <p style="font-size:13px;">Try adjusting your search or filters, or enrol a new student.</p>
          <button id="btn-empty-add" style="
            margin-top:18px;padding:9px 22px;
            border-radius:var(--radius-sm,6px);
            border:1px solid rgba(0,212,255,0.28);
            background:rgba(0,212,255,0.08);
            color:var(--color-cyan-400,#00D4FF);
            font-size:13px;font-weight:700;cursor:pointer;
            font-family:var(--font-ui,'DM Sans',sans-serif);
          "><i class="fas fa-user-plus"></i> Enrol First Student</button>
        </div>

      </div>

      <!-- Pagination stub -->
      <div id="students-pagination" style="
        display:flex;align-items:center;justify-content:space-between;
        margin-top:14px; padding:0 2px;
      ">
        <span id="students-pagination-info" style="font-size:12px;color:var(--color-slate-400,#8BA3BC);"></span>
        <div id="students-pagination-btns" style="display:flex;gap:6px;"></div>
      </div>
    `;

    DOM.pageContent.appendChild(section);

    // Wire controls
    const searchInput = section.querySelector('#students-search');
    const searchWrap  = section.querySelector('#students-search-wrap');
    const filterStatus = section.querySelector('#filter-status');
    const filterDept   = section.querySelector('#filter-dept');
    const addBtn       = section.querySelector('#btn-add-student');
    const exportBtn    = section.querySelector('#btn-export-csv');
    const emptyAddBtn  = section.querySelector('#btn-empty-add');

    searchWrap.addEventListener('focusin', () => {
      searchWrap.style.borderColor = 'rgba(0,212,255,0.35)';
      searchWrap.style.boxShadow   = '0 0 0 3px rgba(0,212,255,0.08)';
    });
    searchWrap.addEventListener('focusout', () => {
      searchWrap.style.borderColor = 'rgba(139,163,188,0.18)';
      searchWrap.style.boxShadow   = 'none';
    });

    searchInput.addEventListener('input', debounce(e => {
      CMS.state.studentFilter.query = e.target.value.trim();
      currentPage = 1;  // reset to first page on every new search
      renderTable();
    }, CMS.config.searchDebounce));

    filterStatus.addEventListener('change', e => {
      CMS.state.studentFilter.status = e.target.value;
      currentPage = 1;
      renderTable();
    });

    filterDept.addEventListener('change', e => {
      CMS.state.studentFilter.dept = e.target.value;
      currentPage = 1;
      renderTable();
    });

    addBtn.addEventListener('click', openAddModal);
    addBtn.addEventListener('mouseenter', () => {
      addBtn.style.background = 'rgba(0,212,255,0.20)';
      addBtn.style.boxShadow  = '0 0 16px rgba(0,212,255,0.12)';
    });
    addBtn.addEventListener('mouseleave', () => {
      addBtn.style.background = 'rgba(0,212,255,0.12)';
      addBtn.style.boxShadow  = 'none';
    });

    emptyAddBtn && emptyAddBtn.addEventListener('click', openAddModal);

    exportBtn.addEventListener('click', exportCSV);
    exportBtn.addEventListener('mouseenter', () => exportBtn.style.background = 'rgba(255,255,255,0.07)');
    exportBtn.addEventListener('mouseleave', () => exportBtn.style.background = 'rgba(255,255,255,0.03)');

    // Sync header search → students-section search (keeps both inputs aligned)
    DOM.searchInput.addEventListener('input', debounce(e => {
      if (CMS.state.activeSection !== 'students') return;
      const q = e.target.value.trim();
      searchInput.value = q;
      CMS.state.studentFilter.query = q;
      currentPage = 1;
      renderTable();
    }, CMS.config.searchDebounce));

    // Also sync students-section search → header search bar
    searchInput.addEventListener('input', () => {
      DOM.searchInput.value = searchInput.value;
    });
  }

  const ROWS_PER_PAGE = 10;
  let currentPage = 1;

  function renderTable() {
    ensureStudentSection();

    const tbody     = $('#students-tbody');
    const emptyEl   = $('#students-empty');
    const countEl   = $('#students-table-count');
    const pgInfo    = $('#students-pagination-info');
    const pgBtns    = $('#students-pagination-btns');

    if (!tbody) return;

    const all    = filteredStudents();
    const total  = all.length;
    const pages  = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));

    if (currentPage > pages) currentPage = 1;

    const start  = (currentPage - 1) * ROWS_PER_PAGE;
    const end    = Math.min(start + ROWS_PER_PAGE, total);
    const page   = all.slice(start, end);

    // Empty state
    if (!total) {
      tbody.innerHTML = '';
      if (emptyEl) {
        emptyEl.style.display = 'block';
        // Show a contextual message depending on whether a filter is active
        const hasFilter = CMS.state.studentFilter.query ||
                          CMS.state.studentFilter.status !== 'all' ||
                          CMS.state.studentFilter.dept   !== 'all';
        const msgEl  = emptyEl.querySelector('p:first-of-type');
        const subEl  = emptyEl.querySelector('p:last-of-type');
        if (msgEl) msgEl.textContent = hasFilter ? 'No Students Found' : 'No students enrolled yet';
        if (subEl) subEl.textContent = hasFilter
          ? 'No students match your search or filters. Try different keywords.'
          : 'Enrol your first student using the button above.';
      }
      if (countEl) countEl.textContent = CMS.state.studentFilter.query
        ? `No results for "${CMS.state.studentFilter.query}"`
        : 'No records match your filters';
      if (pgInfo)  pgInfo.textContent  = '';
      if (pgBtns)  pgBtns.innerHTML    = '';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    if (countEl) countEl.textContent   = `${total} student${total !== 1 ? 's' : ''} found`;
    if (pgInfo)  pgInfo.textContent    = `Showing ${start + 1}–${end} of ${total}`;

    // Badge config
    const badgeCfg = {
      Enrolled:       'badge--success',
      Pending:        'badge--warning',
      'Under Review': 'badge--info',
      Rejected:       'badge--danger',
      Suspended:      'badge--danger',
    };

    tbody.innerHTML = page.map(s => `
      <tr class="student-row" data-student-id="${s.id}" style="cursor:pointer;" onclick="Modal.openViewModal && Modal.openViewModal('${s.id}')">
        <td>
          <div class="table-cell-user">
            <div class="table-avatar" aria-hidden="true">${initials(s.name)}</div>
            <div>
              <div class="table-cell-user__name">${escHTML(s.name)}</div>
              <div class="table-cell-user__id">${escHTML(s.email)}</div>
            </div>
          </div>
        </td>
        <td><span class="table-id">${escHTML(s.admissionNo)}</span></td>
        <td><span class="table-id">${escHTML(s.rollNo)}</span></td>
        <td>${escHTML(s.department)}</td>
        <td><span class="badge badge--info">${escHTML(s.batch || '—')}</span></td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHTML(s.course)}">${escHTML(s.course)}</td>
        <td style="text-align:center;">${escHTML(s.semester)}</td>
        <td style="text-align:center;color:var(--color-slate-400,#8BA3BC);font-size:12px;">${escHTML(s.section || '—')}</td>
        <td style="text-align:center;">
          ${s.feesPaid
            ? '<i class="fas fa-circle-check" style="color:var(--color-success,#22D3A3);" aria-label="Fees paid"></i>'
            : '<i class="fas fa-circle-xmark" style="color:var(--color-danger,#F25F5C);" aria-label="Fees unpaid"></i>'}
        </td>
        <td><span class="badge ${badgeCfg[s.status] || 'badge--info'}">${escHTML(s.status)}</span></td>
        <td style="white-space:nowrap;color:var(--color-slate-400,#8BA3BC);font-size:12px;">${formatDate(new Date(s.createdAt))}</td>
        <td>
          <div style="display:flex;gap:4px;align-items:center;">
            <button class="btn-stu-view card-action-btn" data-id="${s.id}" title="View profile" aria-label="View ${escHTML(s.name)}'s profile" onclick="event.stopPropagation();">
              <i class="fas fa-eye" aria-hidden="true"></i> View
            </button>
            <button class="btn-stu-edit card-action-btn" data-id="${s.id}" title="Edit record" aria-label="Edit ${escHTML(s.name)}" onclick="event.stopPropagation();">
              <i class="fas fa-pen" aria-hidden="true"></i> Edit
            </button>
            <button class="btn-stu-delete" data-id="${s.id}" title="Delete student" aria-label="Delete ${escHTML(s.name)}" onclick="event.stopPropagation();" style="
              display:flex;align-items:center;justify-content:center;
              width:28px;height:28px;border-radius:var(--radius-sm,6px);
              background:rgba(242,95,92,0.08);border:1px solid rgba(242,95,92,0.18);
              color:var(--color-danger,#F25F5C);font-size:12px;cursor:pointer;
              transition:background 0.15s;
            ">
              <i class="fas fa-trash-can" aria-hidden="true"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');

    // Wire row action buttons
    $$('.student-row', tbody).forEach(row => {
      row.addEventListener('click', () => openViewModal(row.dataset.studentId));
    });
    $$('.btn-stu-view', tbody).forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openViewModal(btn.dataset.id); });
    });
    $$('.btn-stu-edit', tbody).forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.id); });
    });
    $$('.btn-stu-delete', tbody).forEach(btn => {
      const s = getStudent(btn.dataset.id);
      btn.addEventListener('click', (e) => { e.stopPropagation(); openDeleteConfirm(btn.dataset.id, s?.name || 'this student'); });
      btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(242,95,92,0.18)');
      btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(242,95,92,0.08)');
    });

    // Pagination buttons
    renderPagination(pgBtns, pages);
  }

  function renderPagination(container, totalPages) {
    if (!container) return;
    container.innerHTML = '';

    if (totalPages <= 1) return;

    const btnStyle = (active = false) => `
      width:32px;height:32px;border-radius:var(--radius-sm,6px);
      display:flex;align-items:center;justify-content:center;
      font-size:12px;font-weight:600;cursor:pointer;
      font-family:var(--font-mono,'DM Mono',monospace);
      border:1px solid ${active ? 'rgba(0,212,255,0.35)' : 'rgba(139,163,188,0.18)'};
      background:${active ? 'rgba(0,212,255,0.12)' : 'rgba(255,255,255,0.03)'};
      color:${active ? 'var(--color-cyan-400,#00D4FF)' : 'var(--color-slate-300,#B0C4D8)'};
      transition:background 0.12s, border-color 0.12s;
    `;

    // Previous
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.style.cssText = btnStyle(false);
    prevBtn.disabled = currentPage === 1;
    prevBtn.setAttribute('aria-label', 'Previous page');
    if (currentPage > 1) {
      prevBtn.addEventListener('click', () => { currentPage--; renderTable(); });
      prevBtn.addEventListener('mouseenter', () => { prevBtn.style.background = 'rgba(255,255,255,0.08)'; });
      prevBtn.addEventListener('mouseleave', () => { prevBtn.style.background = 'rgba(255,255,255,0.03)'; });
    }
    container.appendChild(prevBtn);

    // Page numbers (max 5 shown)
    const maxShown = 5;
    let start = Math.max(1, currentPage - 2);
    let end   = Math.min(totalPages, start + maxShown - 1);
    start     = Math.max(1, end - maxShown + 1);

    for (let p = start; p <= end; p++) {
      const pb = document.createElement('button');
      pb.textContent   = String(p);
      pb.style.cssText = btnStyle(p === currentPage);
      pb.setAttribute('aria-label', `Page ${p}`);
      if (p !== currentPage) {
        pb.addEventListener('click', () => { currentPage = p; renderTable(); });
        pb.addEventListener('mouseenter', () => { pb.style.background = 'rgba(255,255,255,0.08)'; });
        pb.addEventListener('mouseleave', () => { pb.style.background = 'rgba(255,255,255,0.03)'; });
      }
      container.appendChild(pb);
    }

    // Next
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.style.cssText = btnStyle(false);
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.setAttribute('aria-label', 'Next page');
    if (currentPage < totalPages) {
      nextBtn.addEventListener('click', () => { currentPage++; renderTable(); });
      nextBtn.addEventListener('mouseenter', () => { nextBtn.style.background = 'rgba(255,255,255,0.08)'; });
      nextBtn.addEventListener('mouseleave', () => { nextBtn.style.background = 'rgba(255,255,255,0.03)'; });
    }
    container.appendChild(nextBtn);
  }

  /** Escape HTML to prevent XSS in dynamically rendered content */
  function escHTML(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ────────────────────────────────────────────────────────────────────────
     09d. CSV Export
  ─────────────────────────────────────────────────────────────────────────*/

  function exportCSV() {
    const students = filteredStudents();
    if (!students.length) {
      Toast.show('No records to export', 'warning');
      return;
    }

    const headers = [
      'Admission No', 'Student ID', 'Full Name', 'Email', 'Phone',
      'Date of Birth', 'Gender', 'Department', 'Batch', 'Course', 'Semester',
      'Address', 'Status', 'Fees Paid', 'Enrolled On',
    ];

    const rows = students.map(s => [
      s.admissionNo, s.rollNo, s.name, s.email, s.phone,
      s.dob, s.gender, s.department, s.batch, s.course, s.semester,
      `"${(s.address || '').replace(/"/g, '""')}"`,
      s.status, s.feesPaid ? 'Yes' : 'No',
      formatDate(new Date(s.createdAt)),
    ].join(','));

    const csv     = [headers.join(','), ...rows].join('\n');
    const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url     = URL.createObjectURL(blob);
    const link    = document.createElement('a');
    link.href     = url;
    link.download = `students_export_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    Toast.show(`${students.length} student record${students.length !== 1 ? 's' : ''} exported as CSV`, 'success');
    logActivity(`CSV export of <strong>${students.length}</strong> student records generated`);
  }

  /** Fetch from API then immediately re-render the table. */
  async function fetchAndRender() {
    await fetchStudentsFromAPI();
    renderTable();
  }

  /* ────────────────────────────────────────────────────────────────────────
     Public init for module
  ─────────────────────────────────────────────────────────────────────────*/

  function init() {
    // Initial load
    fetchAndRender();

    // Wire the "Enrol Student" quick action and admissions nav link
    if (DOM.qaNewStudent) {
      DOM.qaNewStudent.addEventListener('click', () => {
        NavModule.setActive('students');
        setTimeout(openAddModal, 200);
      });
      DOM.qaNewStudent.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') DOM.qaNewStudent.click();
      });
    }

    // Wire existing admission table's action buttons (dashboard)
    $$('.btn-view-admission').forEach(btn => {
      btn.addEventListener('click', () => {
        // Cross-reference by admission number
        const admNo   = btn.dataset.id;
        const students = loadStudents();
        const match   = students.find(s => s.admissionNo === admNo);
        if (match) {
          openViewModal(match.id);
        } else {
          Toast.show('Full record not in local store. Showing dashboard entry only.', 'info');
        }
      });
    });

    window.addEventListener('students_updated', () => {
      fetchAndRender();
    });
  }

  return { init, renderTable, fetchAndRender, openAddModal, openEditModal, openViewModal };
})();


/* =============================================================================
   10. QUICK ACTIONS MODULE
   ============================================================================= */

const QuickActionsModule = (() => {

  function init() {
    // Each quick action tile that doesn't have a dedicated module yet
    const actions = {
      'qa-issue-cert':    () => Toast.show('Certificate generator — coming soon', 'info'),
      'qa-mark-attendance': () => {
        NavModule.setActive('attendance');
        Toast.show('Opening attendance module', 'info');
      },
      'qa-collect-fee':   () => {
        NavModule.setActive('fees');
        Toast.show('Opening fee collection module', 'info');
      },
      'qa-schedule-exam': () => {
        NavModule.setActive('examinations');
        Toast.show('Opening examinations module', 'info');
      },
      'qa-post-notice':   () => {
        NavModule.setActive('noticeboard');
        Toast.show('Opening noticeboard module', 'info');
      },
    };

    Object.entries(actions).forEach(([id, fn]) => {
      const el = $(`#${id}`);
      if (!el) return;
      el.addEventListener('click', fn);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
      });
    });
  }

  return { init };
})();


/* =============================================================================
   11. CHART INTERACTIONS
   ============================================================================= */

const ChartModule = (() => {

  /** Tooltip element reused across all chart bars */
  let tooltip;

  function getTooltip() {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'chart-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.style.cssText = `
        position: fixed; z-index: 8000; pointer-events: none;
        background: rgba(12,22,38,0.96);
        border: 1px solid rgba(0,212,255,0.22);
        border-radius: var(--radius-sm,6px);
        padding: 8px 12px; font-size: 12px; font-weight: 600;
        color: var(--color-white,#F0F4F8);
        box-shadow: 0 4px 20px rgba(0,0,0,0.50);
        opacity: 0; transition: opacity 0.15s;
        font-family: var(--font-mono,'DM Mono',monospace);
        white-space: nowrap;
      `;
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function showTooltip(e, text) {
    const tt = getTooltip();
    tt.innerHTML = text;
    tt.style.opacity = '1';
    tt.style.left = `${e.clientX + 14}px`;
    tt.style.top  = `${e.clientY - 36}px`;
  }

  function hideTooltip() {
    getTooltip().style.opacity = '0';
  }

  function moveTooltip(e) {
    const tt = getTooltip();
    tt.style.left = `${e.clientX + 14}px`;
    tt.style.top  = `${e.clientY - 36}px`;
  }

  function initBarTooltips() {
    $$('.chart-bar--enrolled, .chart-bar--passed').forEach(bar => {
      const month = bar.getAttribute('data-month') || '';
      const val   = bar.getAttribute('data-val')   || '';
      const label = bar.classList.contains('chart-bar--enrolled')
        ? `<span style="color:var(--color-cyan-400,#00D4FF);">●</span> Enrolled`
        : `<span style="color:var(--color-info,#818CF8);">●</span> Passed Out`;

      bar.addEventListener('mouseenter', e => showTooltip(e, `${label} · ${month}: <strong>${Number(val).toLocaleString()}</strong>`));
      bar.addEventListener('mousemove',  moveTooltip);
      bar.addEventListener('mouseleave', hideTooltip);
      bar.addEventListener('focus',      e => showTooltip(e, `${label} · ${month}: ${Number(val).toLocaleString()}`));
      bar.addEventListener('blur',       hideTooltip);
    });
  }

  function initYearSelect() {
    if (!DOM.chartYearSelect) return;

    const yearData = {
      '2025-26': { subtitle: 'Academic Year 2025–26' },
      '2024-25': { subtitle: 'Academic Year 2024–25' },
      '2023-24': { subtitle: 'Academic Year 2023–24' },
    };

    DOM.chartYearSelect.addEventListener('change', e => {
      const meta = yearData[e.target.value] || {};
      const subtitle = $('#enrollment-chart-card .card-subtitle');
      if (subtitle) subtitle.textContent = `Monthly headcount — ${meta.subtitle || e.target.value}`;
      Toast.show(`Showing enrollment data for ${e.target.value}`, 'info');
    });
  }

  function init() {
    initBarTooltips();
    initYearSelect();
  }

  return { init };
})();


/* =============================================================================
   12. SEMESTER ARC ANIMATOR
   ============================================================================= */

const SemesterArcModule = (() => {

  function animate() {
    const pct  = CMS.config.semesterProgress;
    const fill = DOM.semesterFill;
    const pctEl = DOM.semesterPct;
    const track = DOM.semesterTrack;

    if (!fill) return;

    // Start from 0 and animate to pct
    fill.style.width = '0%';

    setTimeout(() => {
      fill.style.transition = 'width 1.4s cubic-bezier(0.4, 0, 0.2, 1)';
      fill.style.width      = `${pct}%`;
    }, 600);

    // Animate counter
    if (pctEl) {
      let current = 0;
      const duration = 1400;
      const startTime = performance.now();

      function step(now) {
        const elapsed  = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        current = Math.round(eased * pct);
        pctEl.textContent = `${current}%`;
        if (progress < 1) requestAnimationFrame(step);
      }

      setTimeout(() => requestAnimationFrame(step), 600);
    }

    // Update aria
    if (track) {
      track.setAttribute('aria-valuenow', pct);
    }
  }

  function init() {
    // Animate on load (after a short delay to let layout paint first)
    setTimeout(animate, 400);
  }

  return { init };
})();


/* =============================================================================
   13. ACTIVITY FEED — live append helper
   ============================================================================= */

const iconByType = {
  success: { cls: 'activity-icon--success', icon: 'fa-circle-check' },
  danger:  { cls: 'activity-icon--danger',  icon: 'fa-circle-xmark' },
  warning: { cls: 'activity-icon--warning', icon: 'fa-triangle-exclamation' },
  info:    { cls: 'activity-icon--info',    icon: 'fa-circle-info' },
  cyan:    { cls: 'activity-icon--cyan',    icon: 'fa-bolt' },
};

function logActivity(text, type = 'cyan') {
  // Persist to localStorage
  const log    = lsGet(CMS.config.activityKey, []);
  const entry  = { id: uid('act'), text, type, ts: new Date().toISOString() };
  log.unshift(entry);
  if (log.length > 50) log.length = 50;   // cap at 50 entries
  lsSet(CMS.config.activityKey, log);

  // Prepend to DOM feed if visible
  const feed = DOM.activityFeed;
  if (!feed) return;

  const { cls, icon } = iconByType[type] || iconByType.cyan;

  const item = document.createElement('div');
  item.className = 'activity-item';
  item.id = entry.id;
  item.style.opacity = '0';
  item.style.transform = 'translateX(-12px)';
  item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

  item.innerHTML = `
    <div class="activity-icon ${cls}" aria-hidden="true">
      <i class="fas ${icon}"></i>
    </div>
    <div class="activity-content">
      <div class="activity-content__text">${text}</div>
      <div class="activity-content__time">Just now</div>
    </div>
  `;

  feed.insertBefore(item, feed.firstChild);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      item.style.opacity   = '1';
      item.style.transform = 'translateX(0)';
    });
  });

  // Remove oldest if more than 8 visible entries
  const items = $$('.activity-item', feed);
  if (items.length > 8) {
    const last = items[items.length - 1];
    last.style.opacity = '0';
    setTimeout(() => last.remove(), 300);
  }
}


/* =============================================================================
   14. KEYBOARD SHORTCUTS
   ============================================================================= */

const KeyboardModule = (() => {

  const shortcuts = [
    { key: 'd', meta: true, label: 'Dashboard',   action: () => NavModule.setActive('dashboard') },
    { key: 's', meta: true, label: 'Students',    action: () => NavModule.setActive('students')  },
    { key: 'n', meta: true, label: 'New Student', action: () => {
        NavModule.setActive('students');
        setTimeout(StudentModule.openAddModal, 200);
      }
    },
    { key: 'Escape', meta: false, label: 'Close modal / panel', action: () => {
        Modal.closeActive();
        if (CMS.state.notifPanelOpen) HeaderModule; // handled inside header
      }
    },
  ];

  function init() {
    document.addEventListener('keydown', e => {
      // Don't fire shortcuts when typing in inputs
      const tag = document.activeElement.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      for (const sh of shortcuts) {
        if (sh.meta && !(e.metaKey || e.ctrlKey)) continue;
        if (e.key === sh.key) {
          e.preventDefault();
          sh.action();
          return;
        }
      }
    });
  }

  /** Render a help overlay listing all shortcuts */
  function showShortcutsHelp() {
    const rows = shortcuts.map(s => {
      const combo = s.meta ? `<kbd>⌘</kbd><kbd>${s.key.toUpperCase()}</kbd>` : `<kbd>${s.key}</kbd>`;
      return `<tr>
        <td style="padding:7px 12px;white-space:nowrap;">${combo}</td>
        <td style="padding:7px 12px;color:var(--color-white-soft,#E2EAF4);">${s.label}</td>
      </tr>`;
    }).join('');

    const modal = Modal.create({
      title:    'Keyboard Shortcuts',
      size:     'sm',
      bodyHTML: `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:1px solid rgba(139,163,188,0.12);">
              <th style="padding:6px 12px;text-align:left;font-size:10px;
                         letter-spacing:0.1em;text-transform:uppercase;
                         color:var(--color-slate-400,#8BA3BC);">Shortcut</th>
              <th style="padding:6px 12px;text-align:left;font-size:10px;
                         letter-spacing:0.1em;text-transform:uppercase;
                         color:var(--color-slate-400,#8BA3BC);">Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:16px;font-size:11px;color:var(--color-slate-400,#8BA3BC);text-align:center;">
          Also: <kbd>⌘K</kbd> to focus search
        </p>
      `,
    });
    modal.open();
  }

  return { init, showShortcutsHelp };
})();


/* =============================================================================
   15. INIT — wire everything together in dependency order
   ============================================================================= */

function _scriptEscHTML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadStudentRegistrationForm() {
  const role = Auth.getRole();
  if (role !== 'student') return;

  try {
    const res = await Auth.fetch('/student/dashboard');
    if (!res.ok) return;
    const body = await res.json();
    if (body.success && body.data && body.data.student) {
      const student = body.data.student;
      
      const alreadySubmittedEl = document.getElementById('registration-already-submitted');
      const formContainer = document.getElementById('registration-form-container');
      
      // Check if student has submitted registration
      if (student.status === 'Enrolled' || student.status === 'Active' || student.department && student.course && student.batch) {
        alreadySubmittedEl.style.display = 'block';
        formContainer.style.display = 'none';
      } else {
        alreadySubmittedEl.style.display = 'none';
        formContainer.style.display = 'block';
        
        // Render form using StudentModule's HTML generator (but we need it exposed, or we can just build a subset here)
        // Since buildFormHTML is private to StudentModule, let's just make a simple form for self-registration
        formContainer.innerHTML = `
          <form id="student-self-reg-form" novalidate autocomplete="off">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
              <div style="grid-column:1/-1;">
                <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--color-cyan-400);">Student ID *</label>
                <input id="reg-student-id" name="studentId" type="text" required placeholder="Enter your official college Student ID" value="${student.rollNo || student.admissionNo || ''}" style="width:100%;padding:10px 14px;background:var(--color-navy-800);border:1px solid var(--color-cyan-500);border-radius:6px;color:var(--color-white);font-weight:700;font-family:var(--font-mono);"/>
              </div>
              <div>
                <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--color-slate-400);">Phone Number *</label>
                <input name="phone" type="tel" required placeholder="Enter 10-digit mobile" value="${student.phone||''}" style="width:100%;padding:10px 14px;background:var(--color-navy-800);border:1px solid var(--color-border);border-radius:6px;color:var(--color-white);"/>
              </div>
              <div>
                <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--color-slate-400);">Date of Birth *</label>
                <input name="dob" type="date" required value="${student.dob ? student.dob.split('T')[0] : ''}" style="width:100%;padding:10px 14px;background:var(--color-navy-800);border:1px solid var(--color-border);border-radius:6px;color:var(--color-white); color-scheme: dark;"/>
              </div>
              <div>
                <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--color-slate-400);">Gender *</label>
                <select name="gender" required style="width:100%;padding:10px 14px;background:var(--color-navy-800);border:1px solid var(--color-border);border-radius:6px;color:var(--color-white);">
                  <option value="" disabled selected>Select Gender</option>
                  <option value="Male" ${student.gender==='Male'?'selected':''}>Male</option>
                  <option value="Female" ${student.gender==='Female'?'selected':''}>Female</option>
                  <option value="Other" ${student.gender==='Other'?'selected':''}>Other</option>
                </select>
              </div>
              <div>
                <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--color-slate-400);">Department *</label>
                <select name="department" required style="width:100%;padding:10px 14px;background:var(--color-navy-800);border:1px solid var(--color-border);border-radius:6px;color:var(--color-white);">
                  <option value="" disabled selected>Select department</option>
                  ${['Computer Science','Business Admin','Engineering','Medical Sciences','Arts & Humanities'].map(d => '<option value="' + d + '" ' + (student.department===d?'selected':'') + '>' + d + '</option>').join('')}
                </select>
              </div>
              <div>
                <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--color-slate-400);">Batch *</label>
                <select name="batch" required style="width:100%;padding:10px 14px;background:var(--color-navy-800);border:1px solid var(--color-border);border-radius:6px;color:var(--color-white);">
                  <option value="" disabled selected>Select batch</option>
                  ${['2021-2025','2022-2026','2023-2027','2024-2028','2025-2029'].map(b => '<option value="' + b + '" ' + (student.batch===b?'selected':'') + '>' + b + '</option>').join('')}
                </select>
              </div>
              <div>
                <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--color-slate-400);">Course / Programme *</label>
                <input name="course" type="text" required placeholder="e.g. B.Sc. Computer Science" value="${student.course||''}" style="width:100%;padding:10px 14px;background:var(--color-navy-800);border:1px solid var(--color-border);border-radius:6px;color:var(--color-white);"/>
              </div>
              <div>
                <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--color-slate-400);">Semester</label>
                <select name="semester" style="width:100%;padding:10px 14px;background:var(--color-navy-800);border:1px solid var(--color-border);border-radius:6px;color:var(--color-white);">
                  ${[1,2,3,4,5,6,7,8].map(n => '<option value="' + n + '" ' + (student.semester==n?'selected':'') + '>Semester ' + n + '</option>').join('')}
                </select>
              </div>
              <div style="grid-column:1/-1;">
                <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--color-slate-400);">Address</label>
                <textarea name="address" rows="2" style="width:100%;padding:10px 14px;background:var(--color-navy-800);border:1px solid var(--color-border);border-radius:6px;color:var(--color-white);resize:vertical;">${student.address||''}</textarea>
              </div>
            </div>
            <div style="margin-top:24px;text-align:right;">
              <button type="submit" style="padding:10px 24px; border-radius:6px; background:var(--color-cyan-400); color:#fff; border:none; font-weight:700; cursor:pointer;">Submit Registration</button>
            </div>
          </form>
        `;

        const form = document.getElementById('student-self-reg-form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const rollNo = form.studentId.value.trim();
          const phone = form.phone.value.trim();
          const dob = form.dob.value;
          const gender = form.gender.value;
          const department = form.department.value;
          const batch = form.batch.value;
          const course = form.course.value.trim();
          
          if (!rollNo || !phone || !dob || !gender || !department || !batch || !course) {
            Toast.show('Please fill all compulsory fields marked with *', 'danger');
            return;
          }

          const btn = form.querySelector('button[type="submit"]');
          btn.disabled = true;
          btn.textContent = 'Submitting...';
          
          const payload = {
            rollNo,
            phone,
            dob,
            gender,
            department,
            batch,
            course,
            semester: form.semester.value,
            address: form.address.value,
            status: 'Enrolled'
          };
          
          try {
            const upRes = await Auth.fetch(`/students/${student._id}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            if (upRes.ok) {
              Toast.show('Registration submitted successfully!', 'success');
              loadStudentRegistrationForm(); // reload to show success
            } else {
              const errBody = await upRes.json();
              console.error('Registration submit error:', errBody);
              Toast.show(`Failed: ${errBody.message || 'Unknown Error'}`, 'danger');
              btn.disabled = false;
              btn.textContent = 'Submit Registration';
            }
          } catch(err) {
            Toast.show('Network error.', 'danger');
            btn.disabled = false;
            btn.textContent = 'Submit Registration';
          }
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function fetchDashboardStats() {
  const role = Auth.getRole();
  const user = Auth.getUser();

  try {
    if (role === 'student') {
      // Hide admin stats
      const statsSec = document.getElementById('stats-section');
      if (statsSec) statsSec.style.display = 'none';

      // Fetch student stats
      const res = await Auth.fetch('/student/dashboard');
      if (!res.ok) return;
      const body = await res.json();
      if (body.success && body.data) {
        const studentInfo = body.data.student;
        const stats = body.data;
        
        // Populate Student Header Info
        const welcomeText = $('#student-welcome-text');
        const statusBadge = $('#student-status-badge');
        const deptText    = $('#student-dept-text');
        const semText     = $('#student-sem-text');

        if (welcomeText) welcomeText.textContent = `Welcome back, ${studentInfo.name || 'Student'}`;
        if (deptText) deptText.textContent = studentInfo.department || 'Unassigned';
        if (semText) semText.textContent = studentInfo.semester ? `Semester ${studentInfo.semester}` : 'N/A';
        
        if (statusBadge) {
          const status = studentInfo.status || 'Pending';
          statusBadge.textContent = status;
          if (status === 'Active' || status === 'Enrolled') statusBadge.style.color = 'var(--color-success)';
          else if (status === 'Pending') statusBadge.style.color = 'var(--color-warning)';
          else statusBadge.style.color = 'var(--color-danger)';
        }

        // We can optionally add the stats row underneath if needed
        const dashboardContent = document.getElementById('student-dashboard-section');
        if (dashboardContent && !document.getElementById('student-stats-section')) {
          dashboardContent.insertAdjacentHTML('beforeend', `
            <section id="student-stats-section" style="margin-top:24px;">
              <h2 class="section-title">My Academic Overview</h2>
              <div id="stats-row" role="list">
                <div class="stat-card" role="listitem">
                  <div class="stat-card__header">
                    <div class="stat-card__label">Attendance</div>
                    <div class="stat-card__icon-wrap stat-card__icon-wrap--cyan"><i class="fas fa-pie-chart"></i></div>
                  </div>
                  <div class="stat-card__value">${stats.overallPercentage || 0}%</div>
                  <div class="stat-card__footer"><span>Overall attendance</span></div>
                </div>
                <div class="stat-card" role="listitem">
                  <div class="stat-card__header">
                    <div class="stat-card__label">Current CGPA</div>
                    <div class="stat-card__icon-wrap stat-card__icon-wrap--success"><i class="fas fa-school"></i></div>
                  </div>
                  <div class="stat-card__value">N/A</div>
                  <div class="stat-card__footer"><span>Cumulative performance</span></div>
                </div>
                <div class="stat-card" role="listitem">
                  <div class="stat-card__header">
                    <div class="stat-card__label">Overall Marks</div>
                    <div class="stat-card__icon-wrap stat-card__icon-wrap--warning"><i class="fas fa-ribbon"></i></div>
                  </div>
                  <div class="stat-card__value">N/A</div>
                  <div class="stat-card__footer"><span>Across all subjects</span></div>
                </div>
              </div>
            </section>
          `);
        }
      }
    } else if (role === 'admin' || role === 'faculty') {
      const res = await Auth.fetch('/dashboard/stats');
      if (!res.ok) throw new Error('Failed to load stats');
      const data = await res.json();
      if (data.success && data.stats) {
        if (DOM.statValStudents) DOM.statValStudents.textContent = data.stats.totalStudents || 0;
        if (DOM.statValFaculty) DOM.statValFaculty.textContent = data.stats.totalFaculty || 0;
        if (DOM.statValCourses) DOM.statValCourses.textContent = data.stats.totalCourses || 0;
        if (DOM.statValFees) DOM.statValFees.textContent = '₹' + (data.stats.totalFeesCollected ? (data.stats.totalFeesCollected / 100000).toFixed(1) + 'L' : '0');
      }
      
      // Render Recent Admissions dynamically
      if (data.success && data.recentAdmissions && DOM.admissionsTbody) {
        if (data.recentAdmissions.length === 0) {
          DOM.admissionsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No recent admissions found.</td></tr>';
        } else {
          DOM.admissionsTbody.innerHTML = data.recentAdmissions.map(student => {
            const initials = student.name ? student.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ST';
            const dateStr = new Date(student.createdAt || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            let statusBadge = 'badge--info';
            if (student.status === 'Active' || student.status === 'Enrolled') statusBadge = 'badge--success';
            if (student.status === 'Pending') statusBadge = 'badge--warning';
            if (student.status === 'Rejected') statusBadge = 'badge--danger';
            
            return `
              <tr class="admission-row" data-admission-id="${student._id}">
                <td>
                  <div class="table-cell-user">
                    <div class="table-avatar" aria-hidden="true">${initials}</div>
                    <div>
                      <div class="table-cell-user__name">${_scriptEscHTML(student.name || 'N/A')}</div>
                      <div class="table-cell-user__id">${_scriptEscHTML(student.rollNo || 'N/A')}</div>
                    </div>
                  </div>
                </td>
                <td><span class="table-id">${_scriptEscHTML(student.rollNo || 'N/A')}</span></td>
                <td>${_scriptEscHTML(student.department || 'N/A')}</td>
                <td>${dateStr}</td>
                <td><span class="badge ${statusBadge}">${_scriptEscHTML(student.status || 'Active')}</span></td>
                <td>
                  <button class="card-action-btn btn-view-admission" data-id="${student._id}" aria-label="View admission">
                    <i class="fas fa-ellipsis-h" aria-hidden="true"></i>
                  </button>
                </td>
              </tr>
            `;
          }).join('');
        }
      }
    }
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    Toast.show('Server unavailable', 'danger');
  }
}

async function init() {

  // Guard the page immediately
  const user = await Auth.guard();
  if (!user) return; // Redirecting...

  // Apply RBAC to sidebar and other page elements
  Auth.applySidebarRBAC();
  Auth.applyElementRBAC();

  // Removed theme toggle for Red/White Light Theme.

  // Fetch dashboard stats

  fetchDashboardStats();


  // Populate dynamic profile details in sidebar footer
  const sidebarAvatar = document.querySelector('.sidebar-user__avatar');
  const sidebarName = document.querySelector('.sidebar-user__name');
  const sidebarRole = document.querySelector('.sidebar-user__role');
  
  if (sidebarAvatar) {
    if (user.profilePic) {
      sidebarAvatar.innerHTML = `<img src="${user.profilePic}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
      sidebarAvatar.textContent = initials(user.name);
    }
  }
  if (sidebarName) sidebarName.textContent = user.name;
  if (sidebarRole) sidebarRole.textContent = user.role === 'admin' ? 'System Administrator' : (user.role === 'faculty' ? 'Faculty Member' : 'Student');

  // Replace sidebar chevron with logout button and wire it up
  const chevron = document.querySelector('.sidebar-user__chevron');
  if (chevron) {
    const logoutBtn = document.createElement('i');
    logoutBtn.className = 'fas fa-sign-out-alt';
    logoutBtn.id = 'btn-logout';
    logoutBtn.title = 'Logout';
    logoutBtn.style.cssText = 'cursor: pointer; margin-left: auto; font-size: 16px; opacity: 0.7; transition: opacity 0.2s;';
    logoutBtn.addEventListener('mouseover', () => logoutBtn.style.opacity = '1');
    logoutBtn.addEventListener('mouseout', () => logoutBtn.style.opacity = '0.7');
    logoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Auth.logout();
    });
    chevron.parentNode.replaceChild(logoutBtn, chevron);
  }

  // 1. Cache all DOM references
  initDOMCache();

  // 2. Core layout modules
  SidebarModule.init();
  NavModule.init();
  HeaderModule.init();

  // 3. Feature modules
  SemesterArcModule.init();
  ChartModule.init();
  QuickActionsModule.init();
  StudentModule.init();
  KeyboardModule.init();
  NoticeModule.init();
  InlineMarksModule.init();

  const userRole = user.role || 'student';
  if (userRole === 'admin' || userRole === 'faculty') {
      const addBtns = document.querySelectorAll('#btn-add-notice, #btn-post-notice-page');
      addBtns.forEach(b => b.style.display = 'flex');
  } else {
      const addBtns = document.querySelectorAll('#btn-add-notice, #btn-post-notice-page');
      addBtns.forEach(b => b.style.display = 'none');
  }

  NoticeModule.fetchAndRender();
  if (userRole === 'admin' || userRole === 'faculty') {
      InlineMarksModule.fetchCourses();
  }

  // 4. Wire Help button to show shortcuts
  if (DOM.btnHelp) {
    DOM.btnHelp.addEventListener('click', KeyboardModule.showShortcutsHelp);
  }

  // 5. Wire stat cards — click to navigate
  [
    ['stat-total-students', 'students'],
    ['stat-active-faculty', 'faculty'],
    ['stat-courses-running','courses'],
    ['stat-fees-collected', 'fees'],
  ].forEach(([id, section]) => {
    const card = $(`#${id}`);
    if (card) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => NavModule.setActive(section));
      card.setAttribute('tabindex', '0');
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); NavModule.setActive(section); }
      });
    }
  });

  // 6. Card "view all" links — prevent default and route via nav
  $$('[href^="#"]', DOM.pageContent).forEach(link => {
    const target = (link.getAttribute('href') || '').replace('#', '');
    if (!target || target === 'dashboard') return;
    link.addEventListener('click', e => {
      e.preventDefault();
      NavModule.setActive(target);
    });
  });

  // 7. Reflow on resize (debounced)
  window.addEventListener('resize', debounce(() => {
    if (window.innerWidth > 1024 && CMS.state.mobileSidebarOpen) {
      SidebarModule.closeMobile();
    }
  }, 250));

  // 8. Log app start
  logActivity('CMS Admin Dashboard loaded', 'cyan');

  console.info(
    `%c NIMS University CMS v1.0.0 %c Loaded in ${Math.round(performance.now())}ms `,
    'background:#0B1A2C;color:#00D4FF;font-weight:700;padding:3px 8px;border-radius:4px 0 0 4px;',
    'background:#00D4FF;color:#0B1A2C;font-weight:700;padding:3px 8px;border-radius:0 4px 4px 0;',
  );
}


/* ── MARKS MODULE ───────────────────────────────────────────────────────────── */
const InlineMarksModule = (() => {
  let selectedCourseId = null;
  let currentStudents = [];
  let currentMarks = {};

  async function fetchCourses() {
    try {
      const res = await Auth.fetch('/courses');
      const courses = res.data || [];
      const select = document.getElementById('marks-course-select');
      if (select) {
        select.innerHTML = '<option value="">Select a Course...</option>';
        courses.forEach(c => {
          select.innerHTML += `<option value="${c._id}">${c.name} (${c.code})</option>`;
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function fetchStudentsForCourse() {
    selectedCourseId = document.getElementById('marks-course-select').value;
    if (!selectedCourseId) return Toast.show('Please select a course', 'error');

    try {
      const cRes = await Auth.fetch(`/courses/${selectedCourseId}`);
      if (!cRes.data) return Toast.show('Course not found', 'error');
      
      const sRes = await Auth.fetch(`/students?department=${cRes.data.department}`);
      currentStudents = sRes.data || [];

      const mRes = await Auth.fetch('/marks');
      const marksData = mRes.data || [];
      
      currentMarks = {};
      currentStudents.forEach(s => {
        const existing = marksData.find(m => m.studentId === s._id && m.courseId === selectedCourseId);
        if (existing) {
          currentMarks[s._id] = existing;
        }
      });
      renderTable();
    } catch (err) {
      console.error(err);
      Toast.show('Error fetching students', 'error');
    }
  }

  function renderTable() {
    const tableContainer = document.getElementById('marks-table-container');
    const tbody = document.getElementById('marks-table-body');
    if (!tableContainer || !tbody) return;

    tableContainer.style.display = 'block';
    if (currentStudents.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No students found for this department</td></tr>';
      return;
    }

    tbody.innerHTML = currentStudents.map(s => {
      const marks = currentMarks[s._id] || { internalMarks: '', externalMarks: '' };
      return `
        <tr>
          <td>${s.rollNumber || 'N/A'}</td>
          <td>${s.name}</td>
          <td><input type="number" class="marks-input internal-input" data-id="${s._id}" value="${marks.internalMarks}" placeholder="0" max="30"></td>
          <td><input type="number" class="marks-input external-input" data-id="${s._id}" value="${marks.externalMarks}" placeholder="0" max="70"></td>
        </tr>
      `;
    }).join('');
  }

  async function saveMarks() {
    if (!selectedCourseId) return;
    const marksData = [];
    currentStudents.forEach(s => {
      const internalInput = document.querySelector(`.internal-input[data-id="${s._id}"]`);
      const externalInput = document.querySelector(`.external-input[data-id="${s._id}"]`);
      if (internalInput && externalInput) {
        marksData.push({
          studentId: s._id,
          internalMarks: Number(internalInput.value) || 0,
          externalMarks: Number(externalInput.value) || 0
        });
      }
    });

    try {
      document.getElementById('btn-save-marks').textContent = 'Saving...';
      await Auth.fetch('/marks/bulk', {
        method: 'POST',
        body: { courseId: selectedCourseId, marksData }
      });
      Toast.show('Marks saved successfully!', 'success');
    } catch(err) {
      Toast.show('Failed to save marks', 'error');
    } finally {
      document.getElementById('btn-save-marks').textContent = 'Save Marks';
    }
  }

  function init() {
    const btnFetch = document.getElementById('btn-fetch-marks-students');
    const btnSave = document.getElementById('btn-save-marks');
    if (btnFetch) btnFetch.addEventListener('click', fetchStudentsForCourse);
    if (btnSave) btnSave.addEventListener('click', saveMarks);
  }

  return { init, fetchCourses };
})();

/* ── NOTICES MODULE ─────────────────────────────────────────────────────────── */
const NoticeModule = (() => {
  let notices = [];
  let activeCategory = 'All';
  const categories = ['All', 'Academic', 'Examination', 'Events', 'Holiday'];

  function escHTML(str = "") {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, function(match) {
      const escape = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        "\"": "&quot;"
      };
      return escape[match];
    });
  }

  function renderNotices() {
    const fullList = document.getElementById('full-noticeboard-list');
    if (!fullList) return;

    let filtered = activeCategory === 'All' ? notices : notices.filter(n => (n.category || n.targetAudience || 'General') === activeCategory);

    const html = filtered.map(notice => {
      const isUrgent = notice.isUrgent;
      const dateObj = new Date(notice.createdAt || notice.date || Date.now());
      const day = dateObj.getDate();
      const month = dateObj.toLocaleString('default', { month: 'short' });
      const catText = isUrgent ? 'URGENT' : (notice.category || notice.targetAudience || 'General');

      return `
        <div style="background:#FFF; border-radius:16px; padding:15px; margin-bottom:15px; box-shadow:0 2px 5px rgba(0,0,0,0.03); border:1px solid ${isUrgent ? '#E53935' : '#F3F4F6'}; ${isUrgent ? 'background:#FEF2F2;' : ''}">
          <div style="display:flex; margin-bottom:12px;">
            <div style="width:50px; height:50px; border-radius:12px; background:${isUrgent ? '#FEE2E2' : '#FFEBEE'}; display:flex; flex-direction:column; justify-content:center; align-items:center; margin-right:15px;">
              <div style="font-weight:700; font-size:16px; color:${isUrgent ? '#B91C1C' : '#E53935'}; line-height:20px;">${day}</div>
              <div style="font-weight:500; font-size:10px; color:${isUrgent ? '#B91C1C' : '#E53935'}; text-transform:uppercase;">${month}</div>
            </div>
            <div style="flex:1; justify-content:center;">
              <div style="font-weight:600; font-size:15px; color:#111827; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                ${isUrgent ? '<i class="fas fa-exclamation-circle" style="color:#E53935;font-size:14px;"></i>' : ''}
                ${escHTML(notice.title)}
              </div>
              <div style="display:inline-block; background:${isUrgent ? '#FEE2E2' : '#F3F4F6'}; padding:2px 8px; border-radius:6px;">
                <span style="font-weight:500; font-size:10px; color:${isUrgent ? '#B91C1C' : '#6B7280'};">${escHTML(catText)}</span>
              </div>
            </div>
          </div>
          <div style="font-weight:400; font-size:13px; color:#4B5563; line-height:20px;">
            ${escHTML(notice.description || notice.content || '')}
          </div>
          ${notice.attachment ? `
          <a href="${notice.attachment}" target="_blank" style="display:inline-flex; align-items:center; margin-top:15px; padding:8px 12px; background:#FFEBEE; border-radius:8px; text-decoration:none;">
            <i class="fas fa-link" style="color:#E53935;font-size:14px;"></i>
            <span style="font-weight:500; font-size:12px; color:#E53935; margin-left:6px;">View Attachment</span>
          </a>
          ` : ''}
        </div>
      `;
    }).join('');

    const tabsHtml = `
      <div style="display:flex; overflow-x:auto; padding-bottom:15px; margin-bottom:10px; gap:10px; scrollbar-width:none;">
        ${categories.map(cat => `
          <button onclick="NoticeModule.setCategory('${cat}')" style="padding:8px 16px; border-radius:20px; border:none; cursor:pointer; font-weight:500; font-size:13px; white-space:nowrap; transition:0.2s; background:${activeCategory === cat ? '#E53935' : '#F3F4F6'}; color:${activeCategory === cat ? '#FFFFFF' : '#4B5563'};">
            ${cat}
          </button>
        `).join('')}
      </div>
    `;

    fullList.innerHTML = tabsHtml + (html || '<div style="text-align:center;color:#9CA3AF;padding:50px;"><i class="fas fa-bullhorn" style="font-size:48px;color:#D1D5DB;margin-bottom:10px;"></i><br>No notices in this category.</div>');
  }

  async function fetchAndRender() {
    try {
      const res = await Auth.fetch('/notices');
      const body = await res.json();
      let data = body.data || [];
      
      data.sort((a, b) => {
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
      notices = data;

      renderNotices();

      const miniList = document.getElementById('noticeboard-list');
      if (miniList) {
        if (notices.length === 0) {
            miniList.innerHTML = '<div style="text-align:center; padding:20px; color:#888; grid-column: span 3;">No notices available.</div>';
        } else {
            miniList.innerHTML = notices.slice(0,3).map(n => `
              <div class="notice-item" style="border-radius: 8px; border: 1px solid #E5E7EB; background: #FFFFFF; padding: 15px; display: flex; gap: 15px;">
                <i class="fas ${n.isUrgent ? 'fa-exclamation-triangle' : 'fa-bell'}" style="width: 40px; height: 40px; border-radius: 50%; background: #C8102E; color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"></i>
                <div>
                  <div style="font-weight: 700; color: #111827; font-size: 13px; margin-bottom: 4px;">${escHTML(n.title)}</div>
                  <div style="font-size: 11px; color: #6B7280; margin-bottom: 8px;">${escHTML(n.description || n.content || '')}</div>
                  <div style="font-size: 11px; color: #9CA3AF;">By Admin • ${new Date(n.createdAt || n.date).toLocaleDateString()}</div>
                </div>
              </div>
            `).join('');
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  function openPostModal() {
    const modal = Modal.create({
      id: 'modal-post-notice',
      title: 'Post New Notice',
      size: 'md',
      bodyHTML: `
        <div class="form-group" style="margin-bottom: 15px;">
            <label class="form-label" style="display:block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 5px;">Title</label>
            <input type="text" id="n-title" class="form-input" placeholder="Notice Title" style="width: 100%; padding: 10px; border: 1px solid #E5E7EB; border-radius: 6px;">
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
            <label class="form-label" style="display:block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 5px;">Description</label>
            <textarea id="n-desc" class="form-input" style="height: 100px; resize: none; width: 100%; padding: 10px; border: 1px solid #E5E7EB; border-radius: 6px;"></textarea>
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
            <label class="form-label" style="display:block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 5px;">Category</label>
            <select id="n-category" class="form-input" style="width: 100%; padding: 10px; border: 1px solid #E5E7EB; border-radius: 6px;">
                <option value="General">General</option>
                <option value="Academic">Academic</option>
                <option value="Examination">Examination</option>
                <option value="Events">Events</option>
                <option value="Holiday">Holiday</option>
            </select>
        </div>
        <div class="form-group" style="margin-bottom: 15px;">
            <label class="form-label" style="display:block; font-size: 12px; font-weight: 700; color: #374151; margin-bottom: 5px;">Target Audience</label>
            <select id="n-audience" class="form-input" style="width: 100%; padding: 10px; border: 1px solid #E5E7EB; border-radius: 6px;">
                <option value="All">All</option>
                <option value="Faculty">Faculty</option>
                <option value="Student">Student</option>
            </select>
        </div>
        <div class="form-group" style="display:flex; align-items:center; gap: 10px; background: rgba(229,57,53,0.1); padding: 15px; border-radius: 8px; border: 1px solid rgba(229,57,53,0.2);">
            <input type="checkbox" id="n-urgent" style="width: 20px; height: 20px; accent-color: #ef4444;">
            <label for="n-urgent" style="margin:0; font-weight: 600; color: #ef4444; cursor:pointer;">Mark as Urgent (Send Push Notification)</label>
        </div>
      `,
      footerHTML: `
        <button id="btn-n-cancel" style="padding: 10px 20px; border-radius: 6px; border: 1px solid #E5E7EB; background: white; cursor: pointer; color: #374151; font-weight: 600;">Cancel</button>
        <button id="btn-n-post" style="padding: 10px 20px; border-radius: 6px; border: none; background: #C8102E; color: white; cursor: pointer; font-weight: 600;">Post Notice</button>
      `
    });

    modal.open();
    modal.footer().querySelector('#btn-n-cancel').addEventListener('click', () => modal.close());
    modal.footer().querySelector('#btn-n-post').addEventListener('click', async () => {
      const body = modal.body();
      const title = body.querySelector('#n-title').value;
      const desc = body.querySelector('#n-desc').value;
      const cat = body.querySelector('#n-category').value;
      if (!title || !desc) return Toast.show('Title and description required', 'error');

      const payload = {
        title,
        description: desc,
        category: cat,
        targetAudience: body.querySelector('#n-audience').value,
        isUrgent: body.querySelector('#n-urgent').checked
      };

      try {
        document.getElementById('btn-n-post').textContent = 'Posting...';
        await Auth.fetch('/notices', { method: 'POST', body: JSON.stringify(payload) });
        Toast.show('Notice posted successfully', 'success');
        modal.close();
        fetchAndRender();
      } catch (e) {
        Toast.show('Failed to post notice', 'error');
      } finally {
        document.getElementById('btn-n-post').textContent = 'Post Notice';
      }
    });
  }

  function init() {
    const postBtns = document.querySelectorAll('#btn-add-notice, #btn-post-notice-page');
    postBtns.forEach(btn => btn.addEventListener('click', openPostModal));
    // For manual setCategory exposure globally
    window.NoticeModule = { setCategory: (cat) => { activeCategory = cat; renderNotices(); }, openPostModal };
  }

  return { init, fetchAndRender, setCategory: (cat) => { activeCategory = cat; renderNotices(); }, openPostModal };
})();

/* Boot when DOM is ready */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* =============================================================================
   THEME TOGGLE LOGIC
   ============================================================================= */
(function() {
  function initThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle-btn');
    const knob = document.getElementById('theme-toggle-knob');
    const icon = document.getElementById('theme-toggle-icon');
    if (!toggleBtn) return;

    function applyTheme(theme) {
      if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        knob.style.transform = 'translateX(20px)';
        knob.style.background = 'var(--color-navy-900)';
        toggleBtn.style.background = 'rgba(0,0,0,0.05)';
        toggleBtn.style.borderColor = 'rgba(0,0,0,0.1)';
        icon.className = 'fas fa-sun';
        icon.style.color = '#fff';
      } else {
        document.documentElement.removeAttribute('data-theme');
        knob.style.transform = 'translateX(0)';
        knob.style.background = 'var(--color-cyan-400)';
        toggleBtn.style.background = 'var(--color-navy-700)';
        toggleBtn.style.borderColor = 'var(--color-border)';
        icon.className = 'fas fa-moon';
        icon.style.color = '#fff';
      }
    }

    // Load from local storage
    const currentTheme = localStorage.getItem('cms_theme_v2') || 'light';
    applyTheme(currentTheme);

    toggleBtn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const newTheme = isLight ? 'dark' : 'light';
      localStorage.setItem('cms_theme_v2', newTheme);
      applyTheme(newTheme);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  } else {
    initThemeToggle();
  }
})();
