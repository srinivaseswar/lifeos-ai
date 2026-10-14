const express = require('express');
const router = express.Router();
const { db } = require('../services/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/tasks - list tasks for user
router.get('/', async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.done !== undefined) {
      query.done = req.query.done === 'true';
    }
    if (req.query.needsConfirmation !== undefined) {
      query.needsConfirmation = req.query.needsConfirmation === 'true';
    }
    const tasks = await db.tasks.find(query);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// GET /api/tasks/alerts - get smart alerts (approaching deadlines, pending confirmations, overdue)
router.get('/alerts', async (req, res) => {
  try {
    const all = await db.tasks.find({ userId: req.user.id });
    const pendingConfirmations = all.filter(t => t.needsConfirmation && !t.done);
    const urgentDeadlines = all.filter(t => !t.needsConfirmation && !t.done && t.priority === 'h');
    const todayTasks = all.filter(t => !t.needsConfirmation && !t.done && !t.dateOffset);

    res.json({
      pendingConfirmations,
      urgentDeadlines,
      todayCount: todayTasks.length,
      hasAlerts: pendingConfirmations.length > 0 || urgentDeadlines.length > 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// POST /api/tasks - create new task or reminder
router.post('/', async (req, res) => {
  try {
    const {
      title, time, dateOffset, date, dateLabel, priority, category,
      source, intent, needsConfirmation, location, participants, remindBefore
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const newTask = await db.tasks.create({
      userId: req.user.id,
      title: title.trim(),
      time: time || '09:00',
      dateOffset: Number(dateOffset) || 0,
      date: date || '',
      dateLabel: dateLabel || '',
      priority: ['h', 'm', 'l'].includes(priority) ? priority : 'm',
      category: category || 'General',
      intent: intent || 'confirmed_commitment',
      needsConfirmation: Boolean(needsConfirmation),
      location: location || null,
      participants: Array.isArray(participants) ? participants : [],
      remindBefore: Number(remindBefore) || 30,
      done: false,
      source: source || 'You',
      aiGenerated: source === 'AI' || source === 'Assistant' || source === 'Smart Capture'
    });

    res.status(201).json(newTask);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// POST /api/tasks/:id/confirm - confirm a tentative suggested plan
router.post('/:id/confirm', async (req, res) => {
  try {
    const task = await db.tasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to modify this task' });
    }

    const updated = await db.tasks.updateById(req.params.id, {
      needsConfirmation: false,
      intent: 'confirmed_commitment'
    });

    res.json({ message: 'Plan confirmed and added to calendar', task: updated });
  } catch (err) {
    console.error('Error confirming task:', err);
    res.status(500).json({ error: 'Failed to confirm plan' });
  }
});

// PATCH /api/tasks/:id - update task
router.patch('/:id', async (req, res) => {
  try {
    const task = await db.tasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to modify this task' });
    }

    const updates = {};
    if (req.body.done !== undefined) updates.done = Boolean(req.body.done);
    if (req.body.title !== undefined) updates.title = req.body.title.trim();
    if (req.body.time !== undefined) updates.time = req.body.time;
    if (req.body.priority !== undefined) updates.priority = req.body.priority;
    if (req.body.dateOffset !== undefined) updates.dateOffset = Number(req.body.dateOffset);
    if (req.body.location !== undefined) updates.location = req.body.location;
    if (req.body.needsConfirmation !== undefined) updates.needsConfirmation = Boolean(req.body.needsConfirmation);

    const updated = await db.tasks.updateById(req.params.id, updates);
    res.json(updated);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const task = await db.tasks.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to delete this task' });
    }

    await db.tasks.deleteById(req.params.id);
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

// DELETE /api/tasks (Clear all for current user)
router.delete('/', async (req, res) => {
  try {
    await db.tasks.clearUser(req.user.id);
    res.json({ message: 'All reminders cleared' });
  } catch (err) {
    console.error('Error clearing tasks:', err);
    res.status(500).json({ error: 'Failed to clear reminders' });
  }
});

module.exports = router;
