const https = require('https');
const http = require('http');

/**
 * LifeOS AI — Advanced Conversational Understanding & Intent Engine
 * Understands dialogue context, mutual agreement, tentative plans, deadlines, and commitments.
 */

// Sensitive privacy scrubber (OTPs, PINs, CVVs, passwords)
const SENSITIVE_REGEX = /\b(otp|one[- ]time password|one[- ]time code|verification code|security code|cvv|pin|login code|authorization code)\b/i;
const OTP_DIGITS = /\b(?:\d{4,8})\b/;

// Promotional marketing spam detector
const PROMO_REGEX = /\b(flat \d+% off|mega sale|exclusive discount|cashback|promo code|coupon code|flash sale|limited time deal|unsubscribe|hurry up|buy 1 get 1|bogo|clearance sale)\b/i;

// Categories
const CATEGORY_MAP = {
  'Travel & Social': /\b(trip|vacation|travel|flight|train|hotel|resort|weekend getaway|camping|dinner|lunch|brunch|drinks|party|movie|concert|coffee)\b/i,
  'Health & Care': /\b(doctor|dr\.|dentist|clinic|hospital|appointment|medicine|tablet|pills|dosage|checkup|therapy|surgery|physician|consultation|prescription|vaccination)\b/i,
  'Bills & Financial': /\b(bill|payment|electricity bill|water bill|wifi bill|broadband|rent|emi|invoice|due date|recharge|credit card bill|tuition fee|installment)\b/i,
  'Academic & Deadlines': /\b(exam|assignment|quiz|submission|submit|project proposal|deadline|thesis|presentation|viva|paper due|homework|class schedule|syllabus)\b/i,
  'Work & Meetings': /\b(meeting|zoom|google meet|teams|standup|conference|interview|client call|sync|review|discussion|agenda|sprint|board meeting)\b/i
};

// Agreement patterns (positive consent in dialogue)
const AGREEMENT_REGEX = /\b(ok|okay|let's go|lets go|sure|sounds good|count me in|deal|i'm in|im in|perfect|yes|done|absolutely|agreed|confirmed)\b/i;
// Rejection patterns (refusal / decline in dialogue)
const REJECTION_REGEX = /\b(can't|cannot|busy|won't be able|sorry|no thanks|pass|reschedule|not possible|unable to attend|cancel)\b/i;
// Tentative / invitation patterns
const TENTATIVE_REGEX = /\b(let's|lets|should we|how about|maybe we can|what about|wanna|want to|thinking of|planning to|might|could we)\b/i;

function extractTime(text) {
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

function extractDateInfo(text) {
  const lower = text.toLowerCase();
  const now = new Date();

  if (lower.includes('tomorrow') || lower.includes('tmrw')) {
    const tmrw = new Date(now);
    tmrw.setDate(now.getDate() + 1);
    return { dateOffset: 1, date: tmrw.toISOString().split('T')[0], label: 'Tomorrow' };
  }

  if (lower.includes('weekend') || lower.includes('this weekend')) {
    const day = now.getDay();
    // Distance to upcoming Saturday (day 6)
    let diff = (6 - day + 7) % 7;
    if (diff === 0 && now.getHours() > 18) diff = 7; // next weekend if already late Saturday
    const sat = new Date(now);
    sat.setDate(now.getDate() + diff);
    return { dateOffset: diff, date: sat.toISOString().split('T')[0], label: 'This Weekend (Saturday)' };
  }

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const currentDay = now.getDay();
      let diff = i - currentDay;
      if (diff <= 0) diff += 7;
      const target = new Date(now);
      target.setDate(now.getDate() + diff);
      return {
        dateOffset: diff,
        date: target.toISOString().split('T')[0],
        label: days[i].charAt(0).toUpperCase() + days[i].slice(1)
      };
    }
  }

  return { dateOffset: 0, date: now.toISOString().split('T')[0], label: 'Today' };
}

