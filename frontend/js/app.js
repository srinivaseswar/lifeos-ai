/**
 * LifeOS AI — Client-Side Application Controller
 * Minimalism Grid Style with Conversational Intent Understanding
 */

const $ = s => document.querySelector(s);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Module metadata
const ROLES = {
  spark: {
    name: 'Student & Learner',
    badge: 'Spark',
    icon: '🎓',
    desc: 'Classes, assignment deadlines, exam study plans, and focus blocks.'
  },
  prime: {
    name: 'Working Professional',
    badge: 'Prime',
    icon: '💼',
    desc: 'Client meetings, project deliverables, bill due dates, and follow-ups.'
  },
  care: {
    name: 'Senior Citizen',
    badge: 'Care',
    icon: '🌿',
    desc: 'Medication schedules, doctor appointments, wellness walks, and family calls.'
  }
};

const PRIORITY_BADGES = {
  h: { label: 'High Priority', class: 'badge-danger' },
  m: { label: 'Medium', class: 'badge-warning' },
  l: { label: 'Low', class: 'badge-neutral' }
};

// Global State
let token = localStorage.getItem('lifeos_token') || null;
let user = null;
let tasks = [];
let captures = [];
let chats = [];
let alertsData = { pendingConfirmations: [], urgentDeadlines: [], hasAlerts: false };
let currentView = 'dash';
let activeFilter = 'All';
let authMode = 'login';
let isAiThinking = false;
let simIndex = 0;

function showToast(msg) {
  const el = $('#toast-msg');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove('show'), 3000);
}

const formatTime = t => {
  if (!t) return '';
  let [h, m] = t.split(':');
  h = parseInt(h, 10);
  return `${(h % 12) || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

const sortTasks = (a, b) => (a.dateOffset - b.dateOffset) || a.time.localeCompare(b.time);

// API Client
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`/api${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) {
        logout();
        showToast('Your session has expired. Please log in again.');
      }
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } catch (err) {
    throw err;
  }
}

async function refreshAllData() {
  if (!token) return;
  try {
    const [taskList, captureList, chatList, alertInfo] = await Promise.all([
      api('/tasks'),
      api('/captures'),
      api('/ai/history'),
      api('/tasks/alerts')
    ]);
    tasks = taskList || [];
    captures = captureList || [];
    chats = chatList || [];
    alertsData = alertInfo || { pendingConfirmations: [], urgentDeadlines: [], hasAlerts: false };
    renderApp();
  } catch (e) {
    console.warn('Sync error:', e.message);
  }
}

async function init() {
  if (token) {
    try {
      user = await api('/auth/me');
      await refreshAllData();
    } catch (e) {
      token = null;
      localStorage.removeItem('lifeos_token');
      user = null;
    }
  }
  renderApp();
}

/* ---------------- Auth Modal ---------------- */
function openAuthModal(mode) {
  authMode = mode;
  renderAuthModalContent();
  $('#modal-root').style.display = 'grid';
}

function closeModal() {
  $('#modal-root').style.display = 'none';
}

function renderAuthModalContent() {
  const isSignup = authMode === 'signup';
  $('#modal-root').innerHTML = `
    <div class="modal-dialog">
      <div class="row-sp" style="margin-bottom:12px;">
        <h2>${isSignup ? 'Create Your Account' : 'Welcome Back'}</h2>
        <button class="btn btn-secondary btn-sm" onclick="closeModal()">✕</button>
      </div>
      <p style="margin-bottom:20px;">
        ${isSignup ? 'Set up your private personal assistant with zero predefined data.' : 'Log in to access your personalized schedule and intelligence feed.'}
      </p>

      <div style="display:flex;flex-direction:column;gap:14px;">
        ${isSignup ? `
          <div>
            <label>Full Name</label>
            <input id="auth_name" placeholder="Alex Morgan">
          </div>
        ` : ''}
        <div>
          <label>Email Address</label>
          <input id="auth_email" type="email" placeholder="name@example.com">
        </div>
        <div>
          <label>Password</label>
          <input id="auth_password" type="password" placeholder="At least 6 characters">
        </div>
        ${isSignup ? `
          <div>
            <label>Select Experience / Role</label>
            <select id="auth_role">
              ${Object.entries(ROLES).map(([k, r]) => `<option value="${k}">${r.icon} ${r.name} (${r.badge})</option>`).join('')}
            </select>
          </div>
        ` : ''}

        <div id="auth_error" style="color:var(--danger-text);font-size:0.85rem;min-height:1.2rem;font-weight:600;"></div>

        <button class="btn btn-primary" style="padding:12px;margin-top:4px;" onclick="handleAuthSubmit()">
          ${isSignup ? 'Get Started' : 'Sign In'}
        </button>

        <p style="text-align:center;font-size:0.85rem;margin-top:10px;">
          ${isSignup ? 'Already have an account?' : 'New user?'}
          <a href="#" onclick="authMode='${isSignup ? 'login' : 'signup'}';renderAuthModalContent();return false;" style="color:var(--primary);font-weight:600;text-decoration:none;">
            ${isSignup ? 'Sign in here' : 'Create an account'}
          </a>
        </p>
      </div>
    </div>
  `;
}

