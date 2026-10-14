/**
 * LifeOS AI — Client-Side Application Controller
 * Connects frontend directly to production REST API endpoints
 */

const $ = s => document.querySelector(s);
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Roles & Modules Configuration
const MODS = {
  spark: {
    n: 'LifeOS Spark',
    who: 'Juniors & Students',
    age: 'Students and young learners',
    c: '#b38cff',
    ic: '🎓',
    d: 'Classes, assignments, study plans, and focus habits.'
  },
  prime: {
    n: 'LifeOS Prime',
    who: 'Working Professionals',
    age: 'Working adults and managers',
    c: '#4d7cff',
    ic: '💼',
    d: 'Work tasks, meetings, client deadlines, and daily follow-ups.'
  },
  care: {
    n: 'LifeOS Care',
    who: 'Senior Citizens',
    age: 'Seniors and elderly care',
    c: '#2ee59d',
    ic: '🌿',
    d: 'Large friendly screens for medicines, doctor checkups, and family calls.'
  }
};

const P = {
  h: ['High', 'var(--red)'],
  m: ['Medium', 'var(--amb)'],
  l: ['Low', 'var(--grn)']
};

// Global Application State
let token = localStorage.getItem('lifeos_token') || null;
let user = null;
let tasks = [];
let captures = [];
let chats = [];
let activeView = 'dash';
let activeTab = 'All';
let authMode = 'login';
let isThinking = false;
let sampleIndex = 0;
let lastView = '';

// Toast notification helper
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.style.opacity = '0'; }, 2800);
}

// Time & date format helpers
const fmt = t => {
  if (!t) return '';
  let [h, m] = t.split(':');
  h = parseInt(h, 10);
  return `${(h % 12) || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

const srt = (a, b) => (a.dateOffset - b.dateOffset) || a.time.localeCompare(b.time);
const psrt = (a, b) => 'hml'.indexOf(a.priority) - 'hml'.indexOf(b.priority) || srt(a, b);

// API Fetch Helper with JWT authentication
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`/api${endpoint}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) {
        logout();
        toast('Session expired. Please log in again.');
      }
      throw new Error(data.error || 'Server request failed');
    }
    return data;
  } catch (err) {
    throw err;
  }
}

// Data synchronization with backend
async function syncData() {
  if (!token) return;
  try {
    const [tList, cList, hList] = await Promise.all([
      api('/tasks'),
      api('/captures'),
      api('/ai/history')
    ]);
    tasks = tList || [];
    captures = cList || [];
    chats = hList || [];
    render();
  } catch (err) {
    console.warn('Sync warning:', err.message);
  }
}

// Check session on startup
async function initSession() {
  if (token) {
    try {
      user = await api('/auth/me');
      await syncData();
    } catch (e) {
      token = null;
      localStorage.removeItem('lifeos_token');
      user = null;
    }
  }
  render();
}

/* ---------------- Auth Handlers ---------------- */
function openAuth(m) {
  authMode = m;
  renderAuthModal();
  $('#ov').style.display = 'grid';
}

function closeModal() {
  $('#ov').style.display = 'none';
}

function renderAuthModal() {
  const isSignup = authMode === 'signup';
  $('#ov').innerHTML = `
    <div class="card" style="width:min(440px, 94vw); background:#fff">
      <div class="row sp">
        <h2>${isSignup ? 'Create Your Account' : 'Welcome Back'}</h2>
        <button class="btn o s" onclick="closeModal()">✕</button>
      </div>
      <p class="mut" style="font-size:0.9em;margin-top:4px">
        ${isSignup ? 'Get your own private, clean workspace with smart AI scheduling.' : 'Access your personalized schedule and reminders.'}
      </p>
      <div class="grid" style="margin-top:16px;gap:12px">
        ${isSignup ? '<input id="reg_nm" placeholder="Full name (e.g. Alex Morgan)">' : ''}
        <input id="auth_em" type="email" placeholder="Email address (e.g. name@example.com)">
        <input id="auth_pw" type="password" placeholder="Password (min 6 characters)">
        ${isSignup ? `
          <div>
            <label class="mut" style="font-size:0.8em;font-weight:700">CHOOSE YOUR MODULE / ROLE</label>
            <select id="reg_role" style="margin-top:4px">
              ${Object.entries(MODS).map(([k, m]) => `<option value="${k}">${m.ic} ${m.n} — ${m.who}</option>`).join('')}
            </select>
          </div>
        ` : ''}
        <div id="auth_err" style="color:var(--red);font-weight:700;font-size:0.9em;min-height:1.2em"></div>
        <button class="btn" style="padding:12px" onclick="submitAuth()">
          ${isSignup ? '🚀 Create Free Account' : '👉 Log In'}
        </button>
        <p class="mut" style="text-align:center;font-size:0.9em">
          ${isSignup ? 'Already have an account?' : 'New to LifeOS AI?'}
          <a href="#" onclick="authMode='${isSignup ? 'login' : 'signup'}';renderAuthModal();return false" style="color:var(--pri);font-weight:700">
            ${isSignup ? 'Log in here' : 'Sign up now'}
          </a>
        </p>
      </div>
    </div>
  `;
}

