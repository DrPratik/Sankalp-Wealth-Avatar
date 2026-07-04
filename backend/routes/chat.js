/**
 * Sankalp — Chat Route
 * POST /api/chat
 * Full flow: fetch data → rule engine → compliance guard → Gemini call → post-process
 */
const express = require('express');
const router = express.Router();
const ruleEngine = require('../services/ruleEngine');
const complianceGuard = require('../services/complianceGuard');
const geminiClient = require('../services/geminiClient');

function parseGoalAction(message) {
  const text = (message || '').toLowerCase();
  const goalKeywords = ['goal', 'education', 'travel', 'car', 'house', 'wedding', 'retirement', 'savings', 'buy'];
  const wantsNewGoal = goalKeywords.some(keyword => text.includes(keyword));
  const hasCreateIntent = /create|add|set|make|plan/i.test(text);
  const hasGoalIntent = /goal|education|travel|car|house|wedding|retirement|savings/i.test(text);

  if (!wantsNewGoal || !hasCreateIntent || !hasGoalIntent) {
    return null;
  }

  let goalName = 'New financial goal';
  let targetAmount = 500000;
  let targetDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  if (text.includes('education') || text.includes('son') || text.includes('daughter')) {
    goalName = 'Child education';
    targetAmount = 1000000;
  } else if (text.includes('travel')) {
    goalName = 'Travel fund';
    targetAmount = 300000;
  } else if (text.includes('car')) {
    goalName = 'Car fund';
    targetAmount = 700000;
  } else if (text.includes('house')) {
    goalName = 'Home fund';
    targetAmount = 2000000;
  } else if (text.includes('retirement')) {
    goalName = 'Retirement fund';
    targetAmount = 5000000;
  } else if (text.includes('wedding')) {
    goalName = 'Wedding fund';
    targetAmount = 800000;
  }

  if (text.includes('₹') || text.includes('rs')) {
    const amountMatch = text.match(/(\d{2,7})/);
    if (amountMatch) {
      targetAmount = Number(amountMatch[1]) * 1000;
    }
  }

  return { goalName, targetAmount, targetDate };
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
    const dashboardInsights = ruleEngine.getDashboardInsights(userId, db);
    const wellnessScore = ruleEngine.getWellnessScore(userId, db);
    const nextBestActions = ruleEngine.getNextBestActions(userId, db);
    const riskAdjustedRecommendations = ruleEngine.getRiskAdjustedRecommendations(userId, db);
    const monthChangeAnalysis = ruleEngine.getMonthChangeAnalysis(userId, db);

    // 3. Generate compliance constraints
    const complianceText = complianceGuard.generateComplianceConstraints(user, portfolioSummary, db);
    const advisorCards = buildAdvisorCards(portfolioSummary, spendingSummary, goals);
    const goalAction = parseGoalAction(message);

    if (goalAction) {
      const existing = db.prepare('SELECT id FROM goals WHERE user_id = ? AND goal_name = ?').get(userId, goalAction.goalName);
      if (!existing) {
        db.prepare(`
          INSERT INTO goals (user_id, goal_name, target_amount, current_saved, target_date)
          VALUES (?, ?, ?, 0, ?)
        `).run(userId, goalAction.goalName, goalAction.targetAmount, goalAction.targetDate);
      }
    }

    // 4. Single Gemini API call
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
    const processedReply = complianceGuard.postProcessReply(rawReply);

    // 6. Send response
    const refreshedGoals = ruleEngine.getGoalProgress(userId, db);

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
      goalAction: goalAction ? { created: true, goalName: goalAction.goalName, targetAmount: goalAction.targetAmount, targetDate: goalAction.targetDate, goals: refreshedGoals } : null
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
      dashboardInsights: [],
      wellnessScore: null,
      nextBestActions: [],
      riskAdjustedRecommendations: [],
      monthChangeAnalysis: []
    });
  }
});

module.exports = router;
