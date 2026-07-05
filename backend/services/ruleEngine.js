/**
 * Sankalp — Rule Engine Wrapper
 * Delegating calculations and insights generation to modular business services.
 * Keeps backward compatibility with other files (like triggerDetector.js).
 */
const GoalService = require('./GoalService');
const PortfolioService = require('./PortfolioService');
const AnalyticsService = require('./AnalyticsService');

function getPortfolioSummary(userId, db) {
  return PortfolioService.getPortfolioSummary(userId, db);
}

function getSpendingSummary(userId, db) {
  return AnalyticsService.getSpendingSummary(userId, db);
}

function getGoalProgress(userId, db) {
  return GoalService.getGoals(userId, db);
}

function getEstimatedBalance(userId, db) {
  return AnalyticsService.getEstimatedBalance(userId, db);
}

function getIdleBalanceDays(userId, db) {
  return AnalyticsService.getIdleBalanceDays(userId, db);
}

function getCashFlowForecast(userId, db) {
  return AnalyticsService.getCashFlowForecast(userId, db);
}

function getGoalConflicts(userId, db) {
  return AnalyticsService.getGoalConflicts(userId, db);
}

function getSIPStatus(userId, db) {
  return AnalyticsService.getSIPStatus(userId, db);
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

module.exports = {
  getPortfolioSummary,
  getSpendingSummary,
  getGoalProgress,
  getEstimatedBalance,
  getIdleBalanceDays,
  getCashFlowForecast,
  getGoalConflicts,
  getSIPStatus,
  getDashboardInsights,
  getWellnessScore,
  getNextBestActions,
  getRiskAdjustedRecommendations,
  getMonthChangeAnalysis
};
