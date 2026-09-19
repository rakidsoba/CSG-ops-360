require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./config/db');

const authRoutes = require('./routes/auth');
const guardsRoutes = require('./routes/guards');
const sitesRoutes = require('./routes/sites');
const shiftsRoutes = require('./routes/shifts');
const deploymentsRoutes = require('./routes/deployments');
const usersRoutes = require('./routes/users');
const rolesRoutes = require('./routes/roles');
const auditRoutes = require('./routes/audit');
const attendanceRoutes = require('./routes/attendance');
const healthRoutes = require('./routes/health');
const filesRoutes = require('./routes/files');
const correctionsRoutes = require('./routes/corrections');

const app = express();
const PORT = process.env.PORT || 4000;

// Security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '4mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.urlencoded({ extended: false }));

// Simple in-memory rate limit (per IP) for login
const loginAttempts = new Map();
app.use('/api/auth/login', (req, res, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  let entry = loginAttempts.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry = { count: 0, start: now };
  }
  entry.count += 1;
  loginAttempts.set(ip, entry);
  if (entry.count > 30) {
    return res.status(429).json({ error: 'Too many login attempts from this IP' });
  }
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/security-guards', guardsRoutes);
app.use('/api/client-sites', sitesRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/deployments', deploymentsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/corrections', correctionsRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await db.query('SELECT 1');
    console.log('Database connected');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    console.error('Ensure PostgreSQL is running and DATABASE_URL is correct.');
  }
  app.listen(PORT, () => {
    console.log(`CharteredOps 360 API listening on port ${PORT}`);
  });
}

start();
