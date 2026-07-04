/**
 * Sankalp — Demo Controls Route
 * PUT /api/demo/:userId — live data editor for demo presentations
 * Updates SQLite data and re-runs trigger detector.
 */
const express = require('express');
const router = express.Router();
const triggerDetector = require('../services/triggerDetector');
const complianceGuard = require('../services/complianceGuard');
const geminiClient = require('../services/geminiClient');

router.put('/demo/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const db = req.app.locals.db;
    const apiUsage = req.app.locals.apiUsage;
    const updates = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update user fields
    if (updates.monthly_income !== undefined) {
      db.prepare('UPDATE users SET monthly_income = ? WHERE id = ?').run(updates.monthly_income, userId);
    }
    if (updates.risk_profile !== undefined) {
      db.prepare('UPDATE users SET risk_profile = ? WHERE id = ?').run(updates.risk_profile, userId);
    }

    // Update savings balance by adjusting transactions
    if (updates.savings_balance !== undefined) {
      // Remove any previous demo balance adjustment
      db.prepare("DELETE FROM transactions WHERE user_id = ? AND description = 'Demo Balance Adjustment'").run(userId);
      // Insert adjustment transaction
      const currentBalance = db.prepare('SELECT SUM(amount) as bal FROM transactions WHERE user_id = ?').get(userId);
      const currentBal = currentBalance?.bal || 0;
      const adjustment = updates.savings_balance - currentBal;
      if (adjustment !== 0) {
        const today = new Date().toISOString().split('T')[0];
        db.prepare('INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, ?, ?, ?, ?)')
          .run(userId, today, 'Demo Balance Adjustment', adjustment, 'Salary');
      }
    }

    // Update portfolio holdings
    if (updates.holdings && Array.isArray(updates.holdings)) {
      for (const h of updates.holdings) {
        if (h.id && h.current_value !== undefined) {
          db.prepare('UPDATE portfolio_holdings SET current_value = ? WHERE id = ? AND user_id = ?')
            .run(h.current_value, h.id, userId);
        }
      }
    }

    // Update goals
    if (updates.goals && Array.isArray(updates.goals)) {
      for (const g of updates.goals) {
        if (g.id) {
          if (g.current_saved !== undefined) {
            db.prepare('UPDATE goals SET current_saved = ? WHERE id = ? AND user_id = ?')
              .run(g.current_saved, g.id, userId);
          }
          if (g.target_amount !== undefined) {
            db.prepare('UPDATE goals SET target_amount = ? WHERE id = ? AND user_id = ?')
              .run(g.target_amount, g.id, userId);
          }
        }
      }
    }

    // Simulate missed SIP toggle
    if (updates.simulate_missed_sip === true) {
      // Remove current month SIP transactions
      const currentMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      db.prepare("DELETE FROM transactions WHERE user_id = ? AND category = 'SIP' AND date >= ?")
        .run(userId, currentMonthStart);
    }

    // Simulate spending spike toggle
    if (updates.simulate_spending_spike === true) {
      const spikeCat = updates.spike_category || 'Food & Dining';
      const today = new Date().toISOString().split('T')[0];
      // Add extra spending transactions
      db.prepare('INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, ?, ?, ?, ?)')
        .run(userId, today, `Demo Spike - ${spikeCat}`, -8000, spikeCat);
      db.prepare('INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, ?, ?, ?, ?)')
        .run(userId, today, `Demo Spike - ${spikeCat}`, -5000, spikeCat);
    }

    // Re-run trigger detector with updated data
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    const triggers = triggerDetector.detectTriggers(userId, db);

    // Generate fresh nudges if triggers found
    let nudges = [];
    if (triggers.length > 0) {
      const complianceText = complianceGuard.generateComplianceConstraints(updatedUser, {}, db);
      nudges = await geminiClient.generateNudges(triggers, updatedUser, complianceText, apiUsage);
      nudges = nudges
        .filter(n => complianceGuard.validateNudge(n, updatedUser))
        .map((n, i) => ({
          id: Date.now() + i,
          trigger_type: n.trigger_type || triggers[i]?.trigger_type || 'general',
          headline: n.headline || 'Update',
          body: n.body || 'Check your portfolio.',
          cta_label: n.cta_label || 'View',
          compliance_note: n.compliance_note || null
        }));
    }

    res.json({
      success: true,
      message: 'Demo data updated successfully',
      triggersDetected: triggers.length,
      nudges
    });

  } catch (err) {
    console.error('[Demo] Error:', err);
    res.status(500).json({ error: 'Failed to update demo data' });
  }
});

module.exports = router;
