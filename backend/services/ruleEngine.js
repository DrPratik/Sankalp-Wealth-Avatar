/**
 * Sankalp — Rule Engine
 * Pure JavaScript financial calculations. No LLM calls.
 * Provides portfolio analysis, spending summaries, and goal progress.
 */

/**
 * Get aggregated portfolio summary for a user.
 * Returns: { totalValue, investedValue, gainLoss, gainLossPct, allocation, riskAlignment }
 */
function getPortfolioSummary(userId, db) {
  const holdings = db.prepare('SELECT * FROM portfolio_holdings WHERE user_id = ?').all(userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (!holdings.length) {
    return {
      totalValue: 0,
      investedValue: 0,
      gainLoss: 0,
      gainLossPct: 0,
      allocation: { Equity: 0, Debt: 0, Hybrid: 0, Gold: 0 },
      allocationPct: { Equity: 0, Debt: 0, Hybrid: 0, Gold: 0 },
      riskAlignment: 'aligned',
      holdingsCount: 0
    };
  }

  let totalValue = 0;
  let investedValue = 0;
  const allocation = { Equity: 0, Debt: 0, Hybrid: 0, Gold: 0 };

  for (const h of holdings) {
    totalValue += h.current_value;
    investedValue += h.invested_value;
    allocation[h.category] = (allocation[h.category] || 0) + h.current_value;
  }

  const gainLoss = totalValue - investedValue;
  const gainLossPct = investedValue > 0 ? ((gainLoss / investedValue) * 100).toFixed(1) : 0;

  // Calculate allocation percentages
  const allocationPct = {};
  for (const [cat, val] of Object.entries(allocation)) {
    allocationPct[cat] = totalValue > 0 ? Math.round((val / totalValue) * 100) : 0;
  }

  // Risk alignment check
  const riskAlignment = checkRiskAlignment(user.risk_profile, allocationPct);

  return {
    totalValue,
    investedValue,
    gainLoss,
    gainLossPct: parseFloat(gainLossPct),
    allocation,
    allocationPct,
    riskAlignment,
    holdingsCount: holdings.length,
    holdings
  };
}

/**
 * Check if current allocation matches stated risk profile.
 */
function checkRiskAlignment(riskProfile, allocationPct) {
  const equityExposure = (allocationPct.Equity || 0) + (allocationPct.Hybrid || 0) * 0.5;

  switch (riskProfile) {
    case 'Conservative':
      // Should have < 30% equity exposure
      return equityExposure <= 30 ? 'aligned' : 'misaligned';
    case 'Moderate':
      // Should have 30-70% equity exposure
      return equityExposure >= 25 && equityExposure <= 75 ? 'aligned' : 'misaligned';
    case 'Aggressive':
      // Should have > 50% equity exposure
      return equityExposure >= 40 ? 'aligned' : 'misaligned';
    default:
      return 'unknown';
  }
}

/**
 * Get spending summary — current month vs 3-month average, by category.
 * Returns: { categories: [{name, currentMonth, avg3Month, changePct}], totalCurrentMonth, anomalies: [string] }
 */
function getSpendingSummary(userId, db) {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  
  // Get current month debits (negative amounts)
  const currentMonthTxns = db.prepare(`
    SELECT category, SUM(ABS(amount)) as total 
    FROM transactions 
    WHERE user_id = ? AND amount < 0 AND date >= ? AND category != 'SIP'
    GROUP BY category
  `).all(userId, currentMonthStart);

  // Get previous 3 months debits
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0];
  const prevMonthsTxns = db.prepare(`
    SELECT category, SUM(ABS(amount)) as total, COUNT(DISTINCT strftime('%Y-%m', date)) as months
    FROM transactions 
    WHERE user_id = ? AND amount < 0 AND date >= ? AND date < ? AND category != 'SIP'
    GROUP BY category
  `).all(userId, threeMonthsAgo, currentMonthStart);

  // Build category map
  const prevAvgMap = {};
  for (const row of prevMonthsTxns) {
    prevAvgMap[row.category] = row.months > 0 ? row.total / row.months : row.total;
  }

  const categories = [];
  const anomalies = [];
  let totalCurrentMonth = 0;

  for (const row of currentMonthTxns) {
    const avg = prevAvgMap[row.category] || 0;
    const changePct = avg > 0 ? Math.round(((row.total - avg) / avg) * 100) : 0;
    
    categories.push({
      name: row.category,
      currentMonth: Math.round(row.total),
      avg3Month: Math.round(avg),
      changePct
    });

    totalCurrentMonth += row.total;

    // Detect anomalies (>30% spike)
    if (changePct > 30 && avg > 0) {
      anomalies.push(`${row.category} spending is up ${changePct}% this month (₹${Math.round(row.total).toLocaleString('en-IN')} vs avg ₹${Math.round(avg).toLocaleString('en-IN')})`);
    }
  }

  // Check SIP status
  const sipStatus = getSIPStatus(userId, db);

  return {
    categories,
    totalCurrentMonth: Math.round(totalCurrentMonth),
    anomalies,
    sipStatus
  };
}

