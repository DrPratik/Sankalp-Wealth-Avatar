/**
 * Sankalp — Portfolio & User Routes
 * GET /api/portfolio/:userId — aggregated portfolio summary
 * GET /api/goals/:userId — goal list with progress
 * GET /api/users — list all personas
 * GET /api/users/:userId — single user profile
 */
const express = require('express');
const router = express.Router();
const ruleEngine = require('../services/ruleEngine');

// List all users (for persona selector)
router.get('/users', (req, res) => {
  const db = req.app.locals.db;
  const users = db.prepare('SELECT * FROM users').all();
  res.json(users);
});

// Get single user profile
router.get('/users/:userId', (req, res) => {
  const db = req.app.locals.db;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(parseInt(req.params.userId));
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// Get aggregated portfolio summary
router.get('/portfolio/:userId', (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const db = req.app.locals.db;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const portfolioSummary = ruleEngine.getPortfolioSummary(userId, db);
    const spendingSummary = ruleEngine.getSpendingSummary(userId, db);

    res.json({
      user: {
        name: user.name,
        age: user.age,
        riskProfile: user.risk_profile,
        city: user.city,
        monthlyIncome: user.monthly_income
      },
      portfolio: portfolioSummary,
      spending: spendingSummary
    });
  } catch (err) {
    console.error('[Portfolio] Error:', err);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

// Get goal list with progress
router.get('/goals/:userId', (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const db = req.app.locals.db;

    const goals = ruleEngine.getGoalProgress(userId, db);
    res.json(goals);
  } catch (err) {
    console.error('[Goals] Error:', err);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// Add a new goal
router.post('/goals', (req, res) => {
  try {
    const { userId, goalName, targetAmount, currentSaved, targetDate } = req.body;
    const db = req.app.locals.db;

    if (!userId || !goalName || !targetAmount || !targetDate) {
      return res.status(400).json({ error: 'userId, goalName, targetAmount, and targetDate are required' });
    }

    const result = db.prepare(
      'INSERT INTO goals (user_id, goal_name, target_amount, current_saved, target_date) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, goalName, Number(targetAmount), Number(currentSaved || 0), targetDate);

    res.json({ success: true, goalId: result.lastInsertRowid });
  } catch (err) {
    console.error('[Goals Add] Error:', err);
    res.status(500).json({ error: 'Failed to add goal' });
  }
});

// Update an existing goal
router.put('/goals/:goalId', (req, res) => {
  try {
    const goalId = parseInt(req.params.goalId);
    const { goalName, targetAmount, currentSaved, targetDate } = req.body;
    const db = req.app.locals.db;

    const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
    if (!existing) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    db.prepare(`
      UPDATE goals 
      SET goal_name = ?, target_amount = ?, current_saved = ?, target_date = ? 
      WHERE id = ?
    `).run(
      goalName !== undefined ? goalName : existing.goal_name,
      targetAmount !== undefined ? Number(targetAmount) : existing.target_amount,
      currentSaved !== undefined ? Number(currentSaved) : existing.current_saved,
      targetDate !== undefined ? targetDate : existing.target_date,
      goalId
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Goals Update] Error:', err);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// Delete a goal
router.delete('/goals/:goalId', (req, res) => {
  try {
    const goalId = parseInt(req.params.goalId);
    const db = req.app.locals.db;

    const result = db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Goals Delete] Error:', err);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

module.exports = router;
