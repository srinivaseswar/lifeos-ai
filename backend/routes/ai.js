const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const { db } = require('../services/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/ai/history - load user's chat messages
router.get('/history', async (req, res) => {
  try {
    const chats = await db.chats.find({ userId: req.user.id });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load chat history' });
  }
});

// Helper to shift HH:MM by minutes
function shiftTime(timeStr, minutes) {
  let [h, m] = timeStr.split(':').map(Number);
  let total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// POST /api/ai/optimize - AI Schedule Optimization
router.post('/optimize', async (req, res) => {
  try {
    const user = await db.users.findOne({ _id: req.user.id });
    const allTasks = await db.tasks.find({ userId: req.user.id, done: false });
    const todayTasks = allTasks.filter(t => !t.dateOffset).sort((a, b) => a.time.localeCompare(b.time));

    let message = 'Your schedule is already balanced and optimized.';
    let addedTask = null;

    if (user.role === 'spark') {
      const topTask = todayTasks[0];
      const hasRevision = allTasks.some(t => /revision|study/i.test(t.title));
      if (topTask && !hasRevision) {
        const revTime = shiftTime(topTask.time, -30);
        addedTask = await db.tasks.create({
          userId: req.user.id,
          title: `Revision: 30 min for ${topTask.title}`,
          time: revTime,
          dateOffset: 0,
          priority: 'm',
          category: 'Deadline',
          source: 'AI',
          aiGenerated: true
        });
        message = `Added a 30-minute revision block at ${revTime} before "${topTask.title}".`;
      } else {
        message = 'Your study plan is on track. Keep up the focus sessions!';
      }
    } else if (user.role === 'prime') {
      // Elevate any deadline to high priority
      for (const t of todayTasks) {
        if (/deadline|due|proposal|bill|client/i.test(t.title) && t.priority !== 'h') {
          await db.tasks.updateById(t._id, { priority: 'h' });
        }
      }
      const hasFollowup = allTasks.some(t => /follow-up|wrap-up/i.test(t.title));
      if (!hasFollowup) {
        const lastTask = todayTasks[todayTasks.length - 1];
        const followTime = lastTask ? shiftTime(lastTask.time, 30) : '16:30';
        addedTask = await db.tasks.create({
          userId: req.user.id,
          title: 'Daily Follow-up & Wrap-up (30 min)',
          time: followTime,
          dateOffset: 0,
          priority: 'm',
          category: 'Meeting or Call',
          source: 'AI',
          aiGenerated: true
        });
        message = `Prioritized critical deadlines and reserved a follow-up block at ${followTime}.`;
      } else {
        message = 'Deadlines verified. Your work blocks are balanced.';
      }
    } else if (user.role === 'care') {
      const hasFamilyCall = allTasks.some(t => /family|call/i.test(t.title));
      if (!hasFamilyCall) {
        addedTask = await db.tasks.create({
          userId: req.user.id,
          title: 'Call family or loved ones',
          time: '17:00',
          dateOffset: 0,
          priority: 'm',
          category: 'Health',
          source: 'AI',
          aiGenerated: true
        });
        message = 'Added a gentle reminder to call family at 5:00 PM.';
      } else {
        message = 'All health and daily routine reminders are set. Have a wonderful day!';
      }
    }

    res.json({ message, addedTask });
  } catch (err) {
    console.error('AI optimize error:', err);
    res.status(500).json({ error: 'Failed to optimize schedule' });
  }
});

// POST /api/ai/chat - AI Assistant Chat Endpoint
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const user = await db.users.findOne({ _id: req.user.id });
    const tasks = await db.tasks.find({ userId: req.user.id, done: false });
    const captures = await db.captures.find({ userId: req.user.id }, 6);

    // Save user message
    await db.chats.create({
      userId: req.user.id,
      role: 'user',
      content: message.trim()
    });

    // Schedule and captured context string
    const scheduleSummary = tasks.map(t => `- ${t.dateOffset ? 'Tomorrow' : 'Today'} ${t.time}: ${t.title} [${t.priority.toUpperCase()}]`).join('\n') || '(no active tasks)';
    const capturesSummary = captures.map(c => `- ${c.source}: ${c.rawText}`).join('\n') || '(none)';

    // Persona prompt based on role
    const persona = {
      spark: 'The user is a student or learner. Be encouraging, organized, and suggest practical study techniques and focus blocks.',
      prime: 'The user is a working professional. Be concise, direct, results-oriented, and help manage deadlines and meetings efficiently.',
      care: 'The user is a senior citizen. Use kind, simple, clear, short sentences. Focus on medicine, health, hydration, and appointments.'
    }[user.role] || 'Be helpful and concise.';

    const systemPrompt = `You are LifeOS AI, an intelligent personal operating assistant.
${persona}
Current User: ${user.name} (${user.role.toUpperCase()})
Current Schedule:
${scheduleSummary}
Recent Messages/Calls:
${capturesSummary}

Instructions:
- Provide clear, direct, and actionable advice.
- When suggesting an addition to their schedule, append a single final line in this exact format:
ADD|HH:MM|Short Title|h
(where HH:MM is 24-hr time, and the last letter is h, m, or l for priority).`;

    let replyText = null;

    // Check if user has configured custom AI or if server has default LLM
    const aiConfig = (user.aiSettings && user.aiSettings.url && user.aiSettings.key) ? user.aiSettings : (process.env.OPENAI_API_KEY ? {
      url: 'https://api.openai.com/v1/chat/completions',
      key: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    } : null);

    if (aiConfig) {
      try {
        replyText = await executeLLMChat(message, systemPrompt, aiConfig);
      } catch (llmErr) {
        console.warn('External LLM call failed, using intelligent rule generator:', llmErr.message);
      }
    }

    // High quality intelligent fallback rule generator
    if (!replyText) {
      replyText = generateIntelligentReply(message, user.role, tasks);
    }

    // Parse potential ADD command
    let actionProposal = null;
    const addMatch = replyText.match(/^\s*ADD\|(\d{1,2}:\d{2})\|([^|\n]+)\|([hml])\s*$/m);
    if (addMatch) {
      actionProposal = {
        time: addMatch[1].padStart(5, '0'),
        title: addMatch[2].trim(),
        priority: addMatch[3],
        done: false
      };
      replyText = replyText.replace(addMatch[0], '').trim();
    }

    // Save assistant reply
    await db.chats.create({
      userId: req.user.id,
      role: 'assistant',
      content: replyText,
      actionProposal
    });

    res.json({
      reply: replyText,
      actionProposal
    });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'Failed to process AI request' });
  }
});

