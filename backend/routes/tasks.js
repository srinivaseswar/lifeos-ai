const express = require('express');
const router = express.Router();
const { db } = require('../services/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.done !== undefined) {
      query.done = req.query.done === 'true';
    }
    const tasks = await db.tasks.find(query);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const { title, time, dateOffset, priority, category, source } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const newTask = await db.tasks.create({
      userId: req.user.id,
      title: title.trim(),
      time: time || '09:00',
      dateOffset: Number(dateOffset) || 0,
      priority: ['h', 'm', 'l'].includes(priority) ? priority : 'm',
      category: category || 'General',
      done: false,
      source: source || 'You',
      aiGenerated: source === 'AI' || source === 'Assistant'
    });

    res.status(201).json(newTask);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// PATCH /api/tasks/:id
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