function extractLocation(text) {
  const locMatch = text.match(/\b(?:at|in|on|to)\s+([A-Z][a-zA-Z0-9\s&'-]{2,30}|Zoom|Google Meet|Teams|Clinic|Hospital|Office|Starbucks|Airport)\b/);
  if (locMatch && !/^(the|a|an|my|our|today|tomorrow|am|pm|this|that|next)$/i.test(locMatch[1].trim())) {
    return locMatch[1].trim();
  }
  return null;
}

function extractParticipants(text) {
  const participants = [];
  const senderMatch = text.match(/^([a-zA-Z\s]{2,20}):/m);
  if (senderMatch) participants.push(senderMatch[1].trim());

  const withMatch = text.match(/\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (withMatch && !['You', 'Me', 'Him', 'Her', 'Them'].includes(withMatch[1])) {
    participants.push(withMatch[1]);
  }
  return [...new Set(participants)];
}

function generateTitle(text, cat, isDialogue, agreed) {
  const clean = text
    .replace(/^([a-zA-Z\s]+:)/g, '')
    .replace(/^(reminder|notice|alert|update):\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/trip/i.test(text)) return agreed ? 'Weekend Trip (Confirmed Plan)' : 'Weekend Trip Proposal';
  if (/doctor|dentist|clinic|hospital/i.test(text)) return 'Doctor / Clinic Appointment';
  if (/bill|payment|recharge/i.test(text)) return 'Bill Payment Due';
  if (/exam|quiz|submission|assignment/i.test(text)) return 'Assignment / Exam Deadline';
  if (/meeting|sync|interview|call/i.test(text)) return 'Meeting & Sync Session';

  const firstSentence = clean.split(/[.!?\n]/)[0].trim();
  if (firstSentence.length >= 8 && firstSentence.length <= 55) {
    return firstSentence;
  }
  return clean.length > 55 ? clean.substring(0, 52) + '...' : clean;
}

/**
 * Core AI Understanding Pipeline
 */
async function analyzeScheduleContent(rawText, source = 'SMS', userAISettings = null) {
  if (!rawText || !rawText.trim()) {
    return { isActionable: false, status: 'Empty content ignored' };
  }

  const text = rawText.trim();

  // 1. Privacy Safeguard: Scrub OTPs, PINs, Passwords
  if (SENSITIVE_REGEX.test(text) && (OTP_DIGITS.test(text) || /\b\d{4,8}\b/.test(text))) {
    return {
      isActionable: false,
      sensitive: true,
      category: 'Security',
      intent: 'sensitive_code',
      status: 'Security verification code detected and discarded (privacy protected)',
      safeSummary: 'Security verification code discarded'
    };
  }

  // 2. Promotional Marketing Noise Filter
  if (PROMO_REGEX.test(text) && !CATEGORY_MAP['Health & Care'].test(text) && !CATEGORY_MAP['Bills & Financial'].test(text)) {
    return {
      isActionable: false,
      sensitive: false,
      category: 'Promotion',
      intent: 'promotional_spam',
      status: 'Muted as promotional noise',
      safeSummary: text.substring(0, 50) + '...'
    };
  }

  // 3. Optional LLM reasoning if configured
  if (userAISettings && userAISettings.url && userAISettings.key) {
    try {
      const llmResult = await callLLMAnalyzer(text, source, userAISettings);
      if (llmResult) return llmResult;
    } catch (err) {
      console.warn('Custom LLM call fallback to native intelligence engine:', err.message);
    }
  }

  // 4. Conversational Understanding & Intent Parsing
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const isDialogue = lines.length > 1 || /\b(me:|you:|friend:|[a-zA-Z]+:)/i.test(text);

  let hasAgreed = false;
  let hasRejected = false;

  if (isDialogue) {
    // Look specifically at the reply line from "Me", "You", or the concluding line
    const replyLine = lines.find(l => /^(me|you):/i.test(l)) || (lines.length > 1 ? lines[lines.length - 1] : text);
    hasRejected = REJECTION_REGEX.test(replyLine);
    hasAgreed = !hasRejected && AGREEMENT_REGEX.test(replyLine);
  }

  // If the conversation was explicitly declined, do not schedule
  if (hasRejected) {
    return {
      isActionable: false,
      sensitive: false,
      intent: 'casual_conversation',
      category: 'Personal & Social',
      status: 'Plan was declined or canceled — not added to schedule',
      safeSummary: text.substring(0, 60)
    };
  }

  // Detect Category
  let detectedCategory = 'General';
  for (const [catName, regex] of Object.entries(CATEGORY_MAP)) {
    if (regex.test(text)) {
      detectedCategory = catName;
      break;
    }
  }

  // Detect Intent:
  // - 'confirmed_commitment': Formal confirmations (appointments, bills, deadlines) or mutual dialogue agreement
  // - 'tentative_plan': Suggestions or invitations requiring user confirmation
  // - 'casual_conversation': General chitchat without scheduling implications
  const isFormalEvent = /\b(confirmed|appointment|due date|deadline|exam|bill|invoice)\b/i.test(text);
  const isTentative = TENTATIVE_REGEX.test(text) && !hasAgreed;

  let intent = 'casual_conversation';
  let needsConfirmation = false;

  if (isFormalEvent || (isDialogue && hasAgreed)) {
    intent = 'confirmed_commitment';
  } else if (isTentative || (detectedCategory === 'Travel & Social' && !hasAgreed)) {
    intent = 'tentative_plan';
    needsConfirmation = true;
  } else if (source === 'Call' || detectedCategory !== 'General' || extractTime(text)) {
    intent = 'confirmed_commitment';
  }

  // If pure casual chit-chat with no time, no date, no commitment
  if (intent === 'casual_conversation' && !extractTime(text) && !/\b(today|tomorrow|weekend|due|at|pm|am)\b/i.test(text)) {
    return {
      isActionable: false,
      sensitive: false,
      intent: 'casual_conversation',
      category: detectedCategory,
      status: 'Casual conversation — no scheduled commitment needed',
      safeSummary: text.substring(0, 50)
    };
  }

  // Extract Temporal, Spatial, and Interpersonal Details
  const dateInfo = extractDateInfo(text);
  const time = extractTime(text) || (detectedCategory === 'Travel & Social' ? '10:00' : detectedCategory === 'Health & Care' ? '09:30' : detectedCategory === 'Bills & Financial' ? '17:00' : '09:00');
  const location = extractLocation(text);
  const participants = extractParticipants(text);
  const title = generateTitle(text, detectedCategory, isDialogue, hasAgreed);

  // Priority
  let priority = 'm';
  if (detectedCategory === 'Health & Care' || detectedCategory === 'Bills & Financial' || detectedCategory === 'Academic & Deadlines') {
    priority = 'h';
  } else if (intent === 'tentative_plan') {
    priority = 'm';
  }

  const status = needsConfirmation
    ? 'Potential plan detected — awaiting your confirmation'
    : 'Confirmed commitment scheduled';

  return {
    isActionable: true,
    sensitive: false,
    intent,
    needsConfirmation,
    category: detectedCategory,
    status,
    title,
    time,
    dateOffset: dateInfo.dateOffset,
    date: dateInfo.date,
    dateLabel: dateInfo.label,
    location,
    participants,
    priority,
    source,
    remindBefore: priority === 'h' ? 60 : 30 // alert 60m before for high priority
  };
}

// Custom LLM Analyzer
function callLLMAnalyzer(text, source, aiSettings) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(aiSettings.url);
      const isHttps = urlObj.protocol === 'https:';
      const lib = isHttps ? https : http;

      const prompt = `Analyze this message/dialogue for life scheduling context and intent.
Rules:
1. If the message contains passwords, OTPs, or credit card security codes, set "sensitive": true.
2. If it is marketing spam/offers, set "category": "Promotion", "isActionable": false.
3. Understand conversation intent:
   - "confirmed_commitment": user agreed ("okay let's go"), or confirmed appointment/bill/deadline.
   - "tentative_plan": a suggestion/invitation that hasn't been confirmed yet. Set "needsConfirmation": true.
   - "casual_conversation": chit-chat or declined proposals. Set "isActionable": false.
4. Extract location, participants, category, title, time (24hr), dateOffset (0 for today, 1 for tomorrow, N for days ahead).

Respond with valid JSON ONLY:
{
  "sensitive": false,
  "isActionable": true,
  "intent": "confirmed_commitment"|"tentative_plan"|"casual_conversation"|"promotional_spam",
  "needsConfirmation": boolean,
  "category": "Travel & Social"|"Health & Care"|"Bills & Financial"|"Academic & Deadlines"|"Work & Meetings"|"General",
  "title": "Clean, concise title",
  "time": "HH:MM",
  "dateOffset": 0,
  "location": "location name or null",
  "participants": ["name1"],
  "priority": "h"|"m"|"l",
  "status": "Confirmed commitment scheduled"|"Potential plan detected"
}

Text:
"${text.replace(/"/g, '\\"')}"`;

      const payload = JSON.stringify({
        model: aiSettings.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an intelligent conversation-understanding scheduler. Return valid JSON only.' },
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

      req.on('error', () => resolve(null));
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
