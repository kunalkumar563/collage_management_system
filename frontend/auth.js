/**
 * =============================================================================
 * NIMS UNIVERSITY CMS — Frontend Auth & RBAC Helper
 * auth.js
 * =============================================================================
 *
 * Responsibilities
 * ────────────────
 * 1. Store / retrieve JWT token and user object (sessionStorage — cleared on tab close)
 * 2. Expose the current user's role to the rest of the UI
 * 3. Add the Authorization header to every API fetch automatically
 * 4. Guard pages — redirect to login if token is missing or expired
 * 5. Build role-based sidebar visibility
 * 6. Logout helper
 *
 * Why sessionStorage instead of localStorage?
 * ────────────────────────────────────────────
 * sessionStorage is cleared automatically when the browser tab is closed.
 * This means a student cannot leave themselves logged in on a shared computer.
 * If you want "Remember me" behaviour, use localStorage only for the admin role.
 *
 * =============================================================================
 */

'use strict';

const AUTH_TOKEN_KEY = 'cms_auth_token';
const AUTH_USER_KEY  = 'cms_auth_user';
const API_BASE       = '/api'; // Using relative path so it automatically works on local and Render

// ─── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Save token and user object after a successful login.
 * Called immediately after POST /api/auth/login returns 200.
 *
 * @param {string} token  - Raw JWT string
 * @param {object} user   - { _id, name, email, role }
 */
function authSave(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY,  JSON.stringify(user));
}

/** Return the raw JWT string, or null if not logged in. */
function authGetToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Return the stored user object, or null.
 * Shape: { _id, name, email, role }
 */
function authGetUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY));
  } catch {
    return null;
  }
}

/** Return just the role string: "admin" | "faculty" | "student" | null */
function authGetRole() {
  const user = authGetUser();
  return user ? user.role : null;
}

/** True when a token exists in storage (does not verify expiry — use authVerify for that). */
function authIsLoggedIn() {
  return !!authGetToken();
}

/** Clear everything and redirect to the login page. */
function authLogout(redirectTo = 'login.html') {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  window.location.href = redirectTo;
}

// ─── Authorized fetch wrapper ─────────────────────────────────────────────────

/**
 * Drop-in replacement for fetch() that automatically adds:
 *   Authorization: Bearer <token>
 *   Content-Type: application/json
 *
 * Usage (identical to normal fetch):
 *   const res  = await authFetch('/api/students');
 *   const data = await res.json();
 *
 * On 401 (token expired/invalid) → logs out and redirects automatically.
 */
async function authFetch(path, options = {}) {
  const token = authGetToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Token expired or invalid — force logout
  if (response.status === 401) {
    authLogout();
    return response; // unreachable after redirect, but satisfies linters
  }

  return response;
}

// ─── Page Guard ───────────────────────────────────────────────────────────────

/**
 * Call this at the TOP of every protected page's script, before anything else.
 *
 * What it does:
 *   1. If no token → redirect to login immediately
 *   2. If token exists → call GET /api/auth/me to verify it is still valid
 *      and to get the latest role from the database
 *   3. If token is expired (server returns 401) → authFetch auto-logs out
 *   4. If role is not in the allowedRoles list → redirect to /unauthorized.html
 *
 * @param {string[]} allowedRoles  e.g. ["admin"] or ["admin","faculty"]
 *                                 Pass [] or omit to allow any logged-in user.
 * @returns {object|null}  The verified user object, or null (+ redirect) if unauthorized.
 *
 * Example usage at top of admin dashboard script:
 *   const user = await authGuard(["admin"]);
 *   // code below only runs when role === "admin"
 */
async function authGuard(allowedRoles = []) {
  // 1. No token at all → go to login
  if (!authIsLoggedIn()) {
    window.location.href = 'login.html';
    return null;
  }

  try {
    // 2. Re-validate token with the backend and get fresh user data
    const res  = await authFetch('/auth/me');
    const body = await res.json();

    if (!body.success || !body.user) {
      authLogout();
      return null;
    }

    // 3. Update stored user in case role changed in the DB
    const freshUser = body.user;
    authSave(authGetToken(), freshUser);

    // 4. Role check
    if (allowedRoles.length > 0 && !allowedRoles.includes(freshUser.role)) {
      window.location.href = 'unauthorized.html';
      return null;
    }

    return freshUser;
  } catch {
    // Network error — keep user logged in but skip the re-validation
    return authGetUser();
  }
}

// ─── Sidebar RBAC ─────────────────────────────────────────────────────────────

/**
 * Show or hide sidebar nav items based on the current user's role.
 *
 * Each <a> nav item should have a data-roles attribute:
 *   <a href="#students" data-roles="admin"          ...>Students</a>
 *   <a href="#faculty"  data-roles="admin"          ...>Faculty</a>
 *   <a href="#marks"    data-roles="admin,faculty"  ...>Marks</a>
 *   <a href="#notices"  data-roles="admin,faculty,student" ...>Notices</a>
 *
 * Any nav item WITHOUT a data-roles attribute is always visible (e.g. Dashboard).
 *
 * Call this once after the DOM is ready:
 *   authApplySidebarRBAC();
 */
function authApplySidebarRBAC() {
  const role = authGetRole();
  if (!role) return;

  document.querySelectorAll('.nav-item[data-roles]').forEach(item => {
    const allowed = item.getAttribute('data-roles')
      .split(',')
      .map(r => r.trim());

    if (!allowed.includes(role)) {
      // Hide the entire nav item — use display:none so it takes no space
      item.style.display = 'none';
      item.setAttribute('aria-hidden', 'true');
    }
  });
}

/**
 * Show or hide any element on the page using data-roles.
 * Works for buttons, table columns, action icons — not just nav items.
 *
 * Example:
 *   <button data-roles="admin" id="btn-add-student">Add Student</button>
 *   → hidden automatically for faculty and student roles
 *
 * Call this once after DOM is ready:
 *   authApplyElementRBAC();
 */
function authApplyElementRBAC() {
  const role = authGetRole();
  if (!role) return;

  document.querySelectorAll('[data-roles]').forEach(el => {
    const allowed = el.getAttribute('data-roles')
      .split(',')
      .map(r => r.trim());

    if (!allowed.includes(role)) {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  });
}

// ─── Login helper ─────────────────────────────────────────────────────────────

/**
 * Call from the login form submit handler.
 * Sends credentials to the backend, saves the token, then redirects
 * to the correct dashboard based on role.
 *
 * @param {string} email
 * @param {string} password
 * @returns {{ success: boolean, message: string }}
 */
async function authLogin(email, password) {
  try {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    const body = await res.json();

    if (!res.ok || !body.success) {
      return { success: false, message: body.message || 'Login failed' };
    }

    // Save token + user — this is the ONLY place authSave is called
    authSave(body.token, body.user);

    // Redirect based on role
    const dashboards = {
      admin:   'index.html',      // full CMS dashboard
      faculty: 'index.html',      // same page, sidebar filtered by role
      student: 'index.html',      // same page, further filtered
    };

    window.location.href = dashboards[body.user.role] || 'index.html';
    return { success: true };

  } catch (err) {
    return { success: false, message: 'Network error — server may be offline' };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

window.Auth = {
  save:              authSave,
  getToken:          authGetToken,
  getUser:           authGetUser,
  getRole:           authGetRole,
  isLoggedIn:        authIsLoggedIn,
  logout:            authLogout,
  fetch:             authFetch,       // use instead of window.fetch for all API calls
  guard:             authGuard,
  login:             authLogin,
  applySidebarRBAC:  authApplySidebarRBAC,
  applyElementRBAC:  authApplyElementRBAC,
};
