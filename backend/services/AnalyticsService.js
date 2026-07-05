/**
 * AnalyticsService
 * Simulation-first business service for spending categories, cash flow forecasts, and advisory insights.
 * Easily replaceable with sandbox banking APIs later.
 */
const { getGoals } = require('./GoalService');

function getSpendingSummary(userId, db) {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  
  const currentMonthTxns = db.prepare(`
    SELECT category, SUM(ABS(amount)) as total 
    FROM transactions 
    WHERE user_id = ? AND amount < 0 AND date >= ? AND category != 'SIP'
    GROUP BY category
  `).all(userId, currentMonthStart);

  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0];
  const prevMonthsTxns = db.prepare(`
    SELECT category, SUM(ABS(amount)) as total, COUNT(DISTINCT strftime('%Y-%m', date)) as months
    FROM transactions 
    WHERE user_id = ? AND amount < 0 AND date >= ? AND date < ? AND category != 'SIP'
    GROUP BY category
  `).all(userId, threeMonthsAgo, currentMonthStart);

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

    if (changePct > 30 && avg > 0) {
      anomalies.push(`${row.category} spending is up ${changePct}% this month (₹${Math.round(row.total).toLocaleString('en-IN')} vs avg ₹${Math.round(avg).toLocaleString('en-IN')})`);
    }
  }

  const sipStatus = getSIPStatus(userId, db);

  return {
    categories,
    totalCurrentMonth: Math.round(totalCurrentMonth),
    anomalies,
    sipStatus
  };
}

function getSIPStatus(userId, db) {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];

  const lastMonthSIPs = db.prepare(`
    SELECT COUNT(*) as count, SUM(ABS(amount)) as total
    FROM transactions 
    WHERE user_id = ? AND category = 'SIP' AND date >= ? AND date < ?
  `).get(userId, prevMonthStart, currentMonthStart);

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

function getEstimatedBalance(userId, db) {
  const result = db.prepare(`
    SELECT SUM(amount) as balance FROM transactions WHERE user_id = ?
  `).get(userId);
  return result?.balance || 0;
}

function getIdleBalanceDays(userId, db) {
  const now = new Date();
  const balance = getEstimatedBalance(userId, db);
  
  const lastActivity = db.prepare(`
    SELECT date FROM transactions 
    WHERE user_id = ? AND amount < 0 AND ABS(amount) > 10000 AND category NOT IN ('Salary', 'SIP')
    ORDER BY date DESC LIMIT 1
  `).get(userId);

  if (!lastActivity) {
    return { balance: Math.round(balance), idleDays: 60 };
  }

  const lastDate = new Date(lastActivity.date);
  const idleDays = Math.round((now - lastDate) / (1000 * 60 * 60 * 24));

  return { balance: Math.round(balance), idleDays };
}

function getCashFlowForecast(userId, db) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return { currentBalance: 0, projectedBalance: 0, scheduledOutflows: 0, surplus: 0 };

  const currentBalance = user.savings_balance;
  const spendingSummary = getSpendingSummary(userId, db);
  const avgSpending = spendingSummary.totalCurrentMonth;
  const salary = user.monthly_income;
  
  const sips = db.prepare("SELECT SUM(ABS(amount)) as total FROM transactions WHERE user_id = ? AND category = 'SIP'").get(userId);
  const sipOutflow = sips?.total || 0;

  const scheduledOutflows = Math.round(sipOutflow + (avgSpending * 0.3));
  const projectedBalance = Math.round(currentBalance + salary - avgSpending - sipOutflow);

  return {
    currentBalance: Math.round(currentBalance),
    projectedBalance: Math.max(0, projectedBalance),
    scheduledOutflows,
    surplus: Math.max(0, salary - avgSpending - sipOutflow)
  };
}

function getGoalConflicts(userId, db) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const goals = getGoals(userId, db);
  
  if (!user || goals.length === 0) return { hasConflict: false, totalMonthlyRequired: 0, surplusIncome: 0, conflicts: [] };

  const forecast = getCashFlowForecast(userId, db);
  const surplusIncome = forecast.surplus;

  const totalMonthlyRequired = goals.reduce((sum, g) => sum + g.monthlyRequired, 0);
  const hasConflict = totalMonthlyRequired > surplusIncome;

  const conflicts = [];
  if (hasConflict) {
    conflicts.push(`Your active goals require a total saving of ₹${totalMonthlyRequired.toLocaleString('en-IN')}/month, which exceeds your monthly surplus income of ₹${Math.round(surplusIncome).toLocaleString('en-IN')}. Consider prioritizing or extending the target dates.`);
  }

  return {
    hasConflict,
    totalMonthlyRequired,
    surplusIncome: Math.round(surplusIncome),
    conflicts
  };
}

module.exports = {
  getSpendingSummary,
  getCashFlowForecast,
  getGoalConflicts,
  getIdleBalanceDays,
  getEstimatedBalance,
  getSIPStatus
};