async function submitAuth() {
  const errEl = $('#auth_err');
  errEl.textContent = '';
  const email = $('#auth_em').value.trim();
  const password = $('#auth_pw').value;

  if (!email) return (errEl.textContent = 'Please enter your email.');
  if (!password) return (errEl.textContent = 'Please enter your password.');

  try {
    if (authMode === 'signup') {
      const name = $('#reg_nm').value.trim();
      const role = $('#reg_role').value;
      if (!name) return (errEl.textContent = 'Please enter your name.');

      const res = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role })
      });
      token = res.token;
      user = res.user;
      localStorage.setItem('lifeos_token', token);
      tasks = [];
      captures = [];
      chats = [];
      closeModal();
      activeView = 'dash';
      render();
      toast(`Welcome to LifeOS, ${user.name.split(' ')[0]}!`);
    } else {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      token = res.token;
      user = res.user;
      localStorage.setItem('lifeos_token', token);
      closeModal();
      await syncData();
      activeView = 'dash';
      render();
      toast(`Welcome back, ${user.name.split(' ')[0]}!`);
    }
  } catch (err) {
    errEl.textContent = err.message;
  }
}

function logout() {
  token = null;
  user = null;
  tasks = [];
  captures = [];
  chats = [];
  localStorage.removeItem('lifeos_token');
  render();
  toast('Logged out successfully.');
}