async function handleAuthSubmit() {
  const errBox = $('#auth_error');
  errBox.textContent = '';
  const email = $('#auth_email').value.trim();
  const password = $('#auth_password').value;

  if (!email) return (errBox.textContent = 'Please provide your email address.');
  if (!password) return (errBox.textContent = 'Please provide your password.');

  try {
    if (authMode === 'signup') {
      const name = $('#auth_name').value.trim();
      const role = $('#auth_role').value;
      if (!name) return (errBox.textContent = 'Please provide your full name.');

      const res = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role })
      });
      token = res.token;
      user = res.user;
      localStorage.setItem('lifeos_token', token);
      closeModal();
      await refreshAllData();
      showToast(`Welcome to LifeOS AI, ${user.name.split(' ')[0]}!`);
    } else {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      token = res.token;
      user = res.user;
      localStorage.setItem('lifeos_token', token);
      closeModal();
      await refreshAllData();
      showToast(`Welcome back, ${user.name.split(' ')[0]}!`);
    }
  } catch (err) {
    errBox.textContent = err.message;
  }
}

function logout() {
  token = null;
  user = null;
  tasks = [];
  captures = [];
  chats = [];
  alertsData = { pendingConfirmations: [], urgentDeadlines: [], hasAlerts: false };
  localStorage.removeItem('lifeos_token');
  renderApp();
  showToast('You have been signed out.');
}

/* ---------------- Minimalist Landing Page ---------------- */
function renderLanding() {
  return `
    <div style="max-width:1160px;margin:0 auto;padding:24px 20px 80px;">
      <!-- Header -->
      <header class="row-sp" style="padding:16px 0 40px;">
        <div class="row">
          <div class="brand-mark">L</div>
          <div>
            <h3 style="font-size:1.15rem;font-weight:700;">LifeOS AI</h3>
            <p style="font-size:0.78rem;color:var(--text-subtle);">Minimalist Life Intelligence</p>
          </div>
        </div>
        <div class="row">
          <button class="btn btn-secondary" onclick="openAuthModal('login')">Sign In</button>
          <button class="btn btn-primary" onclick="openAuthModal('signup')">Get Started</button>
        </div>
      </header>

      <!-- Hero Section in Minimalist Grid -->
      <section style="padding:30px 0 50px;">
        <div class="grid grid-2" style="align-items:center;gap:36px;">
          <div>
            <span class="badge badge-primary" style="margin-bottom:14px;">Next-Generation Assistant</span>
            <h1 style="margin-bottom:18px;">Your conversations,<br>intelligently scheduled.</h1>
            <p style="font-size:1.05rem;line-height:1.6;margin-bottom:28px;">
              LifeOS AI understands calls, SMS, WhatsApp conversations, and emails. It distinguishes casual chats from genuine commitments, automatically organizes your calendar, and reminds you before deadlines.
            </p>
            <div class="row">
              <button class="btn btn-primary" style="padding:12px 24px;font-size:0.95rem;" onclick="openAuthModal('signup')">
                Start Free Account →
              </button>
              <button class="btn btn-secondary" style="padding:12px 20px;" onclick="openAuthModal('login')">
                Sign In
              </button>
            </div>
          </div>

          <!-- Conversational Intelligence Showcase Card -->
          <div class="card" style="padding:24px;background:#ffffff;">
            <div class="row-sp" style="margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:12px;">
              <div class="row">
                <span class="badge badge-success">AI Understanding Example</span>
              </div>
              <small class="badge badge-neutral">WhatsApp Dialogue</small>
            </div>

            <div style="font-size:0.88rem;display:flex;flex-direction:column;gap:10px;margin-bottom:18px;">
              <div style="background:var(--surface-subtle);padding:10px 14px;border-radius:8px;border-left:3px solid var(--text-subtle);">
                <b>Friend Alex:</b> "Hey, let's go on a trip this weekend! What do you think?"
              </div>
              <div style="background:var(--primary-light);padding:10px 14px;border-radius:8px;border-left:3px solid var(--primary);margin-left:auto;text-align:right;">
                <b>You:</b> "Okay, let's go! Saturday morning works."
              </div>
            </div>

            <div style="border:1px solid var(--success-border);background:var(--success-light);padding:14px;border-radius:8px;">
              <div class="row-sp">
                <div>
                  <b style="color:var(--success-text);font-size:0.92rem;">🗓️ Confirmed Commitment Detected</b>
                  <p style="color:var(--success-text);font-size:0.82rem;margin-top:2px;">
                    Mutual agreement recognized. Weekend trip added to schedule for Saturday 10:00 AM.
                  </p>
                </div>
                <span class="badge badge-success">Scheduled</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Roles Grid -->
      <div style="margin:40px 0 20px;">
        <h2 style="font-size:1.35rem;margin-bottom:8px;">Designed for Every Stage of Life</h2>
        <p style="margin-bottom:20px;">Choose a role for an interface and schedule tailored specifically to your daily responsibilities.</p>
      </div>

      <div class="grid grid-3">
        ${Object.entries(ROLES).map(([key, r]) => `
          <div class="card" style="cursor:pointer;" onclick="openAuthModal('signup')">
            <div style="font-size:1.8rem;margin-bottom:10px;">${r.icon}</div>
            <h3 style="margin-bottom:6px;">${r.name}</h3>
            <span class="badge badge-primary" style="margin-bottom:12px;">${r.badge}</span>
            <p style="font-size:0.9rem;">${r.desc}</p>
          </div>
        `).join('')}
      </div>

      <!-- Features Minimalist Grid -->
      <div style="margin:60px 0 20px;">
        <h2 style="font-size:1.35rem;margin-bottom:8px;">Core Capabilities</h2>
        <p style="margin-bottom:20px;">Intelligent, privacy-focused life management that respects your personal boundaries.</p>
      </div>

      <div class="grid grid-4">
        <div class="card card-metric">
          <div style="font-size:1.5rem;margin-bottom:8px;">💬</div>
          <h3>Contextual Understanding</h3>
          <p style="margin-top:6px;font-size:0.85rem;">Distinguishes confirmed plans from casual chat and proposals.</p>
        </div>
        <div class="card card-metric">
          <div style="font-size:1.5rem;margin-bottom:8px;">⏰</div>
          <h3>Proactive Scheduling</h3>
          <p style="margin-top:6px;font-size:0.85rem;">Extracts dates, times, and locations directly into your calendar.</p>
        </div>
        <div class="card card-metric">
          <div style="font-size:1.5rem;margin-bottom:8px;">🔔</div>
          <h3>Smart Alerts</h3>
          <p style="margin-top:6px;font-size:0.85rem;">Pre-due date reminders and follow-up prompts before you forget.</p>
        </div>
        <div class="card card-metric">
          <div style="font-size:1.5rem;margin-bottom:8px;">🛡️</div>
          <h3>Zero Data Leakage</h3>
          <p style="margin-top:6px;font-size:0.85rem;">Sensitive codes (OTPs, PINs) are scrubbed and never saved.</p>
        </div>
      </div>
    </div>
  `;
}