function generateIntelligentReply(msg, role, tasks) {
  const text = msg.toLowerCase();
  const todayTasks = tasks.filter(t => !t.dateOffset).sort((a, b) => a.time.localeCompare(b.time));
  const urgentTasks = todayTasks.filter(t => t.priority === 'h');

  if (text.includes('study') || text.includes('exam') || text.includes('revision')) {
    return "Here is your study plan:\n1. Focus on your hardest topic for 45 minutes.\n2. Take a 10-minute break.\n3. Revise key formulas and practice problems.\n\nWould you like me to schedule a revision session for you?\nADD|16:00|Study & Revision Block|m";
  }

  if (text.includes('schedule') || text.includes('today') || text.includes('plan')) {
    if (todayTasks.length === 0) {
      return "Your schedule is currently clear for today! You can use this free time for learning, relaxation, or personal projects.";
    }
    const list = todayTasks.map(t => `${t.time} - ${t.title}`).join('\n');
    return `Here is your schedule for today:\n${list}\n\nStart with your highest priority task first!`;
  }

  if (text.includes('urgent') || text.includes('priority') || text.includes('deadline')) {
    if (urgentTasks.length === 0) {
      return "You have no high-priority deadlines today. Everything is running smoothly!";
    }
    return `Your top priority today is "${urgentTasks[0].title}" at ${urgentTasks[0].time}. I recommend completing this before taking on new tasks.`;
  }

  if (text.includes('health') || text.includes('medicine') || text.includes('walk')) {
    return "Health & Wellness reminder: Remember to drink water regularly, take prescribed medicines on time, and take a refreshing walk this evening!\nADD|18:00|Evening Walk & Fresh Air|l";
  }

  if (role === 'spark') {
    return "I can help you build study schedules, prepare for upcoming assignments, or summarize notes. What would you like to accomplish next?";
  }
  if (role === 'prime') {
    return "I can help streamline your daily workflow, prioritize deadlines, or organize your meetings. What task can I assist you with?";
  }
  return "I am here to help you stay organized with your daily reminders, medicine schedules, and appointments. Feel free to ask me anything!";
}

function executeLLMChat(userMessage, systemPrompt, config) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(config.url);
      const isHttps = urlObj.protocol === 'https:';
      const lib = isHttps ? https : http;

      const payload = JSON.stringify({
        model: config.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 600
      });

      const req = lib.request(urlObj, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.key}`,
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 10000
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const text = data.choices[0].message.content;
            resolve(text);
          } catch (e) {
            reject(new Error('Failed to parse AI response'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('AI Request timed out')); });
      req.write(payload);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = router;
