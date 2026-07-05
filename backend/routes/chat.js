/**
 * Sankalp — Chat Route
 * POST /api/chat
 * Full flow: fetch data → rule engine → compliance guard → Gemini call → database sync → post-process
 */
const express = require('express');
const router = express.Router();
const ruleEngine = require('../services/ruleEngine');
const complianceGuard = require('../services/complianceGuard');
const geminiClient = require('../services/geminiClient');

function validateGoalAction(action, userId, db) {
  if (!action || !action.type) return null;

  if (action.type === 'create') {
    if (!action.goalName || action.goalName.trim() === '') {
      return 'Goal name cannot be empty.';
    }

    // Check duplicate
    const duplicate = db.prepare('SELECT id FROM goals WHERE user_id = ? AND LOWER(goal_name) = ?')
      .get(userId, action.goalName.toLowerCase().trim());
    if (duplicate) {
      return `A goal named "${action.goalName}" already exists. Please choose a different name.`;
    }

    if (action.targetAmount === undefined || Number(action.targetAmount) <= 0) {
      return 'Target amount must be a positive number.';
    }

    if (action.currentSaved !== undefined && Number(action.currentSaved) < 0) {
      return 'Current saved amount cannot be negative.';
    }

    // Date validation
    if (!action.targetDate) {
      return 'Target date is required.';
    }
    const targetDate = new Date(action.targetDate);
    if (isNaN(targetDate.getTime())) {
      return 'Invalid date format. Please use YYYY-MM-DD.';
    }
    if (targetDate <= new Date()) {
      return 'Target date must be in the future.';
    }
  }

  if (action.type === 'update') {
    if (!action.goalId) {
      return 'Goal ID is required to update.';
    }
    const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(action.goalId);
    if (!existing) {
      return 'Goal not found.';
    }
    if (action.targetAmount !== undefined && Number(action.targetAmount) <= 0) {
      return 'Target amount must be a positive number.';
    }
    if (action.currentSaved !== undefined && Number(action.currentSaved) < 0) {
      return 'Current saved amount cannot be negative.';
    }
    if (action.targetDate) {
      const targetDate = new Date(action.targetDate);
      if (isNaN(targetDate.getTime())) {
        return 'Invalid date format. Please use YYYY-MM-DD.';
      }
      if (targetDate <= new Date()) {
        return 'Target date must be in the future.';
      }
    }
  }

  if (action.type === 'delete' || action.type === 'complete') {
    if (!action.goalId) {
      return 'Goal ID is required.';
    }
    const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(action.goalId);
    if (!existing) {
      return 'Goal not found.';
    }
  }

  return null; // Valid
}

function buildAdvisorCards(portfolioSummary, spendingSummary, goals) {
  const cards = [];

  if (portfolioSummary.totalValue > 0) {
    cards.push({
      title: 'Portfolio health',
      value: `₹${portfolioSummary.totalValue.toLocaleString('en-IN')}`,
      subtitle: `${portfolioSummary.gainLossPct >= 0 ? 'Up' : 'Down'} ${Math.abs(portfolioSummary.gainLossPct).toFixed(1)}% vs invested value`,
      prompt: 'How is my portfolio performing today?'
    });
  }

  if (portfolioSummary.riskAlignment === 'misaligned') {
    cards.push({
      title: 'Risk check',
      value: 'Rebalance opportunity',
      subtitle: 'Your allocation may not match your risk profile.',
      prompt: 'Should I rebalance my portfolio?'
    });
  }

  if (spendingSummary.anomalies.length) {
    cards.push({
      title: 'Spending alert',
      value: `${spendingSummary.anomalies.length} spike detected`,
      subtitle: spendingSummary.anomalies[0],
      prompt: 'Analyze my spending'
    });
  }

  if (spendingSummary.sipStatus.status === 'missed') {
    cards.push({
      title: 'SIP reminder',
      value: 'Missed this month',
      subtitle: spendingSummary.sipStatus.message,
      prompt: 'Should I increase my SIP?'
    });
  }

  if (goals.length) {
    const nextGoal = [...goals].sort((a, b) => a.progressPct - b.progressPct)[0];
    cards.push({
      title: 'Goal plan',
      value: `${nextGoal.progressPct}% saved`,
      subtitle: `${nextGoal.goalName} • ₹${Math.max(0, nextGoal.targetAmount - nextGoal.currentSaved).toLocaleString('en-IN')} left`,
      prompt: `How can I reach my ${nextGoal.goalName} goal faster?`
    });
  }

  return cards.slice(0, 3);
}

