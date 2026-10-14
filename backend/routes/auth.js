const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../services/db');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Please enter your full name.' });
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await db.users.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const validRole = ['spark', 'prime', 'care'].includes(role) ? role : 'spark';

    const newUser = await db.users.create({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      role: validRole,
      permissions: {
        SMS: true,
        Call: true,
        WhatsApp: true,
        Photos: true,
        Email: true,
        Laptop: true
      },
      aiSettings: {
        url: '',
        model: '',
        key: ''
      }
    });

    const token = jwt.sign(
      { id: newUser._id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        permissions: newUser.permissions,
        aiSettings: newUser.aiSettings
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await db.users.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions || { SMS: true, Call: true, WhatsApp: true, Photos: true, Email: true, Laptop: true },
        aiSettings: user.aiSettings || { url: '', model: '', key: '' }
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.users.findOne({ _id: req.user.id });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      aiSettings: user.aiSettings
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// PATCH /api/auth/settings
router.patch('/settings', authMiddleware, async (req, res) => {
  try {
    const updates = {};
    if (req.body.permissions) updates.permissions = req.body.permissions;
    if (req.body.aiSettings) updates.aiSettings = req.body.aiSettings;
    if (req.body.role && ['spark', 'prime', 'care'].includes(req.body.role)) updates.role = req.body.role;
    if (req.body.name && req.body.name.trim()) updates.name = req.body.name.trim();

    await db.users.updateOne({ _id: req.user.id }, updates);
    const updated = await db.users.findOne({ _id: req.user.id });

    res.json({
      id: updated._id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      permissions: updated.permissions,
      aiSettings: updated.aiSettings
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