/* ---------------- Landing View ---------------- */
function renderLanding() {
  return `
    <div class="wrap">
      <div class="row sp" style="padding:18px 0">
        <div class="logo">
          <div class="logo-badge">⚡</div>
          LifeOS AI
        </div>
        <div class="row">
          <button class="btn o s" onclick="openAuth('login')">Log In</button>
          <button class="btn s" onclick="openAuth('signup')">Get Started</button>
        </div>
      </div>

      <section class="hero grid g2" style="align-items:center;padding:40px 0 20px">
        <div>
          <h1>YOUR LIFE.<br><mark>SMARTER</mark><br>WITH AI.</h1>
          <p class="mut" style="font-size:1.15em;margin:18px 0 24px">
            Personalized operating system for <b>Students</b>, <b>Employees</b>, and <b>Senior Citizens</b>.
            Captures appointments, deadlines, and reminders from your messages, calls, and photos — automatically.
          </p>
          <div class="row" style="gap:14px">
            <button class="btn" style="padding:12px 22px;font-size:1.05em" onclick="openAuth('signup')">
              Get Started Free →
            </button>
            <button class="btn o" style="padding:12px 20px" onclick="openAuth('login')">
              Log In
            </button>
          </div>
        </div>

        <div class="card">
          <div class="row sp" style="margin-bottom:12px">
            <b>Today's Smart Schedule</b>
            <span class="pill" style="background:var(--yel)">Live Preview</span>
          </div>
          <div class="item">
            <span class="dot" style="background:var(--red)"></span>
            <span style="flex:1"><b>Doctor Consultation</b> (City Clinic)</span>
            <span class="mut">10:30 AM</span>
          </div>
          <div class="item">
            <span class="dot" style="background:var(--red)"></span>
            <span style="flex:1"><b>Project Proposal Due</b></span>
            <span class="mut">02:00 PM</span>
          </div>
          <div class="item">
            <span class="dot" style="background:var(--amb)"></span>
            <span style="flex:1"><b>Team Sync & Review</b></span>
            <span class="mut">03:30 PM</span>
          </div>
          <div class="item">
            <span class="dot" style="background:var(--grn)"></span>
            <span style="flex:1"><b>Evening Walk & Relaxation</b></span>
            <span class="mut">06:00 PM</span>
          </div>
          <p class="mut" style="font-size:0.85em;margin-top:12px">
            🤖 <b>AI Schedule Engine:</b> Sensitive OTPs are discarded. Only genuine events and reminders are scheduled.
          </p>
        </div>
      </section>

      <div class="mq">
        <div>${'STUDENTS ✶ EMPLOYEES ✶ SENIORS ✶ SMART SMS & WHATSAPP CAPTURE ✶ PHOTO SCANNING ✶ PRIVACY FIRST ✶ '.repeat(5)}</div>
      </div>

      <h2 style="margin:28px 0 16px">Choose Your Experience</h2>
      <div class="grid g3">
        ${Object.values(MODS).map(m => `
          <div class="card" style="background:${m.c};color:#000">
            <div style="font-size:2.4em">${m.ic}</div>
            <h3 style="margin:8px 0 4px">${m.n}</h3>
            <b style="font-family:var(--mono);font-size:0.9em">${m.who}</b>
            <p style="margin-top:8px">${m.d}</p>
          </div>
        `).join('')}
      </div>

      <h2 style="margin:36px 0 16px">Intelligent Core Features</h2>
      <div class="grid g4">
        ${[
          ['📲', 'Smart Message Capture', 'Reads SMS, WhatsApp notes, and missed calls with explicit permission.'],
          ['📷', 'Photo & Document Scan', 'Upload doctor cards, bills, or chat screenshots. AI extracts the date and time.'],
          ['⏰', 'Intelligent Scheduling', 'High priority events scheduled automatically; marketing promotions muted.'],
          ['🛡️', 'Privacy & Security First', 'Sensitive codes (OTPs, PINs) are scrubbed and never stored. User-isolated data.']
        ].map(x => `
          <div class="card">
            <div style="font-size:1.8em;margin-bottom:8px">${x[0]}</div>
            <b>${x[1]}</b>
            <p class="mut" style="font-size:0.9em;margin-top:6px">${x[2]}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ---------------- Main Views ---------------- */
const itemComponent = x => `
  <div class="item" style="${x.done ? 'opacity:0.5;text-decoration:line-through' : ''}">
    <span class="dot" style="background:${P[x.priority][1]}"></span>
    <span class="mut" style="min-width:80px">${x.dateOffset ? 'Tmrw ' : ''}${fmt(x.time)}</span>
    <span style="flex:1">
      <b>${esc(x.title)}</b>
      ${x.category ? `<small class="mut" style="margin-left:6px">· ${esc(x.category)}</small>` : ''}
    </span>
    <span class="pill" style="background:${P[x.priority][1]}">${P[x.priority][0]}</span>
    <button class="btn o s" onclick="toggleTask('${x._id}')">${x.done ? 'Undo' : 'Done ✓'}</button>
    <button class="btn o s" onclick="deleteTask('${x._id}')">✕</button>
  </div>
`;

const VIEWS = {
  dash() {
    const m = MODS[user.role] || MODS.spark;
    const pending = tasks.filter(x => !x.done).sort(srt);
    const today = pending.filter(x => !x.dateOffset);
    const highPri = today.filter(x => x.priority === 'h');
    const completed = tasks.filter(x => x.done).length;
    const pct = tasks.length ? Math.round((completed * 100) / tasks.length) : 0;

    const hr = new Date().getHours();
    const greeting = hr < 12 ? 'Good Morning' : hr < 17 ? 'Good Afternoon' : 'Good Evening';

    const defaultTips = {
      spark: today[0]
        ? `You have "${today[0].title}" at ${fmt(today[0].time)}. Schedule a 30-minute focus session before your next class.`
        : 'Your student schedule is clear. Use this time to revise or explore new topics!',
      prime: highPri.length
        ? `You have ${highPri.length} high-priority deadline(s) today. Tackle them before afternoon meetings.`
        : 'No urgent deadlines today. A great day to clear backlog tasks.',
      care: today[0]
        ? `Next up: ${today[0].title} at ${fmt(today[0].time)}. Remember to take water with your routine.`
        : 'All reminders for today are completed. Relax and have a pleasant day!'
    };

    const tip = tasks.length
      ? defaultTips[user.role]
      : 'Your schedule is empty. Add a task or use Smart Capture to read incoming SMS, WhatsApp messages, or photos.';

    return `
      <div class="row sp" style="flex-wrap:wrap;margin-bottom:14px">
        <div>
          <h2>${greeting}, ${esc(user.name.split(' ')[0])}!</h2>
          <p class="mut">${m.d}</p>
        </div>
      </div>

      <div class="grid g4" style="margin:16px 0">
        <div class="card">
          <div class="mut" style="font-size:0.85em">Today's Tasks</div>
          <h2 class="cnt" data-n="${today.length}" data-s="">${today.length}</h2>
        </div>
        <div class="card">
          <div class="mut" style="font-size:0.85em">High Priority</div>
          <h2 class="cnt" data-n="${highPri.length}" data-s="">${highPri.length}</h2>
        </div>
        <div class="card">
          <div class="mut" style="font-size:0.85em">Completed</div>
          <h2 class="cnt" data-n="${pct}" data-s="%">${pct}%</h2>
        </div>
        <div class="card">
          <div class="mut" style="font-size:0.85em">Smart Captures</div>
          <h2 class="cnt" data-n="${captures.length}" data-s="">${captures.length}</h2>
        </div>
      </div>

      <div class="card" style="border-left:6px solid var(--m);margin-bottom:18px">
        <div class="row sp" style="margin-bottom:6px">
          <b>🤖 AI Schedule Recommendation</b>
          <span class="pill" style="background:var(--yel)">Smart Scheduler</span>
        </div>
        <p>${esc(tip)}</p>
        <button class="btn s" style="margin-top:8px" onclick="optimizeSchedule()">⚡ Apply to My Schedule</button>
      </div>

      <div class="grid g2">
        <div class="card">
          <div class="row sp" style="margin-bottom:8px">
            <h3>Today's Schedule</h3>
            <button class="btn o s" onclick="activeView='rem';render()">＋ Add</button>
          </div>
          ${today.map(itemComponent).join('') || '<p class="mut">No tasks scheduled for today. Add one or use Smart Capture.</p>'}
        </div>
        <div class="card">
          <div class="row sp" style="margin-bottom:8px">
            <h3>Upcoming</h3>
          </div>
          ${pending.filter(x => x.dateOffset).map(itemComponent).join('') || '<p class="mut">Nothing scheduled for tomorrow yet.</p>'}
        </div>
      </div>
    `;
  },

  rem() {
    return `
      <h2>Reminders & Tasks</h2>
      <p class="mut">Add personal tasks or manage your scheduled reminders.</p>

      <div class="card" style="margin:16px 0">
        <div class="grid g4">
          <input id="rt" placeholder="What should I remind you about?" style="grid-column:1/-1">
          <div>
            <label class="mut" style="font-size:0.75em;font-weight:700">TIME</label>
            <input id="rm" type="time" value="09:00">
          </div>
          <div>
            <label class="mut" style="font-size:0.75em;font-weight:700">WHEN</label>
            <select id="rd">
              <option value="0">Today</option>
              <option value="1">Tomorrow</option>
            </select>
          </div>
          <div>
            <label class="mut" style="font-size:0.75em;font-weight:700">PRIORITY</label>
            <select id="rp">
              <option value="h">High Priority</option>
              <option value="m" selected>Medium Priority</option>
              <option value="l">Low Priority</option>
            </select>
          </div>
          <div style="display:flex;align-items:flex-end">
            <button class="btn" style="width:100%" onclick="createTask()">Add Task</button>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Active Reminders (${tasks.filter(t => !t.done).length})</h3>
        ${tasks.filter(t => !t.done).sort(srt).map(itemComponent).join('') || '<p class="mut">No active reminders. Add one above!</p>'}
      </div>
    `;
  },

  cap() {
    const permissions = user.permissions || { SMS: true, Call: true, WhatsApp: true, Photos: true, Email: true, Laptop: true };

    return `
      <h2>Smart Capture & AI Scheduling</h2>
      <p class="mut">
        LifeOS automatically extracts appointments, deadlines, and meetings from SMS, WhatsApp, Photos, and Calls.
        Sensitive codes (OTPs, PINs) are automatically discarded.
      </p>

      <div class="card" style="margin:16px 0">
        <div class="grid g2" style="align-items:center">
          <div>
            <label class="mut" style="font-size:0.75em;font-weight:700">INPUT SOURCE</label>
            <select id="cs">
              <option value="SMS" ${permissions.SMS ? '' : 'disabled'}>💬 SMS Message ${permissions.SMS ? '' : '(Disabled in Settings)'}</option>
              <option value="WhatsApp" ${permissions.WhatsApp ? '' : 'disabled'}>🟢 WhatsApp Message ${permissions.WhatsApp ? '' : '(Disabled in Settings)'}</option>
              <option value="Call" ${permissions.Call ? '' : 'disabled'}>📞 Call Note / Missed Call ${permissions.Call ? '' : '(Disabled in Settings)'}</option>
              <option value="Email" ${permissions.Email ? '' : 'disabled'}>✉️ Email Reminder ${permissions.Email ? '' : '(Disabled in Settings)'}</option>
              <option value="Laptop" ${permissions.Laptop ? '' : 'disabled'}>💻 Notes / Memo ${permissions.Laptop ? '' : '(Disabled in Settings)'}</option>
            </select>
          </div>

          <div class="row" style="flex-wrap:wrap">
            <button class="btn" onclick="captureText()">⚡ Analyze & Schedule</button>
            <button class="btn o" onclick="triggerPhotoUpload()">📷 Scan Photo</button>
            <button class="btn o" onclick="pasteClipboard()">📋 Paste</button>
            <button class="btn o" onclick="voiceInput()">🎤 Voice</button>
            <button class="btn o" onclick="simulateIncoming()">🧪 Simulate</button>
          </div>
        </div>

        <textarea id="ct" rows="3" style="margin-top:12px" placeholder="Paste or type a message, note, or call summary. E.g.: 'Dr. Sharma: Clinic appointment confirmed tomorrow at 10:30 am' or 'Project presentation due Friday at 2 pm'"></textarea>

        <!-- Hidden photo upload input -->
        <input type="file" id="photo_input" accept="image/*,.txt" style="display:none" onchange="handlePhotoUpload(this.files[0])">

        <div class="upload-zone" style="margin-top:10px" onclick="triggerPhotoUpload()">
          <b>📷 Click here to upload a Photo, Receipt, Prescription, or WhatsApp Chat (.txt)</b>
          <p class="mut" style="font-size:0.85em;margin:4px 0">AI OCR extracts dates, times, and actionable reminders automatically.</p>
        </div>
      </div>

      <div class="card">
        <div class="row sp" style="margin-bottom:8px">
          <h3>Captured Activity & Event Log</h3>
          ${captures.length ? `<button class="btn o s" onclick="clearCaptures()">Clear Log</button>` : ''}
        </div>
        ${captures.map(x => `
          <div class="item">
            <span class="pill" style="background:${x.sensitive ? 'var(--red);color:#fff' : 'var(--m)'}">${x.source}</span>
            <span style="flex:1">
              <b>${esc(x.rawText)}</b><br>
              <small class="mut">
                Category: <b>${esc(x.category || 'General')}</b> ·
                Status: <span style="font-weight:700;color:${x.status.includes('Reminder set') ? 'var(--grn)' : x.sensitive ? 'var(--red)' : 'var(--ink)'}">${esc(x.status)}</span>
              </small>
            </span>
          </div>
        `).join('') || '<p class="mut">No captured activity yet. Try typing a message or click "Simulate" to test AI scheduling!</p>'}
      </div>
    `;
  },

  ai() {
    const roleChips = {
      spark: [
        'Make a 3-day study plan for my exams',
        'Explain recursion in simple terms',
        'What should I focus on first today?'
      ],
      prime: [
        'Prioritize my deadlines today',
        'Draft a concise follow-up email',
        'What meetings do I have scheduled?'
      ],
      care: [
        'What reminders do I have today?',
        'Give me a gentle evening routine',
        'Explain my schedule in simple words'
      ]
    }[user.role] || ['What is on my schedule today?'];

    return `
      <h2>AI Assistant</h2>
      <p class="mut">Ask anything. Your assistant knows your schedule, deadlines, and tasks.</p>

      <div class="card" style="margin-top:14px">
        <div id="chat_feed" style="height:48vh;overflow-y:auto;padding-right:6px">
          ${chats.map((m, i) => `
            <div class="msg ${m.role === 'user' ? 'u' : 'a'}">
              ${esc(m.content).replace(/\n/g, '<br>')}
              ${m.actionProposal ? `
                <div style="margin-top:8px">
                  <button class="btn s" onclick="acceptAIProposal(${i})">
                    ${m.actionProposal.done ? '✓ Scheduled' : `＋ Add ${fmt(m.actionProposal.time)} · ${esc(m.actionProposal.title)}`}
                  </button>
                </div>
              ` : ''}
            </div>
          `).join('') || '<p class="mut">No conversation yet. Ask me to plan your day, summarize deadlines, or set tasks!</p>'}
          ${isThinking ? '<div class="msg a">Thinking…</div>' : ''}
        </div>

        <div class="row" style="flex-wrap:wrap;margin:12px 0 8px">
          ${roleChips.map(c => `
            <button class="btn o s" onclick="sendChatPrompt('${c}')">${c}</button>
          `).join('')}
        </div>

        <div class="row">
          <input id="chat_input" placeholder="Ask anything about your tasks, schedule, or plans..." onkeydown="if(event.key==='Enter')sendChatPrompt()">
          <button class="btn" onclick="sendChatPrompt()">Send</button>
        </div>
      </div>
    `;
  },

  not() {
    const T = ['All', 'Important', 'Scheduled', 'Low priority', 'Completed'];
    let filtered = tasks.filter(x => activeTab === 'Completed' ? x.done : !x.done);

    if (activeTab === 'Important') filtered = filtered.filter(x => x.priority === 'h');
    if (activeTab === 'Scheduled') filtered = filtered.filter(x => x.priority === 'm');
    if (activeTab === 'Low priority') filtered = filtered.filter(x => x.priority === 'l');
    filtered.sort(psrt);

    const mutedPromos = captures.filter(x => x.status && x.status.includes('Muted'));

    return `
      <h2>Notifications & Reminders</h2>
      <p class="mut">Important reminders come first. Low-priority noise is muted.</p>

      <div class="row" style="flex-wrap:wrap;margin:14px 0">
        ${T.map(t => `
          <button class="btn ${t === activeTab ? '' : 'o'} s" onclick="activeTab='${t}';render()">
            ${t === 'Important' ? 'Important 🔥' : t === 'Completed' ? 'Completed ✓' : t}
          </button>
        `).join('')}
      </div>

      <div class="card">
        ${filtered.map(itemComponent).join('') || '<p class="mut">No reminders in this category.</p>'}
      </div>

      ${(activeTab === 'All' || activeTab === 'Low priority') && mutedPromos.length ? `
        <div class="card" style="margin-top:16px;background:rgba(255,255,255,0.7)">
          <h3>↓ Muted Promotional Noise (Spam Silenced)</h3>
          <p class="mut" style="font-size:0.85em">These messages were automatically recognized as marketing and excluded from your schedule.</p>
          ${mutedPromos.map(x => `
            <div class="item mut">
              <span class="pill">${x.source}</span>
              <span style="flex:1">${esc(x.rawText)}</span>
              <small>${esc(x.status)}</small>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  },

  set() {
    const permissions = user.permissions || { SMS: true, Call: true, WhatsApp: true, Photos: true, Email: true, Laptop: true };
    const ai = user.aiSettings || { url: '', model: '', key: '' };

    return `
      <h2>Settings & Privacy</h2>
      <p class="mut">Manage data collection permissions, AI keys, and account controls.</p>

      <div class="card" style="margin:16px 0">
        <h3>Capture Permissions</h3>
        <p class="mut">LifeOS only reads channels you switch on. You are in complete control.</p>
        <div class="grid g2" style="margin-top:10px">
          ${Object.keys(permissions).map(k => `
            <label class="item" style="cursor:pointer">
              <input type="checkbox" style="width:auto" ${permissions[k] ? 'checked' : ''} onchange="togglePermission('${k}', this.checked)">
              <span><b>${k}</b> Capture</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h3>AI Connection</h3>
        <p class="mut">
          LifeOS includes built-in smart scheduling. You can optionally connect your own OpenAI-compatible endpoint or model key for custom reasoning.
        </p>
        <div class="grid g2" style="margin-top:10px">
          <input id="ai_url" placeholder="Endpoint URL (e.g. https://api.openai.com/v1/chat/completions)" value="${esc(ai.url || '')}">
          <input id="ai_model" placeholder="Model (e.g. gpt-4o-mini)" value="${esc(ai.model || '')}">
          <input id="ai_key" type="password" placeholder="API Key" style="grid-column:1/-1" value="${esc(ai.key || '')}">
        </div>
        <button class="btn s" style="margin-top:12px" onclick="saveAISettings()">Save AI Settings</button>
      </div>

      <div class="card">
        <h3>Account & Data Isolation</h3>
        <p class="mut">Logged in as: <b>${esc(user.email)}</b> (${esc(user.name)})</p>
        <div class="row" style="flex-wrap:wrap;margin-top:14px;gap:10px">
          <button class="btn o" onclick="exportData()">📥 Export My Data (JSON)</button>
          <button class="btn danger" onclick="clearAllData()">⚠️ Clear All My Data</button>
        </div>
      </div>
    `;
  }
};

/* ---------------- Render Router ---------------- */
function render() {
  if (!user) {
    document.body.className = '';
    $('#root').innerHTML = renderLanding();
    return;
  }

  const m = MODS[user.role] || MODS.spark;
  const navItems = [
    ['dash', '🏠', 'Dashboard'],
    ['rem', '⏰', 'Reminders'],
    ['cap', '📲', 'Smart Capture'],
    ['ai', '🤖', 'AI Assistant'],
    ['not', '🔔', 'Notifications'],
    ['set', '⚙️', 'Settings']
  ];

  $('#root').innerHTML = `
    <div class="app" style="--m:${m.c}">
      <aside class="side">
        <div class="logo">
          <div class="logo-badge">⚡</div>
          LifeOS AI
        </div>
        ${navItems.map(n => `
          <button class="nv ${activeView === n[0] ? 'on' : ''}" onclick="activeView='${n[0]}';render()">
            <span>${n[1]}</span> ${n[2]}
          </button>
        `).join('')}
      </aside>

      <main class="main">
        <div class="row sp" style="margin-bottom:18px;flex-wrap:wrap">
          <div>
            <b>${esc(user.name)}</b>
            <span class="pill" style="background:${m.c};margin-left:6px">${m.n} · ${m.who}</span>
          </div>
          <button class="btn o s" onclick="logout()">Log out</button>
        </div>

        ${VIEWS[activeView] ? VIEWS[activeView]() : VIEWS.dash()}
      </main>

      <button class="fab" onclick="activeView='cap';render()" aria-label="Smart Capture">📲</button>
    </div>
  `;

  // Auto-scroll chat feed
  const chatFeed = $('#chat_feed');
  if (chatFeed) chatFeed.scrollTop = chatFeed.scrollHeight;

  // Animate counters when view changes
  if (lastView !== activeView) {
    lastView = activeView;
    document.querySelectorAll('.cnt').forEach(el => {
      const target = +el.dataset.n;
      const suffix = el.dataset.s || '';
      const start = performance.now();
      function tick(now) {
        const progress = Math.min(1, (now - start) / 600);
        el.textContent = Math.round(target * progress) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }
}

/* ---------------- Action Handlers ---------------- */
// Reminders CRUD
async function createTask() {
  const title = $('#rt').value.trim();
  if (!title) return toast('Please enter a reminder title.');
  const time = $('#rm').value || '09:00';
  const dateOffset = parseInt($('#rd').value, 10) || 0;
  const priority = $('#rp').value || 'm';

  try {
    const newTask = await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, time, dateOffset, priority, source: 'You' })
    });
    tasks.push(newTask);
    render();
    toast('Reminder added to schedule.');
  } catch (err) {
    toast('Error: ' + err.message);
  }
}

async function toggleTask(id) {
  const task = tasks.find(t => t._id === id);
  if (!task) return;
  try {
    const updated = await api(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: !task.done })
    });
    task.done = updated.done;
    render();
    toast(task.done ? 'Task marked as done.' : 'Task uncompleted.');
  } catch (err) {
    toast('Error: ' + err.message);
  }
}

async function deleteTask(id) {
  try {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    tasks = tasks.filter(t => t._id !== id);
    render();
    toast('Reminder deleted.');
  } catch (err) {
    toast('Error: ' + err.message);
  }
}

// Smart Capture
async function captureText(explicitText, explicitSource) {
  const source = explicitSource || $('#cs').value;
  const text = explicitText || $('#ct').value.trim();

  if (!text) return toast('Please enter a message or note to analyze.');

  try {
    const res = await api('/captures', {
      method: 'POST',
      body: JSON.stringify({ text, source })
    });

    captures.unshift(res.capture);
    if (res.task) tasks.push(res.task);
    if ($('#ct')) $('#ct').value = '';
    render();
    toast(res.analysis.status + (res.task ? ': Added to schedule!' : ''));
  } catch (err) {
    toast(err.message);
  }
}

function triggerPhotoUpload() {
  const input = $('#photo_input');
  if (input) input.click();
}

async function handlePhotoUpload(file) {
  if (!file) return;
  const formData = new FormData();
  formData.append('photo', file);

  toast('Scanning image & extracting schedule with AI…');
  try {
    const res = await fetch('/api/captures/photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Photo analysis failed');

    captures.unshift(data.capture);
    if (data.task) tasks.push(data.task);
    render();
    toast(data.analysis.status + (data.task ? ': Reminder set!' : ''));
  } catch (err) {
    toast('Error: ' + err.message);
  }
}

function pasteClipboard() {
  if (!navigator.clipboard || !navigator.clipboard.readText) {
    return toast('Clipboard not available. Please paste manually.');
  }
  navigator.clipboard.readText()
    .then(t => {
      $('#ct').value = t;
      captureText(t);
    })
    .catch(() => toast('Allow clipboard permission or paste manually.'));
}

function voiceInput() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) return toast('Speech recognition is not supported in this browser.');
  const rec = new Speech();
  rec.lang = 'en-US';
  rec.onresult = e => {
    const text = e.results[0][0].transcript;
    $('#ct').value = text;
    captureText(text);
  };
  rec.onerror = () => toast('Voice recording ended. Try again.');
  rec.start();
  toast('Listening… Speak your reminder.');
}