router.post('/chat', async (req, res) => {
  try {
    const { userId, message, conversationSummary, preferredLanguage } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: 'userId and message are required' });
    }

    const db = req.app.locals.db;
    const apiUsage = req.app.locals.apiUsage;

    // 1. Fetch user profile
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2. Run rule engine calculations
    const portfolioSummary = ruleEngine.getPortfolioSummary(userId, db);
    const spendingSummary = ruleEngine.getSpendingSummary(userId, db);
    const goals = ruleEngine.getGoalProgress(userId, db);
    const dashboardInsights = ruleEngine.getDashboardInsights ? ruleEngine.getDashboardInsights(userId, db) : [];
    const wellnessScore = ruleEngine.getWellnessScore ? ruleEngine.getWellnessScore(userId, db) : null;
    const nextBestActions = ruleEngine.getNextBestActions ? ruleEngine.getNextBestActions(userId, db) : [];
    const riskAdjustedRecommendations = ruleEngine.getRiskAdjustedRecommendations ? ruleEngine.getRiskAdjustedRecommendations(userId, db) : [];
    const monthChangeAnalysis = ruleEngine.getMonthChangeAnalysis ? ruleEngine.getMonthChangeAnalysis(userId, db) : [];

    // 3. Generate compliance constraints
    const complianceText = complianceGuard.generateComplianceConstraints(user, portfolioSummary, db);
    const advisorCards = buildAdvisorCards(portfolioSummary, spendingSummary, goals);

    // 4. Gemini API call
    const rawReply = await geminiClient.chatWithSankalp({
      user,
      portfolioSummary,
      spendingSummary,
      goals,
      complianceText,
      conversationSummary: conversationSummary || '',
      userMessage: message,
      preferredLanguage: preferredLanguage || 'en',
      dashboardInsights,
      wellnessScore,
      nextBestActions,
      riskAdjustedRecommendations,
      monthChangeAnalysis
    }, apiUsage);

    // 5. Post-process for compliance
    let processedReply = complianceGuard.postProcessReply(rawReply);

    // 6. DB Sync (Process Goal Action)
    let goalsUpdated = false;
    let actionExecuted = null;

    if (processedReply.goal_action && processedReply.goal_action.type) {
      const action = processedReply.goal_action;
      console.log(`[NLP Goals] Intent detected: ${action.type} for user ${userId}`);

      // Validate Action
      const validationError = validateGoalAction(action, userId, db);
      if (validationError) {
        console.warn(`[NLP Goals] Validation failed: ${validationError}`);
        processedReply.reply = `I understand you want to ${action.type} a goal, but there was a validation issue: ${validationError}`;
        processedReply.suggested_action = null;
      } else {
        // Execute Action
        try {
          if (action.type === 'create') {
            db.prepare(
              'INSERT INTO goals (user_id, goal_name, target_amount, current_saved, target_date) VALUES (?, ?, ?, ?, ?)'
            ).run(userId, action.goalName, Number(action.targetAmount), Number(action.currentSaved || 0), action.targetDate);
            actionExecuted = { type: 'create', goalName: action.goalName };
            goalsUpdated = true;
          } else if (action.type === 'update') {
            const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(action.goalId);
            db.prepare(`
              UPDATE goals 
              SET goal_name = ?, target_amount = ?, current_saved = ?, target_date = ? 
              WHERE id = ?
            `).run(
              action.goalName !== undefined ? action.goalName : existing.goal_name,
              action.targetAmount !== undefined ? Number(action.targetAmount) : existing.target_amount,
              action.currentSaved !== undefined ? Number(action.currentSaved) : existing.current_saved,
              action.targetDate !== undefined ? action.targetDate : existing.target_date,
              action.goalId
            );
            actionExecuted = { type: 'update', goalId: action.goalId };
            goalsUpdated = true;
          } else if (action.type === 'delete') {
            db.prepare('DELETE FROM goals WHERE id = ?').run(action.goalId);
            actionExecuted = { type: 'delete', goalId: action.goalId };
            goalsUpdated = true;
          } else if (action.type === 'complete') {
            db.prepare('UPDATE goals SET current_saved = target_amount WHERE id = ?').run(action.goalId);
            actionExecuted = { type: 'complete', goalId: action.goalId };
            goalsUpdated = true;
          }
        } catch (dbErr) {
          console.error('[NLP Goals] Database execution failed:', dbErr);
          processedReply.reply = `I tried to update your goals but encountered a database error. Please try again.`;
        }
      }
    }

    const refreshedGoals = goalsUpdated ? ruleEngine.getGoalProgress(userId, db) : goals;

    res.json({
      reply: processedReply.reply || "I'm here to help! Could you rephrase that?",
      tone: processedReply.tone || 'neutral',
      suggested_action: processedReply.suggested_action || null,
      compliance_note: processedReply.compliance_note || null,
      complianceChecked: true,
      advisorCards,
      dashboardInsights,
      wellnessScore,
      nextBestActions,
      riskAdjustedRecommendations,
      monthChangeAnalysis,
      goalsUpdated,
      actionExecuted,
      goals: refreshedGoals
    });

  } catch (err) {
    console.error('[Chat] Error:', err);
    res.status(500).json({
      reply: "I'm having a moment — but your portfolio looks steady! Try asking me again.",
      tone: 'neutral',
      suggested_action: null,
      compliance_note: null,
      complianceChecked: false,
      advisorCards: [],
      goalsUpdated: false
    });
  }
});

module.exports = router;
