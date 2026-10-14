const express = require('express');
const router = express.Router();
const fs = require('fs');
const { db } = require('../services/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { analyzeScheduleContent } = require('../services/aiScheduler');
const { extractTextFromImage } = require('../services/ocrService');

router.use(authMiddleware);

// GET /api/captures - list recent captures for user
router.get('/', async (req, res) => {
  try {
    const captures = await db.captures.find({ userId: req.user.id });
    res.json(captures);
  } catch (err) {
    console.error('Error fetching captures:', err);
    res.status(500).json({ error: 'Failed to fetch captures' });
  }
});

// POST /api/captures - analyze and process SMS, WhatsApp, Call notes, Emails
router.post('/', async (req, res) => {
  try {
    const { text, source } = req.body;
    const src = source || 'SMS';

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Text content is required for capture' });
    }

    // Verify user permission settings
    const user = await db.users.findOne({ _id: req.user.id });
    const permissions = user.permissions || { SMS: true, Call: true, WhatsApp: true, Photos: true, Email: true, Laptop: true };

    if (permissions[src] === false) {
      return res.status(403).json({
        error: `${src} capture is turned off in your Settings & Privacy. Please enable it to capture from this source.`
      });
    }

    // AI Smart Scheduling Analysis
    const analysis = await analyzeScheduleContent(text.trim(), src, user.aiSettings);

    // Save capture record
    const captureRecord = await db.captures.create({
      userId: req.user.id,
      source: src,
      rawText: analysis.sensitive ? 'Sensitive code detected and discarded' : text.trim(),
      category: analysis.category || 'General',
      status: analysis.status || 'Processed',
      sensitive: Boolean(analysis.sensitive)
    });

    // If actionable and not sensitive, automatically create the schedule task
    let createdTask = null;
    if (analysis.isActionable && !analysis.sensitive) {
      createdTask = await db.tasks.create({
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

    res.status(201).json({
      capture: captureRecord,
      task: createdTask,
      analysis
    });
  } catch (err) {
    console.error('Smart capture error:', err);
    res.status(500).json({ error: 'Failed to process capture' });
  }
});

// POST /api/captures/photo - analyze photo, document, prescription, or chat screenshot
router.post('/photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an image file (JPG, PNG, or WEBP).' });
    }

    // Check Photos permission
    const user = await db.users.findOne({ _id: req.user.id });
    const permissions = user.permissions || { SMS: true, Call: true, WhatsApp: true, Photos: true, Email: true, Laptop: true };

    if (permissions.Photos === false) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({
        error: 'Photo & Document capture is turned off in your Settings & Privacy.'
      });
    }

    // Extract text from photo via OCR
    let extractedText = '';
    try {
      extractedText = await extractTextFromImage(req.file.path);
    } catch (ocrErr) {
      console.warn('OCR error:', ocrErr.message);
    }

    // Append optional note from user if provided
    const combinedText = (req.body.note ? req.body.note + ' ' : '') + (extractedText || req.file.originalname);

    // Analyze extracted text with AI Smart Scheduler
    const analysis = await analyzeScheduleContent(combinedText, 'Photo', user.aiSettings);

    const captureRecord = await db.captures.create({
      userId: req.user.id,
      source: 'Photo',
      rawText: analysis.sensitive ? 'Sensitive code detected in image and discarded' : (extractedText || 'Photo scanned: ' + req.file.originalname),
      category: analysis.category || 'General',
      status: analysis.status || 'Photo analyzed',
      sensitive: Boolean(analysis.sensitive)
    });

    let createdTask = null;
    if (analysis.isActionable && !analysis.sensitive) {
      createdTask = await db.tasks.create({
        userId: req.user.id,
        title: analysis.title || ('Photo task: ' + (analysis.category || 'Scanned Document')),
        time: analysis.time || '10:00',
        dateOffset: analysis.dateOffset || 0,
        date: analysis.date || '',
        priority: analysis.priority || 'm',
        category: analysis.category || 'General',
        source: 'Photo',
        aiGenerated: true
      });
    }

    // Clean up temporary upload
    try {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch (e) {}

    res.status(201).json({
      capture: captureRecord,
      task: createdTask,
      extractedText,
      analysis
    });
  } catch (err) {
    console.error('Photo capture error:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: 'Failed to process photo' });
  }
});

// DELETE /api/captures - clear all captures for user
router.delete('/', async (req, res) => {
  try {
    await db.captures.clearUser(req.user.id);
    res.json({ message: 'All captured items cleared' });
  } catch (err) {
    console.error('Error clearing captures:', err);
    res.status(500).json({ error: 'Failed to clear captures' });
  }
});

module.exports = router;