/* ---------------- Main Authenticated Views ---------------- */
const scheduleItemComponent = task => {
  const p = PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.m;
  const isPending = Boolean(task.needsConfirmation);

  return `
    <div class="schedule-item ${task.done ? 'is-done' : ''}">
      <input type="checkbox" style="width:auto;cursor:pointer;" ${task.done ? 'checked' : ''} onchange="toggleTaskDone('${task._id}')">
      
      <div class="item-time">
        ${task.dateOffset ? (task.dateLabel || 'Tmrw') + ' ' : ''}${formatTime(task.time)}
      </div>

      <div style="flex:1;min-width:0;">
        <div class="row" style="gap:8px;">
          <span class="item-title" style="font-weight:600;font-size:0.92rem;color:var(--text-main);">
            ${esc(task.title)}
          </span>
          ${isPending ? `<span class="badge badge-warning">Awaiting Confirmation</span>` : ''}
          ${task.location ? `<span class="badge badge-neutral">📍 ${esc(task.location)}</span>` : ''}
        </div>
        <div class="row" style="gap:10px;margin-top:3px;font-size:0.8rem;color:var(--text-muted);">
          <span>Category: <b>${esc(task.category || 'General')}</b></span>
          ${task.participants && task.participants.length ? `<span>With: ${esc(task.participants.join(', '))}</span>` : ''}
          <span>Source: ${esc(task.source || 'Manual')}</span>
        </div>
      </div>

      <div class="row" style="gap:8px;">
        <span class="badge ${p.class}">${p.label}</span>
        ${isPending ? `
          <button class="btn btn-success btn-sm" onclick="confirmTentativeTask('${task._id}')">Confirm Plan</button>
        ` : ''}
        <button class="btn btn-secondary btn-sm" onclick="deleteTaskItem('${task._id}')">✕</button>
      </div>
    </div>
  `;
};

