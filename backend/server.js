require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { initDB } = require('./services/db');

// Global safety catch
process.on('uncaughtException', err => {
  console.warn('Caught uncaughtException in worker:', err.message);
});
process.on('unhandledRejection', reason => {
  console.warn('Caught unhandledRejection in worker:', reason ? reason.message || reason : '');
});

const authRouter = require('./routes/auth');
const tasksRouter = require('./routes/tasks');
const capturesRouter = require('./routes/captures');
const aiRouter = require('./routes/ai');
const syncRouter = require('./routes/sync');

const app = express();

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static frontend delivery
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));

// Uploads directory
const UPLOADS_DIR = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'LifeOS AI Production Server',
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/captures', capturesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/sync', syncRouter);

// SPA Fallback: All unmatched non-API routes return frontend index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Start server
const PORT = process.env.PORT || 5000;

async function start() {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(`🚀 LifeOS AI Production Server running on port ${PORT}`);
    console.log(`🌐 Local Access: http://localhost:${PORT}`);
    console.log(`===============================================`);
  });
}

start();