/**
 * Check SIP payment status for current month.
 */
function getSIPStatus(userId, db) {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];

  // Check if user had SIPs last month
  const lastMonthSIPs = db.prepare(`
    SELECT COUNT(*) as count, SUM(ABS(amount)) as total
    FROM transactions 
    WHERE user_id = ? AND category = 'SIP' AND date >= ? AND date < ?
  `).get(userId, prevMonthStart, currentMonthStart);

  // Check if user has SIPs this month
  const thisMonthSIPs = db.prepare(`
    SELECT COUNT(*) as count, SUM(ABS(amount)) as total
    FROM transactions 
    WHERE user_id = ? AND category = 'SIP' AND date >= ?
  `).get(userId, currentMonthStart);

  if (lastMonthSIPs.count > 0 && thisMonthSIPs.count === 0) {
    return {
      status: 'missed',
      lastMonthAmount: lastMonthSIPs.total,
      message: `SIP of ₹${lastMonthSIPs.total.toLocaleString('en-IN')} was not debited this month`
    };
  }

  if (thisMonthSIPs.count > 0) {
    return {
      status: 'active',
      thisMonthAmount: thisMonthSIPs.total,
      message: `SIP of ₹${thisMonthSIPs.total.toLocaleString('en-IN')} successfully debited this month`
    };
  }

  return { status: 'none', message: 'No active SIPs detected' };
}

/**
 * Get goal progress for a user.
 * Returns array of goals with progress calculations.
 */
function getGoalProgress(userId, db) {
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(userId);

  return goals.map(goal => {
    const progressPct = goal.target_amount > 0 
      ? Math.round((goal.current_saved / goal.target_amount) * 100) 
      : 0;

    // Calculate if on track
    const now = new Date();
    const targetDate = new Date(goal.target_date);
    const monthsRemaining = Math.max(1, (targetDate - now) / (1000 * 60 * 60 * 24 * 30));
    const amountRemaining = goal.target_amount - goal.current_saved;
    const monthlyRequired = amountRemaining > 0 ? Math.round(amountRemaining / monthsRemaining) : 0;

    return {
      id: goal.id,
      goalName: goal.goal_name,
      targetAmount: goal.target_amount,
      currentSaved: goal.current_saved,
      targetDate: goal.target_date,
      progressPct,
      monthsRemaining: Math.round(monthsRemaining),
      monthlyRequired,
      isOnTrack: progressPct >= (100 - (monthsRemaining / (monthsRemaining + 1) * 100)), // Simplified heuristic
      isMilestoneHit: progressPct >= 50
    };
  });
}

/**
 * Get estimated savings account balance.
 * Sums all transactions to estimate current balance.
 */
function getEstimatedBalance(userId, db) {
  const result = db.prepare(`
    SELECT SUM(amount) as balance FROM transactions WHERE user_id = ?
  `).get(userId);
  return result?.balance || 0;
}

function getDashboardInsights(userId, db) {
  const portfolioSummary = getPortfolioSummary(userId, db);
  const spendingSummary = getSpendingSummary(userId, db);
  const goals = getGoalProgress(userId, db);
  const idleBalance = getIdleBalanceDays(userId, db);

  const insights = [];

  if (portfolioSummary.totalValue > 0) {
    insights.push({
      title: 'Portfolio value',
      value: `₹${portfolioSummary.totalValue.toLocaleString('en-IN')}`,
      hint: `${portfolioSummary.gainLossPct >= 0 ? 'Gain' : 'Drop'} ${Math.abs(portfolioSummary.gainLossPct).toFixed(1)}%`
    });
  }

  if (spendingSummary.anomalies.length) {
    insights.push({
      title: 'Spending spike',
      value: `${spendingSummary.anomalies.length} category`,
      hint: spendingSummary.anomalies[0]
    });
  }

  if (goals.length) {
    const nextGoal = [...goals].sort((a, b) => a.progressPct - b.progressPct)[0];
    insights.push({
      title: 'Goal progress',
      value: `${nextGoal.progressPct}%`,
      hint: nextGoal.goalName
    });
  }

  insights.push({
    title: 'Cash buffer',
    value: `₹${Math.max(0, idleBalance.balance).toLocaleString('en-IN')}`,
    hint: `${idleBalance.idleDays} days since major spending`
  });

  return insights.slice(0, 4);
}