const VIEWS = {
  dash() {
    const roleInfo = ROLES[user.role] || ROLES.spark;
    const pendingTasks = tasks.filter(t => !t.done && !t.needsConfirmation).sort(sortTasks);
    const todayTasks = pendingTasks.filter(t => !t.dateOffset);
    const upcomingTasks = pendingTasks.filter(t => t.dateOffset);
    const pendingReviews = tasks.filter(t => t.needsConfirmation && !t.done);
    const urgentItems = tasks.filter(t => t.priority === 'h' && !t.done);

    return `
      <!-- Top Overview Greeting -->
      <div class="row-sp" style="margin-bottom:24px;">
        <div>
          <h2>Dashboard</h2>
          <p>Welcome back, ${esc(user.name)}. Here is your proactive daily briefing.</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="optimizeDailySchedule()">⚡ Optimize Schedule</button>
      </div>

      <!-- Proactive Attention Banner (Smart Alerts) -->
      ${pendingReviews.length ? `
        <div class="alert-banner alert-warning">
          <div style="font-size:1.3rem;">⚠️</div>
          <div style="flex:1;">
            <b>${pendingReviews.length} Potential Plan(s) Need Your Confirmation</b>
            <p style="color:var(--warning-text);font-size:0.88rem;margin-top:2px;">
              AI detected tentative activities from conversations. Review and confirm to lock them into your schedule.
            </p>
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
              ${pendingReviews.map(p => `
                <div class="row-sp" style="background:#fff;padding:8px 12px;border-radius:6px;border:1px solid var(--warning-border);">
                  <div>
                    <b>${esc(p.title)}</b> (${formatTime(p.time)})
                    ${p.location ? `· 📍 ${esc(p.location)}` : ''}
                  </div>
                  <div class="row" style="gap:6px;">
                    <button class="btn btn-success btn-sm" onclick="confirmTentativeTask('${p._id}')">Confirm & Schedule</button>
                    <button class="btn btn-secondary btn-sm" onclick="deleteTaskItem('${p._id}')">Dismiss</button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Minimalist Metrics Grid -->
      <div class="grid grid-4" style="margin-bottom:26px;">
        <div class="card card-metric">
          <div class="row-sp">
            <span style="font-size:0.85rem;font-weight:600;color:var(--text-muted);">Today's Schedule</span>
            <span class="badge badge-primary">Active</span>
          </div>
          <div class="metric-value">${todayTasks.length}</div>
        </div>
        <div class="card card-metric">
          <div class="row-sp">
            <span style="font-size:0.85rem;font-weight:600;color:var(--text-muted);">Urgent Deadlines</span>
            <span class="badge badge-danger">Priority</span>
          </div>
          <div class="metric-value">${urgentItems.length}</div>
        </div>
        <div class="card card-metric">
          <div class="row-sp">
            <span style="font-size:0.85rem;font-weight:600;color:var(--text-muted);">Pending Reviews</span>
            <span class="badge badge-warning">Tentative</span>
          </div>
          <div class="metric-value">${pendingReviews.length}</div>
        </div>
        <div class="card card-metric">
          <div class="row-sp">
            <span style="font-size:0.85rem;font-weight:600;color:var(--text-muted);">Processed Signals</span>
            <span class="badge badge-neutral">Streams</span>
          </div>
          <div class="metric-value">${captures.length}</div>
        </div>
      </div>

      <!-- Schedule Minimalist Split Grid -->
      <div class="grid grid-2">
        <div class="card">
          <div class="row-sp" style="margin-bottom:16px;">
            <h3>Today's Confirmed Timeline</h3>
            <button class="btn btn-secondary btn-sm" onclick="currentView='rem';renderApp();">＋ New</button>
          </div>
          ${todayTasks.length ? todayTasks.map(scheduleItemComponent).join('') : `
            <div style="text-align:center;padding:36px 12px;color:var(--text-muted);">
              <div style="font-size:1.8rem;margin-bottom:6px;">☕</div>
              <p>Your schedule for today is completely clear.</p>
              <small>Captured events from SMS, WhatsApp, and Emails will appear here automatically.</small>
            </div>
          `}
        </div>

        <div class="card">
          <div class="row-sp" style="margin-bottom:16px;">
            <h3>Upcoming Commitments</h3>
            <span class="badge badge-neutral">Next 7 Days</span>
          </div>
          ${upcomingTasks.length ? upcomingTasks.map(scheduleItemComponent).join('') : `
            <div style="text-align:center;padding:36px 12px;color:var(--text-muted);">
              <div style="font-size:1.8rem;margin-bottom:6px;">📅</div>
              <p>No upcoming commitments scheduled.</p>
            </div>
          `}
        </div>
      </div>
    `;
  },

  cap() {
    const perms = user.permissions || { SMS: true, Call: true, WhatsApp: true, Photos: true, Email: true, Laptop: true };

    return `
      <div class="row-sp" style="margin-bottom:20px;">
        <div>
          <h2>Smart Information Tracking</h2>
          <p>Extract commitments, tasks, and deadlines from conversations, messages, emails, and photos.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <div class="grid grid-2" style="margin-bottom:16px;">
          <div>
            <label>Communication Channel</label>
            <select id="cap_src">
              <option value="WhatsApp" ${perms.WhatsApp ? '' : 'disabled'}>🟢 WhatsApp Dialogue ${perms.WhatsApp ? '' : '(Disabled in Settings)'}</option>
              <option value="SMS" ${perms.SMS ? '' : 'disabled'}>💬 SMS Message ${perms.SMS ? '' : '(Disabled in Settings)'}</option>
              <option value="Call" ${perms.Call ? '' : 'disabled'}>📞 Phone Call Log ${perms.Call ? '' : '(Disabled in Settings)'}</option>
              <option value="Email" ${perms.Email ? '' : 'disabled'}>✉️ Email Notification ${perms.Email ? '' : '(Disabled in Settings)'}</option>
              <option value="Laptop" ${perms.Laptop ? '' : 'disabled'}>💻 Notes & Memos ${perms.Laptop ? '' : '(Disabled in Settings)'}</option>
            </select>
          </div>

          <div class="row" style="align-items:flex-end;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="submitTextCapture()">⚡ Understand & Schedule</button>
            <button class="btn btn-secondary" onclick="triggerFilePicker()">📷 Scan Photo/Doc</button>
            <button class="btn btn-secondary" onclick="pasteClip()">📋 Paste</button>
            <button class="btn btn-secondary" onclick="dictateVoice()">🎤 Voice</button>
            <button class="btn btn-secondary" onclick="runSimulation()">🧪 Test Examples</button>
          </div>
        </div>

        <label>Message Content or Dialogue</label>
        <textarea id="cap_text" rows="3" placeholder="Paste conversation, email, or message. E.g.:&#10;Alex: 'Let's go on a trip this weekend'&#10;Me: 'Okay, let's go!'"></textarea>

        <input type="file" id="file_picker" accept="image/*,.txt" style="display:none;" onchange="uploadPhotoOrDoc(this.files[0])">

        <div style="border:1px dashed var(--border);border-radius:var(--radius-sm);padding:14px;text-align:center;margin-top:12px;background:var(--surface-subtle);cursor:pointer;" onclick="triggerFilePicker()">
          <p style="font-size:0.85rem;color:var(--text-muted);">
            📷 <b>Drop receipts, prescription slips, or WhatsApp chat exports here</b> (OCR extracts dates & deadlines automatically)
          </p>
        </div>
      </div>

      <div class="card">
        <div class="row-sp" style="margin-bottom:16px;">
          <h3>Extracted Information Stream</h3>
          ${captures.length ? `<button class="btn btn-secondary btn-sm" onclick="clearAllCaptures()">Clear History</button>` : ''}
        </div>

        ${captures.length ? captures.map(c => `
          <div class="schedule-item" style="padding:12px 14px;">
            <span class="badge badge-neutral" style="font-family:var(--font-mono);">${c.source}</span>
            <div style="flex:1;min-width:0;">
              <b style="font-size:0.9rem;color:var(--text-main);">${esc(c.rawText)}</b>
              <div class="row" style="gap:10px;margin-top:2px;font-size:0.78rem;color:var(--text-muted);">
                <span>Category: <b>${esc(c.category || 'General')}</b></span>
                <span>Status: <b style="color:${c.sensitive ? 'var(--danger-text)' : 'var(--text-main)'};">${esc(c.status)}</b></span>
              </div>
            </div>
          </div>
        `).join('') : `
          <div style="text-align:center;padding:32px;color:var(--text-muted);">
            <p>No messages analyzed yet. Paste a conversation above or click "Test Examples" to observe AI intent parsing.</p>
          </div>
        `}
      </div>
    `;
  },

  rem() {
    return `
      <div class="row-sp" style="margin-bottom:20px;">
        <div>
          <h2>Schedule & Commitments</h2>
          <p>Organize confirmed obligations and track deadlines.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <h3 style="margin-bottom:14px;">Add Commitment or Reminder</h3>
        <div class="grid grid-3">
          <div style="grid-column:1/-1;">
            <label>Task / Event Title</label>
            <input id="new_title" placeholder="e.g. Mathematics Problem Set Submission">
          </div>
          <div>
            <label>Time</label>
            <input id="new_time" type="time" value="10:00">
          </div>
          <div>
            <label>Day</label>
            <select id="new_day">
              <option value="0">Today</option>
              <option value="1">Tomorrow</option>
            </select>
          </div>
          <div>
            <label>Priority</label>
            <select id="new_pri">
              <option value="h">High (Urgent / Health / Bill)</option>
              <option value="m" selected>Medium (Standard Meeting)</option>
              <option value="l">Low (Casual)</option>
            </select>
          </div>
          <div>
            <label>Location (Optional)</label>
            <input id="new_loc" placeholder="Room 101 / Zoom / Clinic">
          </div>
          <div>
            <label>Category</label>
            <select id="new_cat">
              <option value="Work & Meetings">Work & Meetings</option>
              <option value="Academic & Deadlines">Academic & Deadlines</option>
              <option value="Health & Care">Health & Care</option>
              <option value="Bills & Financial">Bills & Financial</option>
              <option value="Travel & Social">Travel & Social</option>
              <option value="General">General</option>
            </select>
          </div>
          <div style="display:flex;align-items:flex-end;">
            <button class="btn btn-primary" style="width:100%;" onclick="createNewTask()">Schedule Event</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="row-sp" style="margin-bottom:16px;">
          <h3>All Scheduled Items (${tasks.length})</h3>
        </div>
        ${tasks.length ? tasks.sort(sortTasks).map(scheduleItemComponent).join('') : `
          <div style="text-align:center;padding:32px;color:var(--text-muted);">
            <p>No reminders yet. Add one above or capture messages.</p>
          </div>
        `}
      </div>
    `;
  },

  ai() {
    const chips = {
      spark: ['Suggest an exam revision schedule', 'What assignments are due this week?', 'Help me plan my afternoon study block'],
      prime: ['Prioritize my meetings and deadlines today', 'Draft a polite follow-up regarding the proposal', 'What follow-ups are pending?'],
      care: ['Review my medicine reminders for today', 'What appointments do I have coming up?', 'Help me plan a relaxing evening routine']
    }[user.role] || ['What is on my schedule today?'];

    return `
      <div class="row-sp" style="margin-bottom:20px;">
        <div>
          <h2>AI Personal Assistant</h2>
          <p>Context-aware assistant that understands your commitments and responsibilities.</p>
        </div>
      </div>

      <div class="card" style="height:calc(100vh - 230px);display:flex;flex-direction:column;justify-content:space-between;">
        <div id="ai_feed" style="overflow-y:auto;flex:1;padding-right:8px;margin-bottom:16px;">
          ${chats.map((c, i) => `
            <div class="chat-bubble ${c.role === 'user' ? 'chat-user' : 'chat-ai'}">
              ${esc(c.content).replace(/\n/g, '<br>')}
              ${c.actionProposal ? `
                <div style="margin-top:8px;padding-top:8px;border-top:1px dashed var(--border);">
                  <button class="btn btn-success btn-sm" onclick="acceptChatScheduleProposal(${i})">
                    ${c.actionProposal.done ? '✓ Scheduled' : `＋ Add to Calendar: ${formatTime(c.actionProposal.time)} · ${esc(c.actionProposal.title)}`}
                  </button>
                </div>
              ` : ''}
            </div>
          `).join('') || `
            <div style="text-align:center;padding:48px 20px;color:var(--text-muted);">
              <div style="font-size:2rem;margin-bottom:8px;">💡</div>
              <p>Ask anything about your schedule, deadlines, or upcoming plans.</p>
            </div>
          `}
          ${isAiThinking ? '<div class="chat-bubble chat-ai">Thinking…</div>' : ''}
        </div>

        <div style="border-top:1px solid var(--border);padding-top:14px;">
          <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            ${chips.map(chip => `
              <button class="btn btn-secondary btn-sm" onclick="sendAiMessage('${chip}')">${chip}</button>
            `).join('')}
          </div>

          <div class="row">
            <input id="ai_input" placeholder="Type your instruction or question..." onkeydown="if(event.key==='Enter')sendAiMessage()">
            <button class="btn btn-primary" onclick="sendAiMessage()">Send</button>
          </div>
        </div>
      </div>
    `;
  },

  not() {
    const tabs = ['All', 'High Priority', 'Pending Confirmations', 'Completed'];
    let filtered = tasks;

    if (activeFilter === 'High Priority') filtered = filtered.filter(t => t.priority === 'h' && !t.done);
    if (activeFilter === 'Pending Confirmations') filtered = filtered.filter(t => t.needsConfirmation && !t.done);
    if (activeFilter === 'Completed') filtered = filtered.filter(t => t.done);
    if (activeFilter === 'All') filtered = filtered.filter(t => !t.done);

    return `
      <div class="row-sp" style="margin-bottom:20px;">
        <div>
          <h2>Alerts & Responsibilities</h2>
          <p>Proactive reminders and follow-up management.</p>
        </div>
      </div>

      <div class="row" style="gap:8px;margin-bottom:20px;">
        ${tabs.map(tab => `
          <button class="btn ${activeFilter === tab ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="activeFilter='${tab}';renderApp();">
            ${tab}
          </button>
        `).join('')}
      </div>

      <div class="card">
        ${filtered.length ? filtered.sort(sortTasks).map(scheduleItemComponent).join('') : `
          <div style="text-align:center;padding:36px;color:var(--text-muted);">
            <p>No items found for this filter.</p>
          </div>
        `}
      </div>
    `;
  },

  set() {
    const perms = user.permissions || { SMS: true, Call: true, WhatsApp: true, Photos: true, Email: true, Laptop: true };
    const aiConfig = user.aiSettings || { url: '', model: '', key: '' };

    return `
      <div class="row-sp" style="margin-bottom:20px;">
        <div>
          <h2>Settings & Privacy</h2>
          <p>Full control over communication channels, connected sources, and personal data.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <h3>Monitored Information Channels</h3>
        <p style="margin-bottom:16px;">LifeOS AI only tracks sources you explicitly enable.</p>

        <div class="grid grid-3">
          ${Object.keys(perms).map(channel => `
            <label class="row" style="background:var(--surface-subtle);padding:12px;border-radius:var(--radius-sm);cursor:pointer;">
              <input type="checkbox" style="width:auto;" ${perms[channel] ? 'checked' : ''} onchange="updateChannelPermission('${channel}', this.checked)">
              <span style="font-size:0.9rem;font-weight:600;text-transform:none;color:var(--text-main);">${channel} Channel</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:24px;">
        <h3>AI Provider Configuration</h3>
        <p style="margin-bottom:14px;">Connect your custom LLM endpoint or OpenAI API key for enhanced reasoning.</p>

        <div class="grid grid-2">
          <div>
            <label>API Endpoint URL</label>
            <input id="ai_url" placeholder="https://api.openai.com/v1/chat/completions" value="${esc(aiConfig.url || '')}">
          </div>
          <div>
            <label>Model Name</label>
            <input id="ai_model" placeholder="gpt-4o-mini" value="${esc(aiConfig.model || '')}">
          </div>
          <div style="grid-column:1/-1;">
            <label>Secret API Key</label>
            <input id="ai_key" type="password" placeholder="sk-..." value="${esc(aiConfig.key || '')}">
          </div>
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="saveCustomAiSettings()">Save Settings</button>
      </div>

      <div class="card">
        <h3>Data Management & Privacy</h3>
        <p style="margin-bottom:16px;">Logged in as: <b>${esc(user.email)}</b> (${esc(user.name)})</p>
        <div class="row" style="gap:10px;">
          <button class="btn btn-secondary" onclick="exportUserData()">📥 Export My Data (JSON)</button>
          <button class="btn btn-danger" onclick="wipeAccountData()">⚠️ Wipe All My Data</button>
        </div>
      </div>
    `;
  }
};

/* ---------------- Main Layout Controller ---------------- */
function renderApp() {
  if (!user) {
    document.body.className = '';
    $('#app-root').innerHTML = renderLanding();
    return;
  }

  const role = ROLES[user.role] || ROLES.spark;
  const navItems = [
    ['dash', '📊', 'Dashboard'],
    ['cap', '💬', 'Smart Capture'],
    ['rem', '🗓️', 'Schedule'],
    ['ai', '🤖', 'AI Assistant'],
    ['not', '🔔', 'Alerts'],
    ['set', '⚙️', 'Settings']
  ];

  $('#app-root').innerHTML = `
    <div class="app-container">
      <aside class="sidebar">
        <div>
          <div class="sidebar-brand">
            <div class="brand-mark">L</div>
            <div>
              <h3 style="font-size:1.05rem;">LifeOS AI</h3>
              <span class="badge badge-primary" style="font-size:0.7rem;">${role.badge}</span>
            </div>
          </div>

          <nav>
            ${navItems.map(n => `
              <button class="nav-btn ${currentView === n[0] ? 'active' : ''}" onclick="currentView='${n[0]}';renderApp();">
                <span>${n[1]}</span>
                <span>${n[2]}</span>
              </button>
            `).join('')}
          </nav>
        </div>

        <div style="border-top:1px solid var(--border);padding-top:16px;">
          <div class="row-sp" style="margin-bottom:10px;">
            <div style="min-width:0;">
              <b style="font-size:0.85rem;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(user.name)}</b>
              <small style="color:var(--text-muted);font-size:0.75rem;">${esc(user.email)}</small>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="logout()" title="Sign Out">Sign out</button>
          </div>
        </div>
      </aside>

      <main class="main-content">
        ${VIEWS[currentView] ? VIEWS[currentView]() : VIEWS.dash()}
      </main>
    </div>
  `;

  const feed = $('#ai_feed');
  if (feed) feed.scrollTop = feed.scrollHeight;
}

/* ---------------- Actions ---------------- */
async function createNewTask() {
  const title = $('#new_title').value.trim();
  if (!title) return showToast('Please enter a title.');
  const time = $('#new_time').value || '10:00';
  const dateOffset = parseInt($('#new_day').value, 10) || 0;
  const priority = $('#new_pri').value;
  const location = $('#new_loc').value.trim() || null;
  const category = $('#new_cat').value;

  try {
    const newTask = await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, time, dateOffset, priority, location, category, source: 'Manual' })
    });
    tasks.push(newTask);
    renderApp();
    showToast('Scheduled successfully.');
  } catch (err) {
    showToast(err.message);
  }
}

async function toggleTaskDone(id) {
  const task = tasks.find(t => t._id === id);
  if (!task) return;
  try {
    const updated = await api(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: !task.done })
    });
    task.done = updated.done;
    renderApp();
    showToast(task.done ? 'Marked as completed.' : 'Unchecked task.');
  } catch (err) {
    showToast(err.message);
  }
}

async function confirmTentativeTask(id) {
  try {
    const res = await api(`/tasks/${id}/confirm`, { method: 'POST' });
    const idx = tasks.findIndex(t => t._id === id);
    if (idx !== -1) tasks[idx] = res.task;
    await refreshAllData();
    showToast('Plan confirmed and added to calendar!');
  } catch (err) {
    showToast(err.message);
  }
}

async function deleteTaskItem(id) {
  try {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    tasks = tasks.filter(t => t._id !== id);
    renderApp();
    showToast('Event removed.');
  } catch (err) {
    showToast(err.message);
  }
}

async function submitTextCapture(explicitText, explicitSource) {
  const source = explicitSource || $('#cap_src').value;
  const text = explicitText || $('#cap_text').value.trim();

  if (!text) return showToast('Please enter message or conversation content.');

  try {
    const res = await api('/captures', {
      method: 'POST',
      body: JSON.stringify({ text, source })
    });

    captures.unshift(res.capture);
    if (res.task) tasks.push(res.task);
    if ($('#cap_text')) $('#cap_text').value = '';
    await refreshAllData();
    showToast(res.analysis.status);
  } catch (err) {
    showToast(err.message);
  }
}

function triggerFilePicker() {
  const input = $('#file_picker');
  if (input) input.click();
}

async function uploadPhotoOrDoc(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append('photo', file);

  showToast('Analyzing image with OCR & AI Intent Parser…');
  try {
    const res = await fetch('/api/captures/photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to process document');

    captures.unshift(data.capture);
    if (data.task) tasks.push(data.task);
    await refreshAllData();
    showToast(data.analysis.status);
  } catch (err) {
    showToast(err.message);
  }
}

function pasteClip() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    return showToast('Clipboard API not permitted. Paste manually.');
  }
  navigator.clipboard.readText()
    .then(t => {
      $('#cap_text').value = t;
      submitTextCapture(t);
    })
    .catch(() => showToast('Please allow clipboard permission.'));
}

function dictateVoice() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) return showToast('Voice dictation not supported in this browser.');
  const rec = new Speech();
  rec.lang = 'en-US';
  rec.onresult = e => {
    const transcript = e.results[0][0].transcript;
    $('#cap_text').value = transcript;
    submitTextCapture(transcript);
  };
  rec.onerror = () => showToast('Voice recognition canceled.');
  rec.start();
  showToast('Listening… Speak your message.');
}

const REALISTIC_SIMULATIONS = [
  // 1. Dialogue with mutual agreement (Confirmed trip)
  ['WhatsApp', 'Alex: "Let\'s go on a trip this weekend!"\nMe: "Okay, let\'s go! Saturday morning works."'],
  // 2. Tentative coffee proposal (Needs confirmation)
  ['WhatsApp', 'Sarah: "How about grabbing coffee on Friday at 4 pm at Starbucks?"'],
  // 3. Official Doctor appointment
  ['SMS', 'Dr. Adams: Your follow-up checkup is confirmed tomorrow at 10:30 am at City Health Clinic.'],
  // 4. Utility Bill Email
  ['Email', 'Invoice Notice: Your electricity bill of $64.20 is due tomorrow at 5:00 pm. Pay now to avoid late fee.'],
  // 5. Marketing Promotional spam (Muted)
  ['SMS', 'CLEARANCE SALE! Flat 70% discount on shoes today only with code FLASH70. Hurry!'],
  // 6. Sensitive OTP (Scrubbed and discarded)
  ['SMS', 'Your verification passcode is 591024. Never share your password or OTP with anyone.']
];

function runSimulation() {
  const sim = REALISTIC_SIMULATIONS[simIndex++ % REALISTIC_SIMULATIONS.length];
  submitTextCapture(sim[1], sim[0]);
}

// AI Assistant
async function sendAiMessage(promptText) {
  const input = $('#ai_input');
  const q = (promptText || (input ? input.value : '')).trim();
  if (!q || isAiThinking) return;

  if (input) input.value = '';
  chats.push({ role: 'user', content: q });
  isAiThinking = true;
  renderApp();

  try {
    const res = await api('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message: q })
    });
    chats.push({
      role: 'assistant',
      content: res.reply,
      actionProposal: res.actionProposal
    });
  } catch (err) {
    chats.push({ role: 'assistant', content: 'Could not complete AI request.' });
  } finally {
    isAiThinking = false;
    renderApp();
  }
}

async function acceptChatScheduleProposal(index) {
  const msg = chats[index];
  if (!msg || !msg.actionProposal || msg.actionProposal.done) return;
  const p = msg.actionProposal;

  try {
    const newTask = await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: p.title,
        time: p.time,
        priority: p.priority || 'm',
        dateOffset: 0,
        source: 'AI Assistant'
      })
    });
    tasks.push(newTask);
    p.done = true;
    renderApp();
    showToast('Added to your calendar.');
  } catch (err) {
    showToast(err.message);
  }
}

async function optimizeDailySchedule() {
  showToast('Analyzing daily commitments and workload…');
  try {
    const res = await api('/ai/optimize', { method: 'POST' });
    if (res.addedTask) tasks.push(res.addedTask);
    renderApp();
    showToast(res.message);
  } catch (err) {
    showToast(err.message);
  }
}

async function updateChannelPermission(channel, enabled) {
  if (!user.permissions) user.permissions = {};
  user.permissions[channel] = enabled;
  try {
    await api('/auth/settings', {
      method: 'PATCH',
      body: JSON.stringify({ permissions: user.permissions })
    });
    showToast(`${channel} monitoring ${enabled ? 'enabled' : 'disabled'}.`);
  } catch (err) {
    showToast(err.message);
  }
}

async function saveCustomAiSettings() {
  const url = $('#ai_url').value.trim();
  const model = $('#ai_model').value.trim();
  const key = $('#ai_key').value.trim();

  try {
    await api('/auth/settings', {
      method: 'PATCH',
      body: JSON.stringify({ aiSettings: { url, model, key } })
    });
    user.aiSettings = { url, model, key };
    showToast('AI configuration updated.');
  } catch (err) {
    showToast(err.message);
  }
}

async function clearAllCaptures() {
  try {
    await api('/captures', { method: 'DELETE' });
    captures = [];
    renderApp();
    showToast('Capture history cleared.');
  } catch (err) {
    showToast(err.message);
  }
}

async function wipeAccountData() {
  if (!confirm('Are you sure you want to delete all personal reminders, schedules, and captured messages?')) return;
  try {
    await Promise.all([
      api('/tasks', { method: 'DELETE' }),
      api('/captures', { method: 'DELETE' })
    ]);
    tasks = [];
    captures = [];
    renderApp();
    showToast('All your private records have been erased.');
  } catch (err) {
    showToast(err.message);
  }
}

function exportUserData() {
  const payload = {
    profile: { name: user.name, email: user.email, role: user.role },
    tasks,
    captures,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lifeos_data_${Date.now()}.json`;
  a.click();
  showToast('Data exported successfully.');
}

// Background reminder and approaching deadline alerts
setInterval(() => {
  if (!user || !tasks.length) return;
  const now = new Date();
  const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  tasks.forEach(t => {
    if (!t.done && !t.dateOffset && t.time === curTime && !t._alertSent) {
      t._alertSent = true;
      showToast(`⏰ Event Reminder: ${t.title}`);
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('LifeOS Commitment Reminder', {
          body: `${t.title} at ${formatTime(t.time)}`
        });
      }
    }
  });
}, 15000);

init();
