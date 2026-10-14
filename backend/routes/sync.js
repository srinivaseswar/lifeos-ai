const express = require('express');
const router = express.Router();
const { db } = require('../services/db');
const { authMiddleware } = require('../middleware/auth');
const { analyzeScheduleContent } = require('../services/aiScheduler');

router.use(authMiddleware);

// POST /api/sync/android - batch sync items from native Android background receiver
router.post('/android', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Array of items expected' });
    }

    const user = await db.users.findOne({ _id: req.user.id });
    const permissions = user.permissions || { SMS: true, Call: true, WhatsApp: true, Photos: true, Email: true, Laptop: true };

    const results = [];

    for (const item of items) {
      const src = item.source || item.s || 'SMS';
      const text = item.text || item.t || '';

      if (!text.trim()) continue;

      // Check permission for this source
      if (permissions[src] === false) {
        results.push({
          source: src,
          status: 'Skipped - channel disabled in privacy settings',
          actionable: false
        });
        continue;
      }

      // Analyze and parse
      const analysis = await analyzeScheduleContent(text, src, user.aiSettings);

      // Save capture
      await db.captures.create({
        userId: req.user.id,
        source: src,
        rawText: analysis.sensitive ? 'Sensitive code detected and discarded' : text,
        category: analysis.category || 'General',
        status: analysis.status || 'Synced from Android',
        sensitive: Boolean(analysis.sensitive)
      });

      // Automatically add to schedule if actionable
      let task = null;
      if (analysis.isActionable && !analysis.sensitive) {
        task = await db.tasks.create({
          userId: req.user.id,
          title: analysis.title,
          time: analysis.time || '09:00',
          dateOffset: analysis.dateOffset || 0,
          date: analysis.date || '',
          priority: analysis.priority || 'm',
          category: analysis.category || 'General',
          source: src,
          aiGenerated: true
        });
      }

      results.push({
        source: src,
        title: analysis.title,
        status: analysis.status,
        scheduled: Boolean(task)
      });
    }

    res.json({ success: true, processed: results.length, results });
  } catch (err) {
    console.error('Android sync error:', err);
    res.status(500).json({ error: 'Failed to sync Android events' });
  }
});

module.exports = router;
