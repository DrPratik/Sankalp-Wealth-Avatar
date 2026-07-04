/**
 * Sankalp — Trigger Detector
 * Detects conditions that should trigger proactive nudges.
 * All checks are plain code against SQLite data — no LLM calls.
 */
const ruleEngine = require('./ruleEngine');

/**
 * Run all trigger checks for a given user.
 * Returns array of { trigger_type, fact_text, data } objects.
 */
function detectTriggers(userId, db) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return [];

  const triggers = [];

  // Run all trigger checks
  const idleResult = checkIdleBalance(userId, db);
  if (idleResult) triggers.push(idleResult);

  const sipResult = checkMissedSIP(userId, db);
  if (sipResult) triggers.push(sipResult);

  const goalResults = checkGoalTriggers(userId, db);
  triggers.push(...goalResults);

  const spendingResult = checkSpendingSpike(userId, db);
  if (spendingResult) triggers.push(spendingResult);

  const crossSellResult = checkCrossSellOpportunity(userId, db, user);
  if (crossSellResult) triggers.push(crossSellResult);

  return triggers;
}

/**
 * Trigger: Idle Balance
 * Condition: Savings balance > ₹1,00,000 untouched for 30+ days
 */
function checkIdleBalance(userId, db) {
  const { balance, idleDays } = ruleEngine.getIdleBalanceDays(userId, db);

  if (balance > 100000 && idleDays >= 30) {
    return {
      trigger_type: 'idle_balance',
      fact_text: `₹${balance.toLocaleString('en-IN')} sitting idle in savings for ${idleDays} days`,
      data: { balance, idleDays }
    };
  }
  return null;
}

/**
 * Trigger: Missed/Bounced SIP
 * Condition: SIP expected this month but absent
 */
function checkMissedSIP(userId, db) {
  const { status, lastMonthAmount, message } = ruleEngine.getSIPStatus(userId, db);

  if (status === 'missed') {
    return {
      trigger_type: 'missed_sip',
      fact_text: message,
      data: { lastMonthAmount }
    };
  }
  return null;
}

/**
 * Trigger: Goal Off-Track / Goal Milestone
 * Returns multiple triggers if multiple goals qualify
 */
function checkGoalTriggers(userId, db) {
  const goals = ruleEngine.getGoalProgress(userId, db);
  const triggers = [];

  for (const goal of goals) {
    // Goal milestone hit (≥50% saved, ≥75% for near-milestone)
    if (goal.isMilestoneHit && goal.progressPct >= 50 && goal.progressPct < 100) {
      // Check if already notified for this milestone
      const existing = db.prepare(
        'SELECT id FROM nudges_log WHERE user_id = ? AND trigger_type = ? AND generated_text LIKE ?'
      ).get(userId, 'goal_milestone', `%${goal.goalName}%`);

      if (!existing) {
        triggers.push({
          trigger_type: 'goal_milestone',
          fact_text: `${goal.goalName} goal is ${goal.progressPct}% complete (₹${goal.currentSaved.toLocaleString('en-IN')} of ₹${goal.targetAmount.toLocaleString('en-IN')})`,
          data: { goalName: goal.goalName, progressPct: goal.progressPct }
        });
      }
    }

    // Goal off-track (needs more than reasonable monthly contribution)
    const user = db.prepare('SELECT monthly_income FROM users WHERE id = ?').get(userId);
    if (user && goal.monthlyRequired > user.monthly_income * 0.3 && goal.progressPct < 50) {
      triggers.push({
        trigger_type: 'goal_offtrack',
        fact_text: `${goal.goalName} goal needs ₹${goal.monthlyRequired.toLocaleString('en-IN')}/month to stay on track (${goal.progressPct}% complete, ${goal.monthsRemaining} months left)`,
        data: { goalName: goal.goalName, monthlyRequired: goal.monthlyRequired, progressPct: goal.progressPct }
      });
    }
  }

  return triggers;
}

/**
 * Trigger: Spending Spike
 * Condition: Any category spend > 130% of 3-month average
 */
function checkSpendingSpike(userId, db) {
  const spending = ruleEngine.getSpendingSummary(userId, db);

  // Find the biggest spike
  let biggestSpike = null;
  for (const cat of spending.categories) {
    if (cat.changePct > 30 && cat.avg3Month > 0) {
      if (!biggestSpike || cat.changePct > biggestSpike.changePct) {
        biggestSpike = cat;
      }
    }
  }

  if (biggestSpike) {
    return {
      trigger_type: 'spending_spike',
      fact_text: `${biggestSpike.name} spending is up ${biggestSpike.changePct}% this month (₹${biggestSpike.currentMonth.toLocaleString('en-IN')} vs avg ₹${biggestSpike.avg3Month.toLocaleString('en-IN')})`,
      data: { category: biggestSpike.name, changePct: biggestSpike.changePct, amount: biggestSpike.currentMonth }
    };
  }
  return null;
}

/**
 * Trigger: Cross-sell Opportunity
 * Condition: User has no insurance AND income > ₹40,000/month
 */
function checkCrossSellOpportunity(userId, db, user) {
  if (user.monthly_income < 40000) return null;

  const hasInsurance = db.prepare(
    'SELECT COUNT(*) as count FROM portfolio_holdings WHERE user_id = ? AND instrument_type = ?'
  ).get(userId, 'Insurance');

  // Also check if they have insurance-related transactions
  const hasInsuranceTxn = db.prepare(
    "SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND category = 'Insurance'"
  ).get(userId);

  if (hasInsurance.count === 0 && hasInsuranceTxn.count === 0) {
    return {
      trigger_type: 'cross_sell',
      fact_text: `No insurance product on file, monthly income ₹${user.monthly_income.toLocaleString('en-IN')} — eligible for term/health insurance`,
      data: { monthlyIncome: user.monthly_income }
    };
  }
  return null;
}

module.exports = {
  detectTriggers
};
