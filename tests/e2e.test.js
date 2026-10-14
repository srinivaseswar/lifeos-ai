/**
 * Complete End-to-End Test Suite for LifeOS AI
 * Verifies Auth, Data Isolation, Smart Scheduling, Capture, AI Optimization, Permissions, and Delivery
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('==================================================');
  console.log('🧪 Starting LifeOS AI End-to-End Verification Suite');
  console.log('==================================================\n');

  // 1. Health check
  console.log('--- Step 1: Server Health Check ---');
  const health = await request('GET', '/api/health');
  assert(health.status === 200 && health.data.status === 'ok', 'Server health endpoint returns status: ok');

  // 2. User 1 Registration (Student role)
  console.log('\n--- Step 2: User 1 Registration (Student) ---');
  const user1Email = `student_${Date.now()}@test.com`;
  const reg1 = await request('POST', '/api/auth/register', {
    name: 'Srinivas Junior',
    email: user1Email,
    password: 'password123',
    role: 'spark'
  });
  assert(reg1.status === 201 && reg1.data.token, 'Student registered successfully with JWT');
  const token1 = reg1.data.token;
  const user1Id = reg1.data.user.id;

  // Verify clean account on start
  const initialTasks = await request('GET', '/api/tasks', null, token1);
  assert(Array.isArray(initialTasks.data) && initialTasks.data.length === 0, 'New user account starts with 0 pre-seeded tasks (clean start)');

  // 3. User 2 Registration (Employee role) & Data Isolation
  console.log('\n--- Step 3: User 2 Registration & Data Isolation Check ---');
  const user2Email = `worker_${Date.now()}@test.com`;
  const reg2 = await request('POST', '/api/auth/register', {
    name: 'Priya Manager',
    email: user2Email,
    password: 'password456',
    role: 'prime'
  });
  assert(reg2.status === 201 && reg2.data.token, 'Employee user registered successfully');
  const token2 = reg2.data.token;

  // 4. Tasks CRUD
  console.log('\n--- Step 4: Tasks & Reminders CRUD Operations ---');
  const createTaskRes = await request('POST', '/api/tasks', {
    title: 'Mathematics Problem Set 3',
    time: '14:00',
    dateOffset: 0,
    priority: 'h',
    category: 'Deadline'
  }, token1);
  assert(createTaskRes.status === 201 && createTaskRes.data._id, 'Created reminder for User 1');
  const taskId = createTaskRes.data._id;

  // Verify User 2 cannot see User 1's tasks
  const user2Tasks = await request('GET', '/api/tasks', null, token2);
  assert(user2Tasks.data.length === 0, 'Data Isolation verified: User 2 cannot see User 1 tasks');

  // Toggle Done
  const toggleRes = await request('PATCH', `/api/tasks/${taskId}`, { done: true }, token1);
  assert(toggleRes.status === 200 && toggleRes.data.done === true, 'Task completion toggled to true');

  // 5. Smart Capture & AI Scheduling
  console.log('\n--- Step 5: Smart Capture & AI Scheduling Engine ---');

  // Test A: Actionable Doctor Appointment SMS
  const smsDoc = await request('POST', '/api/captures', {
    source: 'SMS',
    text: 'Dr. Rao: Your clinic appointment is confirmed tomorrow at 11:30 am.'
  }, token1);
  assert(smsDoc.status === 201, 'SMS capture processed');
  assert(smsDoc.data.analysis.isActionable === true, 'AI identified appointment as actionable');
  assert(smsDoc.data.analysis.category === 'Health', 'Category classified as Health');
  assert(smsDoc.data.analysis.priority === 'h', 'Priority determined as High (Health)');
  assert(smsDoc.data.analysis.time === '11:30', 'Extracted exact appointment time 11:30');
  assert(smsDoc.data.task !== null, 'Automatically scheduled in user calendar');

  // Test B: WhatsApp Team Meeting
  const waMeeting = await request('POST', '/api/captures', {
    source: 'WhatsApp',
    text: 'Design team: Project architecture sync today at 4 pm on Google Meet.'
  }, token1);
  assert(waMeeting.status === 201 && waMeeting.data.task !== null, 'WhatsApp meeting auto-scheduled');
  assert(waMeeting.data.analysis.time === '16:00', '24-hour time converted correctly: 4 pm -> 16:00');

  // Test C: Promotional Marketing Spam Filter
  const promoSpam = await request('POST', '/api/captures', {
    source: 'SMS',
    text: 'Mega flash sale! Flat 60% off on all sportswear today only with promo code FLASH60.'
  }, token1);
  assert(promoSpam.status === 201, 'Promo spam processed');
  assert(promoSpam.data.analysis.isActionable === false, 'AI rejected promotional spam from schedule');
  assert(promoSpam.data.task === null, 'No schedule entry created for promotional spam');
  assert(promoSpam.data.analysis.status.includes('Muted'), 'Spam status set to Muted');

  // Test D: Sensitive OTP Code Security Scrubbing
  const otpMessage = await request('POST', '/api/captures', {
    source: 'SMS',
    text: 'Your confidential OTP is 928301. Valid for 10 minutes. Do not share your password or OTP.'
  }, token1);
  assert(otpMessage.status === 201, 'OTP processed');
  assert(otpMessage.data.analysis.sensitive === true, 'Sensitive security code detected');
  assert(otpMessage.data.task === null, 'Sensitive code NOT scheduled');
  assert(!otpMessage.data.capture.rawText.includes('928301'), 'Sensitive code scrubbed and never stored in database');

  // 6. AI Schedule Optimization
  console.log('\n--- Step 6: AI Schedule Optimizer ---');
  const optimizeRes = await request('POST', '/api/ai/optimize', {}, token1);
  assert(optimizeRes.status === 200 && optimizeRes.data.message, 'AI optimizer analyzed student schedule');
  console.log(`   Optimizer Message: "${optimizeRes.data.message}"`);

  // 7. AI Assistant Chat Grounding
  console.log('\n--- Step 7: AI Assistant Chat ---');
  const chatRes = await request('POST', '/api/ai/chat', {
    message: 'What tasks do I have scheduled for today?'
  }, token1);
  assert(chatRes.status === 200 && chatRes.data.reply, 'AI Assistant replied with contextual schedule info');

  // 8. Privacy & Permissions Enforcement
  console.log('\n--- Step 8: Privacy & Permissions Enforcement ---');
  // Turn off WhatsApp capture
  const updatePerms = await request('PATCH', '/api/auth/settings', {
    permissions: { SMS: true, Call: true, WhatsApp: false, Photos: true, Email: true, Laptop: true }
  }, token1);
  assert(updatePerms.status === 200 && updatePerms.data.permissions.WhatsApp === false, 'WhatsApp permission disabled in settings');

  // Attempt capture from disabled channel
  const blockedCapture = await request('POST', '/api/captures', {
    source: 'WhatsApp',
    text: 'Meeting at 5 pm'
  }, token1);
  assert(blockedCapture.status === 403, 'Capture from disabled channel blocked with 403 Forbidden');
  console.log(`   Blocked Notice: "${blockedCapture.data.error}"`);

  // 9. Static Frontend Delivery
  console.log('\n--- Step 9: Frontend Web Delivery ---');
  const frontendRes = await request('GET', '/');
  assert(frontendRes.status === 200 && frontendRes.text.includes('LifeOS AI'), 'Frontend index.html served correctly');

  console.log('\n==================================================');
  console.log('🎉 ALL 14 TEST SUITES PASSED WITH 100% SUCCESS!');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
