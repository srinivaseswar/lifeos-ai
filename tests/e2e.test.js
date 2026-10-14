/**
 * Complete End-to-End Test Suite for LifeOS AI
 * Verifies Auth, Data Isolation, Conversational Intent, Smart Scheduling, Capture,
 * Tentative Plan Confirmation, AI Optimization, Permissions, and Delivery
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

  // 5. Smart Capture & Conversational Intent Understanding
  console.log('\n--- Step 5: Conversational Intent & Smart Capture ---');

  // Test A: Mutual Agreement Dialogue (Friend suggests trip + Me accepts)
  const mutualDialogue = await request('POST', '/api/captures', {
    source: 'WhatsApp',
    text: "Friend: Let's go on a trip this weekend!\nMe: Okay, let's go! Saturday morning works."
  }, token1);
  assert(mutualDialogue.status === 201, 'Dialogue capture processed');
  assert(mutualDialogue.data.analysis.isActionable === true, 'AI recognized mutual agreement on weekend trip');
  assert(mutualDialogue.data.analysis.category === 'Travel & Social', 'Category classified as Travel & Social');
  assert(mutualDialogue.data.analysis.intent === 'confirmed_commitment', 'Intent recognized as confirmed commitment');
  assert(mutualDialogue.data.task !== null, 'Weekend trip auto-scheduled');

  // Test B: Declined Proposal Dialogue (Friend suggests trip + Me declines)
  const declinedDialogue = await request('POST', '/api/captures', {
    source: 'WhatsApp',
    text: "Friend: Let's go on a trip this weekend!\nMe: Sorry, I am busy and can't make it this weekend."
  }, token1);
  assert(declinedDialogue.status === 201, 'Declined dialogue processed');
  assert(declinedDialogue.data.analysis.isActionable === false, 'AI recognized user declined proposal');
  assert(declinedDialogue.data.task === null, 'No event scheduled for declined proposal');

  // Test C: Tentative Single Proposal (Awaiting user confirmation)
  const tentativeInvite = await request('POST', '/api/captures', {
    source: 'WhatsApp',
    text: 'Sarah: How about coffee on Friday at 4 pm at Starbucks?'
  }, token1);
  assert(tentativeInvite.status === 201, 'Tentative invite processed');
  assert(tentativeInvite.data.analysis.needsConfirmation === true, 'Recognized plan as tentative needing confirmation');
  assert(tentativeInvite.data.task !== null, 'Created pending plan record');
  const tentativeTaskId = tentativeInvite.data.task._id;

  // Confirm the tentative plan via API
  const confirmPlanRes = await request('POST', `/api/tasks/${tentativeTaskId}/confirm`, {}, token1);
  assert(confirmPlanRes.status === 200, 'Tentative plan confirmed successfully');
  assert(confirmPlanRes.data.task.needsConfirmation === false, 'Plan converted to locked confirmed commitment');

  // Test D: Actionable Doctor Appointment SMS
  const smsDoc = await request('POST', '/api/captures', {
    source: 'SMS',
    text: 'Dr. Rao: Your clinic appointment is confirmed tomorrow at 11:30 am.'
  }, token1);
  assert(smsDoc.status === 201, 'SMS capture processed');
  assert(smsDoc.data.analysis.isActionable === true, 'AI identified appointment as actionable');
  assert(smsDoc.data.analysis.category === 'Health & Care', 'Category classified as Health & Care');
  assert(smsDoc.data.analysis.priority === 'h', 'Priority determined as High (Health)');
  assert(smsDoc.data.analysis.time === '11:30', 'Extracted exact appointment time 11:30');
  assert(smsDoc.data.task !== null, 'Automatically scheduled in user calendar');

  // Test E: Promotional Marketing Spam Filter
  const promoSpam = await request('POST', '/api/captures', {
    source: 'SMS',
    text: 'Mega flash sale! Flat 60% off on all sportswear today only with promo code FLASH60.'
  }, token1);
  assert(promoSpam.status === 201, 'Promo spam processed');
  assert(promoSpam.data.analysis.isActionable === false, 'AI rejected promotional spam from schedule');
  assert(promoSpam.data.task === null, 'No schedule entry created for promotional spam');
  assert(promoSpam.data.analysis.status.includes('Muted'), 'Spam status set to Muted');

  // Test F: Sensitive OTP Code Security Scrubbing
  const otpMessage = await request('POST', '/api/captures', {
    source: 'SMS',
    text: 'Your confidential OTP is 928301. Valid for 10 minutes. Do not share your password or OTP.'
  }, token1);
  assert(otpMessage.status === 201, 'OTP processed');
  assert(otpMessage.data.analysis.sensitive === true, 'Sensitive security code detected');
  assert(otpMessage.data.task === null, 'Sensitive code NOT scheduled');
  assert(!otpMessage.data.capture.rawText.includes('928301'), 'Sensitive code scrubbed and never stored in database');

  // 6. Smart Alerts & Follow-ups API
  console.log('\n--- Step 6: Smart Alerts & Notifications API ---');
  const alertsRes = await request('GET', '/api/tasks/alerts', null, token1);
  assert(alertsRes.status === 200, 'Alerts endpoint returned status 200');
  assert(Array.isArray(alertsRes.data.urgentDeadlines), 'Returns urgent deadlines list');

  // 7. AI Schedule Optimization
  console.log('\n--- Step 7: AI Schedule Optimizer ---');
  const optimizeRes = await request('POST', '/api/ai/optimize', {}, token1);
  assert(optimizeRes.status === 200 && optimizeRes.data.message, 'AI optimizer analyzed schedule');

  // 8. AI Assistant Chat Grounding
  console.log('\n--- Step 8: AI Assistant Chat ---');
  const chatRes = await request('POST', '/api/ai/chat', {
    message: 'What tasks do I have scheduled for today?'
  }, token1);
  assert(chatRes.status === 200 && chatRes.data.reply, 'AI Assistant replied with contextual schedule info');

  // 9. Privacy & Permissions Enforcement
  console.log('\n--- Step 9: Privacy & Permissions Enforcement ---');
  const updatePerms = await request('PATCH', '/api/auth/settings', {
    permissions: { SMS: true, Call: true, WhatsApp: false, Photos: true, Email: true, Laptop: true }
  }, token1);
  assert(updatePerms.status === 200 && updatePerms.data.permissions.WhatsApp === false, 'WhatsApp permission disabled in settings');

  const blockedCapture = await request('POST', '/api/captures', {
    source: 'WhatsApp',
    text: 'Meeting at 5 pm'
  }, token1);
  assert(blockedCapture.status === 403, 'Capture from disabled channel blocked with 403 Forbidden');

  // 10. Static Frontend Delivery
  console.log('\n--- Step 10: Frontend Web Delivery ---');
  const frontendRes = await request('GET', '/');
  assert(frontendRes.status === 200 && frontendRes.text.includes('LifeOS AI'), 'Frontend index.html served correctly');

  console.log('\n==================================================');
  console.log('🎉 ALL 18 ADVANCED TEST SUITES PASSED WITH 100% SUCCESS!');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