const SAMPLE_MESSAGES = [
  ['SMS', 'Dr. Adams: Your appointment is confirmed tomorrow at 10:30 am at Central Health.'],
  ['Call', 'Missed call from Project Lead. Please call back at 3 pm.'],
  ['WhatsApp', 'Team: Final design proposal submission due tomorrow at 5 pm, please upload slides.'],
  ['Email', 'Your electricity bill of $42 is due tomorrow at 6 pm. Pay now to avoid late fee.'],
  ['SMS', 'FLAT 50% OFF on all sneakers! Limited time discount code SHOE50. Hurry up!'],
  ['SMS', 'Your bank verification code is 849201. Never share your OTP with anyone.']
];

function simulateIncoming() {
  const s = SAMPLE_MESSAGES[sampleIndex++ % SAMPLE_MESSAGES.length];
  captureText(s[1], s[0]);
}

// AI Assistant
async function sendChatPrompt(promptText) {
  const input = $('#chat_input');
  const q = (promptText || (input ? input.value : '')).trim();
  if (!q || isThinking) return;

  if (input) input.value = '';
  chats.push({ role: 'user', content: q });
  isThinking = true;
  render();

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
    chats.push({ role: 'assistant', content: 'Sorry, I could not complete that request.' });
  } finally {
    isThinking = false;
    render();
  }
}

