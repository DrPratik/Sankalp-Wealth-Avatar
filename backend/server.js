/**
 * Sankalp AI Wealth Avatar — Express Server
 * Single Node.js backend with SQLite, Gemini API integration.
 */
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { initDb } = require('./db/database');

// Load environment
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
app.use(cors());
app.use(express.json());

// ── In-Memory API Request Counter ──
const apiUsage = {
  dailyCount: 0,
  minuteCount: 0,
  minuteResetTime: Date.now(),
  dailyResetTime: Date.now(),
  totalTokensIn: 0,
  totalTokensOut: 0,

  log(tokensIn = 0, tokensOut = 0) {
    const now = Date.now();
    if (now - this.minuteResetTime > 60000) {
      this.minuteCount = 0;
      this.minuteResetTime = now;
    }
    if (now - this.dailyResetTime > 86400000) {
      this.dailyCount = 0;
      this.dailyResetTime = now;
    }
    this.minuteCount++;
    this.dailyCount++;
    this.totalTokensIn += tokensIn;
    this.totalTokensOut += tokensOut;
    console.log(`[API Usage] RPM: ${this.minuteCount}/15 | RPD: ${this.dailyCount}/500 | Tokens In: ${this.totalTokensIn} | Tokens Out: ${this.totalTokensOut}`);
    return { rpm: this.minuteCount, rpd: this.dailyCount, isRateLimited: this.minuteCount >= 14 };
  },

  getStatus() {
    return { rpm: this.minuteCount, rpd: this.dailyCount, totalTokensIn: this.totalTokensIn, totalTokensOut: this.totalTokensOut };
  }
};

app.locals.apiUsage = apiUsage;

// ── Startup ──
async function startServer() {
  try {
    const db = await initDb();
    app.locals.db = db;

    // Mount routes
    app.use('/api', require('./routes/chat'));
    app.use('/api', require('./routes/nudges'));
    app.use('/api', require('./routes/portfolio'));
    app.use('/api', require('./routes/demo'));

    app.get('/api/usage', (req, res) => res.json(apiUsage.getStatus()));
    app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

    // Error handler
    app.use((err, req, res, next) => {
      console.error('[Server] Unhandled error:', err);
      res.status(500).json({ error: 'Internal server error. Please try again.' });
    });

    const PORT = process.env.PORT || 3001;
    const server = app.listen(PORT, () => {
      console.log(`[Server] Sankalp backend running on http://localhost:${PORT}`);
      console.log(`[Server] Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ Loaded' : '❌ Missing'}`);
    });

    return server;
  } catch (err) {
    console.error('[Server] Startup failed:', err.message);
    console.error('[Server] Run "npm run seed" first to create the database.');
    throw err;
  }
}

if (require.main === module) {
  startServer().catch((err) => {
    process.exit(1);
  });
}

module.exports = { app, startServer };