function getWellnessScore(userId, db) {
  const portfolioSummary = getPortfolioSummary(userId, db);
  const spendingSummary = getSpendingSummary(userId, db);
  const goals = getGoalProgress(userId, db);
  const idleBalance = getIdleBalanceDays(userId, db);

  let score = 70;

  if (portfolioSummary.riskAlignment === 'aligned') score += 8;
  if (spendingSummary.anomalies.length === 0) score += 8;
  if (goals.some(goal => goal.progressPct >= 50)) score += 7;
  if (idleBalance.balance > 0) score += 5;

  const clampedScore = Math.max(45, Math.min(95, score));
  let label = 'Steady';
  if (clampedScore >= 85) label = 'Excellent';
  else if (clampedScore >= 70) label = 'Healthy';
  else if (clampedScore >= 55) label = 'Needs attention';

  return { score: clampedScore, label };
}

function getNextBestActions(userId, db) {
  const spendingSummary = getSpendingSummary(userId, db);
  const goals = getGoalProgress(userId, db);
  const portfolioSummary = getPortfolioSummary(userId, db);
  const actions = [];

  if (spendingSummary.anomalies.length) {
    actions.push({ title: 'Review spending', detail: 'A category spike needs attention this month.' });
  }

  if (goals.length) {
    const laggingGoal = [...goals].sort((a, b) => a.progressPct - b.progressPct)[0];
    if (laggingGoal.progressPct < 50) {
      actions.push({ title: 'Boost goal progress', detail: `Increase contributions for ${laggingGoal.goalName}.` });
    }
  }

  if (portfolioSummary.riskAlignment === 'misaligned') {
    actions.push({ title: 'Risk alignment', detail: 'Revisit your allocation for better alignment.' });
  }

  if (!actions.length) {
    actions.push({ title: 'Keep momentum', detail: 'Your plan is on track — keep your routine steady.' });
  }

  return actions.slice(0, 3);
}

function getRiskAdjustedRecommendations(userId, db) {
  const portfolioSummary = getPortfolioSummary(userId, db);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const recommendations = [];

  if (!user) return recommendations;

  if (user.risk_profile === 'Conservative') {
    recommendations.push({ title: 'Low-volatility tilt', detail: 'Focus on debt and stable allocations.' });
  } else if (user.risk_profile === 'Moderate') {
    recommendations.push({ title: 'Balanced growth', detail: 'Maintain a mixed approach with periodic reviews.' });
  } else {
    recommendations.push({ title: 'Growth-oriented mix', detail: 'Keep a disciplined long-term outlook.' });
  }

  if (portfolioSummary.gainLossPct < 0) {
    recommendations.push({ title: 'Review drawdown', detail: 'Watch short-term volatility and rebalance if needed.' });
  }

  return recommendations.slice(0, 2);
}

function getMonthChangeAnalysis(userId, db) {
  const spendingSummary = getSpendingSummary(userId, db);
  const goals = getGoalProgress(userId, db);
  const changeItems = [];

  if (spendingSummary.categories.length) {
    const topCategory = spendingSummary.categories.sort((a, b) => b.changePct - a.changePct)[0];
    if (topCategory) {
      changeItems.push({ title: 'Spending change', detail: `${topCategory.name} changed by ${topCategory.changePct > 0 ? '+' : ''}${topCategory.changePct}%` });
    }
  }

  if (goals.length) {
    const mostProgressed = [...goals].sort((a, b) => b.progressPct - a.progressPct)[0];
    changeItems.push({ title: 'Goal momentum', detail: `${mostProgressed.goalName} is ${mostProgressed.progressPct}% complete` });
  }

  if (!changeItems.length) {
    changeItems.push({ title: 'No major changes', detail: 'Your pattern looks stable this month.' });
  }

  return changeItems.slice(0, 2);
}

/**
 * Get the number of days since last significant activity (non-salary credit > ₹10,000).
 */
function getIdleBalanceDays(userId, db) {
  const now = new Date();
  
  // Get the balance estimate
  const balance = getEstimatedBalance(userId, db);
  
  // Get last non-salary, non-SIP debit transaction
  const lastActivity = db.prepare(`
    SELECT date FROM transactions 
    WHERE user_id = ? AND amount < 0 AND ABS(amount) > 10000 AND category NOT IN ('Salary', 'SIP')
    ORDER BY date DESC LIMIT 1
  `).get(userId);

  if (!lastActivity) {
    return { balance: Math.round(balance), idleDays: 60 }; // Default if no large debits found
  }

  const lastDate = new Date(lastActivity.date);
  const idleDays = Math.round((now - lastDate) / (1000 * 60 * 60 * 24));

  return { balance: Math.round(balance), idleDays };
}

module.exports = {
  getPortfolioSummary,
  getSpendingSummary,
  getGoalProgress,
  getSIPStatus,
  getEstimatedBalance,
  getIdleBalanceDays,
  checkRiskAlignment,
  getDashboardInsights,
  getWellnessScore,
  getNextBestActions,
  getRiskAdjustedRecommendations,
  getMonthChangeAnalysis
};