async function acceptAIProposal(index) {
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
        source: 'AI'
      })
    });
    tasks.push(newTask);
    p.done = true;
    render();
    toast('Added AI recommendation to your schedule.');
  } catch (err) {
    toast('Failed to add task: ' + err.message);
  }
}

async function optimizeSchedule() {
  toast('Analyzing your schedule and role requirements…');
  try {
    const res = await api('/ai/optimize', { method: 'POST' });
    if (res.addedTask) tasks.push(res.addedTask);
    render();
    toast(res.message);
  } catch (err) {
    toast('Optimization error: ' + err.message);
  }
}

// Settings
async function togglePermission(key, value) {
  if (!user.permissions) user.permissions = {};
  user.permissions[key] = value;
  try {
    await api('/auth/settings', {
      method: 'PATCH',
      body: JSON.stringify({ permissions: user.permissions })
    });
    toast(`${key} capture permission ${value ? 'enabled' : 'disabled'}.`);
  } catch (err) {
    toast('Failed to update permission: ' + err.message);
  }
}

async function saveAISettings() {
  const url = $('#ai_url').value.trim();
  const model = $('#ai_model').value.trim();
  const key = $('#ai_key').value.trim();

  try {
    await api('/auth/settings', {
      method: 'PATCH',
      body: JSON.stringify({ aiSettings: { url, model, key } })
    });
    user.aiSettings = { url, model, key };
    toast('AI connection settings saved.');
  } catch (err) {
    toast('Failed to save AI settings: ' + err.message);
  }
}

