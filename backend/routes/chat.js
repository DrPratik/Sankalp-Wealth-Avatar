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

  if (['delete', 'complete', 'pause', 'resume', 'archive', 'restore'].includes(action.type)) {
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

function executeBankingAction(action, userId, db) {
  if (!action || !action.type) return null;

  try {
    switch (action.type) {
      case 'transfer': {
        const amt = Number(action.amount);
        const recipient = action.recipient || 'Recipient';
        db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
        db.prepare(
          'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Transfer\')'
        ).run(userId, `Transfer to ${recipient}`, -amt);
        console.log(`[Banking Action] Executed transfer of ₹${amt} to ${recipient}`);
        return { success: true, message: `Transferred ₹${amt.toLocaleString('en-IN')} to ${recipient} successfully.` };
      }
      
      case 'pay_bill': {
        const amt = Number(action.amount);
        const recipient = action.recipient || 'Credit Card Bill';
        db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
        db.prepare(
          'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Bills\')'
        ).run(userId, `Payment: ${recipient}`, -amt);
        console.log(`[Banking Action] Executed bill payment of ₹${amt} for ${recipient}`);
        return { success: true, message: `Paid ₹${amt.toLocaleString('en-IN')} for ${recipient} successfully.` };
      }

      case 'pay_emi': {
        const amt = Number(action.amount);
        const recipient = action.recipient || 'Loan EMI';
        db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
        db.prepare(
          'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'EMI\')'
        ).run(userId, `EMI Payment: ${recipient}`, -amt);
        console.log(`[Banking Action] Executed EMI payment of ₹${amt}`);
        return { success: true, message: `Paid EMI of ₹${amt.toLocaleString('en-IN')} successfully.` };
      }

      case 'freeze_card': {
        db.prepare("UPDATE users SET card_status = 'Frozen' WHERE id = ?").run(userId);
        console.log(`[Banking Action] Card frozen for user ${userId}`);
        return { success: true, message: 'Your debit card has been frozen successfully.' };
      }

      case 'unfreeze_card': {
        db.prepare("UPDATE users SET card_status = 'Active' WHERE id = ?").run(userId);
        console.log(`[Banking Action] Card unfrozen for user ${userId}`);
        return { success: true, message: 'Your debit card has been unfrozen successfully.' };
      }

      case 'block_card': {
        db.prepare("UPDATE users SET card_status = 'Blocked' WHERE id = ?").run(userId);
        console.log(`[Banking Action] Card blocked for user ${userId}`);
        return { success: true, message: 'Your debit card has been permanently blocked. A replacement has been ordered.' };
      }

      case 'open_fd': {
        const amt = Number(action.amount);
        const duration = action.durationMonths || 12;
        db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
        db.prepare(
          'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Investment\')'
        ).run(userId, `Opened Fixed Deposit`, -amt);
        db.prepare(
          'INSERT INTO portfolio_holdings (user_id, instrument_name, instrument_type, current_value, invested_value, category) VALUES (?, ?, \'FD\', ?, ?, \'Debt\')'
        ).run(userId, `Fixed Deposit (${duration} Months)`, amt, amt);
        console.log(`[Banking Action] Opened FD of ₹${amt} for ${duration} months`);
        return { success: true, message: `Opened a Fixed Deposit of ₹${amt.toLocaleString('en-IN')} for ${duration} months successfully.` };
      }

      case 'buy_asset': {
        const amt = Number(action.amount);
        const assetName = action.assetName || 'Mutual Fund';
        db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
        db.prepare(
          'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Investment\')'
        ).run(userId, `Invested in ${assetName}`, -amt);
        
        // Update portfolio holdings
        const existing = db.prepare('SELECT id FROM portfolio_holdings WHERE user_id = ? AND instrument_name = ?').get(userId, assetName);
        if (existing) {
          db.prepare('UPDATE portfolio_holdings SET current_value = current_value + ?, invested_value = invested_value + ? WHERE id = ?').run(amt, amt, existing.id);
        } else {
          db.prepare(
            'INSERT INTO portfolio_holdings (user_id, instrument_name, instrument_type, current_value, invested_value, category) VALUES (?, ?, \'Mutual Fund\', ?, ?, \'Equity\')'
          ).run(userId, assetName, amt, amt);
        }
        console.log(`[Banking Action] Bought asset ${assetName} for ₹${amt}`);
        return { success: true, message: `Invested ₹${amt.toLocaleString('en-IN')} in ${assetName} successfully.` };
      }

      case 'sell_asset': {
        const amt = Number(action.amount);
        const assetName = action.assetName || 'Mutual Fund';
        
        const existing = db.prepare('SELECT * FROM portfolio_holdings WHERE user_id = ? AND instrument_name = ?').get(userId, assetName);
        if (!existing || existing.current_value < amt) {
          return { success: false, error: 'Insufficient holdings to sell.' };
        }

        db.prepare('UPDATE users SET savings_balance = savings_balance + ? WHERE id = ?').run(amt, userId);
        db.prepare(
          'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Investment\')'
        ).run(userId, `Redeemed from ${assetName}`, amt);

        if (existing.current_value === amt) {
          db.prepare('DELETE FROM portfolio_holdings WHERE id = ?').run(existing.id);
        } else {
          db.prepare('UPDATE portfolio_holdings SET current_value = current_value - ?, invested_value = invested_value - ? WHERE id = ?').run(amt, amt, existing.id);
        }
        console.log(`[Banking Action] Sold asset ${assetName} for ₹${amt}`);
        return { success: true, message: `Redeemed ₹${amt.toLocaleString('en-IN')} from ${assetName} successfully.` };
      }

      default:
        return null;
    }
  } catch (err) {
    console.error('[Banking Action] Execution failed:', err);
    return { success: false, error: err.message };
  }
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
    const cashFlowForecast = ruleEngine.getCashFlowForecast ? ruleEngine.getCashFlowForecast(userId, db) : null;
    const goalConflicts = ruleEngine.getGoalConflicts ? ruleEngine.getGoalConflicts(userId, db) : null;

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
      monthChangeAnalysis,
      cashFlowForecast,
      goalConflicts
    }, apiUsage);

    // 5. Post-process for compliance
    let processedReply = complianceGuard.postProcessReply(rawReply);

    // 6. DB Sync (Process Goal Action & Banking Action)
    let goalsUpdated = false;
    let balanceUpdated = false;
    let portfolioUpdated = false;
    let actionExecuted = null;

    // 6a. Process Goal Action
    if (processedReply.goal_action && processedReply.goal_action.type) {
      const action = processedReply.goal_action;
      console.log(`[NLP Goals] Intent detected: ${action.type} for user ${userId}`);

      const validationError = validateGoalAction(action, userId, db);
      if (validationError) {
        console.warn(`[NLP Goals] Validation failed: ${validationError}`);
        processedReply.reply = `I understand you want to ${action.type} a goal, but there was a validation issue: ${validationError}`;
        processedReply.suggested_action = null;
      } else {
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
          } else if (action.type === 'pause') {
            db.prepare("UPDATE goals SET status = 'Paused' WHERE id = ?").run(action.goalId);
            actionExecuted = { type: 'pause', goalId: action.goalId };
            goalsUpdated = true;
          } else if (action.type === 'resume' || action.type === 'restore') {
            db.prepare("UPDATE goals SET status = 'Active' WHERE id = ?").run(action.goalId);
            actionExecuted = { type: 'resume', goalId: action.goalId };
            goalsUpdated = true;
          } else if (action.type === 'archive') {
            db.prepare("UPDATE goals SET status = 'Archived' WHERE id = ?").run(action.goalId);
            actionExecuted = { type: 'archive', goalId: action.goalId };
            goalsUpdated = true;
          }
        } catch (dbErr) {
          console.error('[NLP Goals] Database execution failed:', dbErr);
          processedReply.reply = `I tried to update your goals but encountered a database error.`;
        }
      }
    }

    // 6b. Process Banking Action
    if (processedReply.banking_action && processedReply.banking_action.type) {
      const bAction = processedReply.banking_action;
      
      if (bAction.isConfirmed && !bAction.confirmRequired) {
        console.log(`[NLP Banking] Executing transaction: ${bAction.type} for user ${userId}`);
        const executionResult = executeBankingAction(bAction, userId, db);
        if (executionResult && executionResult.success) {
          balanceUpdated = true;
          if (bAction.type === 'open_fd' || bAction.type === 'buy_asset' || bAction.type === 'sell_asset') {
            portfolioUpdated = true;
          }
          processedReply.reply = `${processedReply.reply}\n\n[System Notification: ${executionResult.message}]`;
          actionExecuted = { type: bAction.type, amount: bAction.amount, target: bAction.recipient || bAction.assetName };
        } else if (executionResult && !executionResult.success) {
          processedReply.reply = `I tried to complete this transaction, but encountered an issue: ${executionResult.error}`;
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
      balanceUpdated,
      portfolioUpdated,
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
      goalsUpdated: false,
      balanceUpdated: false,
      portfolioUpdated: false
    });
  }
});

module.exports = router;
