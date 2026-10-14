const https = require('https');
const http = require('http');

/**
 * Intelligent NLP & AI Parsing Engine for LifeOS
 */

// Sensitive pattern detector (OTPs, PINs, CVVs, passwords)
const SENSITIVE_REGEX = /\b(otp|one[- ]time password|one[- ]time code|verification code|security code|cvv|pin|login code|authorization code)\b/i;
const OTP_CODE_REGEX = /\b(?:\d{4,8})\b/;

// Noise & promotional marketing pattern detector
const PROMO_REGEX = /\b(flat \d+% off|mega sale|exclusive discount|cashback|promo code|coupon code|flash sale|limited time deal|unsubscribe|hurry up|buy 1 get 1|bogo)\b/i;

// Actionable categories & keywords
const CATEGORIES = {
  Health: /\b(doctor|dr\.|dentist|clinic|hospital|appointment|medicine|tablet|pills|dosage|checkup|therapy|surgery|physician|consultation)\b/i,
  Payment: /\b(bill|payment|electricity bill|water bill|wifi bill|broadband|rent|emi|invoice|due date|recharge|credit card bill|tuition fee)\b/i,
  Deadline: /\b(exam|assignment|quiz|submission|submit|project proposal|deadline|thesis|presentation|viva|paper due|homework)\b/i,
  Meeting: /\b(meeting|zoom|google meet|teams|standup|conference|interview|client call|sync|review|discussion|call back|missed call)\b/i
};

// Priority determination
function determinePriority(cat, text) {
  if (/\b(urgent|asap|critical|immediately|important|final reminder)\b/i.test(text)) return 'h';
  if (cat === 'Health' || cat === 'Payment' || cat === 'Deadline') return 'h';
  if (cat === 'Meeting') return 'm';
  return 'm';
}

// Helper to extract 24-hr time
function extractTime(text) {
  // e.g. 10:30 am, 3 pm, 09:00, 16:45
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? match[2].padStart(2, '0') : '00';
  const meridiem = match[3] ? match[3].toLowerCase() : null;

  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  if (hour >= 0 && hour <= 23 && parseInt(minute, 10) >= 0 && parseInt(minute, 10) <= 59) {
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }
  return null;
}

// Helper to extract date offset (0 = Today, 1 = Tomorrow, or day calculation)
function extractDateInfo(text) {
  const lower = text.toLowerCase();
  const now = new Date();

  if (lower.includes('tomorrow') || lower.includes('tmrw')) {
    const tmrw = new Date(now);
    tmrw.setDate(now.getDate() + 1);
    return {
      dateOffset: 1,
      date: tmrw.toISOString().split('T')[0]
    };
  }

  // Days of week
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const currentDay = now.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7; // next occurrence
      const target = new Date(now);
      target.setDate(now.getDate() + diff);
      return {
        dateOffset: diff,
        date: target.toISOString().split('T')[0]
      };
    }
  }

  return {
    dateOffset: 0,
    date: now.toISOString().split('T')[0]
  };
}

