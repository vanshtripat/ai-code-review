const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const reviewRoutes = require('./routes/reviewRoutes');

const app = express();

// Restrict CORS to the configured frontend origin(s).
// Set FRONTEND_URL in your .env file for production (supports comma-separated origins).
// Defaults to http://localhost:5173 for local development.
const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = rawFrontendUrl
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/reviews', reviewRoutes);

module.exports = app;

