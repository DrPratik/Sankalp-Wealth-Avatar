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

router.post('/chat', async (req, res) => {
  try {
    const { userId, message, conversationSummary } = req.body;

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

    // 3. Generate compliance constraints
    const complianceText = complianceGuard.generateComplianceConstraints(user, portfolioSummary, db);

    // 4. Single Gemini API call
    const rawReply = await geminiClient.chatWithSankalp({
      user,
      portfolioSummary,
      spendingSummary,
      goals,
      complianceText,
      conversationSummary: conversationSummary || '',
      userMessage: message
    }, apiUsage);

    // 5. Post-process for compliance
    const processedReply = complianceGuard.postProcessReply(rawReply);

    // 6. Send response
    res.json({
      reply: processedReply.reply || "I'm here to help! Could you rephrase that?",
      tone: processedReply.tone || 'neutral',
      suggested_action: processedReply.suggested_action || null,
      compliance_note: processedReply.compliance_note || null,
      complianceChecked: true
    });

  } catch (err) {
    console.error('[Chat] Error:', err);
    res.status(500).json({
      reply: "I'm having a moment — but your portfolio looks steady! Try asking me again.",
      tone: 'neutral',
      suggested_action: null,
      compliance_note: null,
      complianceChecked: false
    });
  }
});

module.exports = router;