// Clean title from extracted message
function cleanTitle(text, cat) {
  let title = text
    .replace(/^from:.*?\n/i, '')
    .replace(/^dear .*?,/i, '')
    .replace(/^(reminder|notice|alert|update):\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If text is very long, summarize to essential sentence
  if (title.length > 60) {
    const firstSentence = title.split(/[.!?\n]/)[0].trim();
    if (firstSentence.length >= 10 && firstSentence.length <= 60) {
      title = firstSentence;
    } else {
      title = title.substring(0, 57) + '...';
    }
  }
  return title || `${cat} Reminder`;
}

/**
 * Main AI Smart Scheduling Analysis
 */
async function analyzeScheduleContent(rawText, source = 'SMS', userAISettings = null) {
  if (!rawText || !rawText.trim()) {
    return { isActionable: false, status: 'Empty content ignored' };
  }

  const text = rawText.trim();

  // 1. Privacy First: Check for sensitive codes
  if (SENSITIVE_REGEX.test(text) && (OTP_CODE_REGEX.test(text) || /\b\d{4,8}\b/.test(text))) {
    return {
      isActionable: false,
      sensitive: true,
      category: 'Security',
      status: 'Sensitive code detected and discarded — not scheduled for your safety',
      safeSummary: 'Security verification code discarded'
    };
  }

  // 2. Filter Marketing & Promotions
  if (PROMO_REGEX.test(text) && !CATEGORIES.Health.test(text) && !CATEGORIES.Payment.test(text) && !CATEGORIES.Deadline.test(text)) {
    return {
      isActionable: false,
      sensitive: false,
      category: 'Promotion',
      status: 'Muted as low priority promotion',
      safeSummary: text.substring(0, 50) + '...'
    };
  }

  // 3. Optional: Call External LLM if user provided endpoint or API key
  if (userAISettings && userAISettings.url && userAISettings.key) {
    try {
      const llmResult = await callLLMAnalyzer(text, source, userAISettings);
      if (llmResult) return llmResult;
    } catch (err) {
      console.warn('LLM smart parse failed, utilizing built-in NLP engine:', err.message);
    }
  }

  // 4. Built-in High-Accuracy NLP Engine
  let detectedCategory = 'General';
  for (const [catName, regex] of Object.entries(CATEGORIES)) {
    if (regex.test(text)) {
      detectedCategory = catName === 'Meeting' ? 'Meeting or Call' : catName;
      break;
    }
  }

  // Check if actionable
  const hasTimeOrDate = /\b(today|tomorrow|tmrw|am|pm|\d{1,2}:\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text);
  const isActionable = hasTimeOrDate || detectedCategory !== 'General' || source === 'Call';

  if (!isActionable) {
    return {
      isActionable: false,
      sensitive: false,
      category: 'General',
      status: 'No actionable scheduling information found',
      safeSummary: text.substring(0, 50)
    };
  }

  const time = extractTime(text) || (detectedCategory === 'Health' ? '10:00' : detectedCategory === 'Payment' ? '17:00' : '09:00');
  const dateInfo = extractDateInfo(text);
  const priority = determinePriority(detectedCategory, text);
  const title = cleanTitle(text, detectedCategory);

  return {
    isActionable: true,
    sensitive: false,
    category: detectedCategory,
    status: 'Reminder set',
    title,
    time,
    dateOffset: dateInfo.dateOffset,
    date: dateInfo.date,
    priority,
    source
  };
}

// Call custom or OpenAI-compatible LLM endpoint
function callLLMAnalyzer(text, source, aiSettings) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(aiSettings.url);
      const isHttps = urlObj.protocol === 'https:';
      const lib = isHttps ? https : http;

      const prompt = `Analyze this message captured from ${source} for personal life scheduling.
Respond with JSON ONLY in this exact format:
{
  "sensitive": boolean (true if contains OTP, password, or financial code),
  "isActionable": boolean (true if it represents an appointment, meeting, deadline, bill, medicine, or reminder),
  "category": "Health"|"Payment"|"Deadline"|"Meeting or Call"|"Promotion"|"General",
  "title": "short clear task title (under 50 chars)",
  "time": "HH:MM in 24hr format",
  "dateOffset": 0 (today) or 1 (tomorrow),
  "priority": "h"|"m"|"l",
  "status": "Reminder set" or "Muted as low priority promotion" or "No actionable info"
}

Message to analyze:
"${text.replace(/"/g, '\\"')}"`;

      const payload = JSON.stringify({
        model: aiSettings.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an intelligent scheduling assistant. Output valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      });

      const req = lib.request(urlObj, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiSettings.key}`,
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 6000
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            const content = data.choices[0].message.content;
            const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
            resolve(parsed);
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', err => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(payload);
      req.end();
    } catch (e) {
      resolve(null);
    }
  });
}

module.exports = {
  analyzeScheduleContent,
  extractTime,
  extractDateInfo
};