async function clearCaptures() {
  try {
    await api('/captures', { method: 'DELETE' });
    captures = [];
    render();
    toast('Captured activity log cleared.');
  } catch (err) {
    toast('Error: ' + err.message);
  }
}

async function clearAllData() {
  if (!confirm('Are you sure you want to clear all your tasks, reminders, and capture logs? This cannot be undone.')) return;
  try {
    await Promise.all([
      api('/tasks', { method: 'DELETE' }),
      api('/captures', { method: 'DELETE' })
    ]);
    tasks = [];
    captures = [];
    render();
    toast('All your private data has been wiped.');
  } catch (err) {
    toast('Error: ' + err.message);
  }
}

function exportData() {
  const payload = {
    user: { name: user.name, email: user.email, role: user.role },
    tasks,
    captures,
    exportedAt: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lifeos_${user.role}_backup_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported successfully.');
}

// Background alarm checking for due reminders
setInterval(() => {
  if (!user || !tasks.length) return;
  const now = new Date();
  const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  tasks.forEach(t => {
    if (!t.done && !t.dateOffset && t.time === curTime && !t._notified) {
      t._notified = true;
      toast(`⏰ Reminder: ${t.title}`);
      if (window.Notification && Notification.permission === 'granted') {
        new Notification('LifeOS AI Reminder', {
          body: `${t.title} at ${fmt(t.time)}`
        });
      }
    }
  });
}, 15000);

// Android Native Bridge drain polling if running inside Android companion app
setInterval(async () => {
  if (!window.NativeBridge || !user) return;
  try {
    const raw = NativeBridge.drain();
    const items = JSON.parse(raw);
    if (Array.isArray(items) && items.length > 0) {
      const res = await api('/sync/android', {
        method: 'POST',
        body: JSON.stringify({ items })
      });
      await syncData();
    }
  } catch (e) {}
}, 4000);

// Startup Initialization
initSession();
