/**
 * GoalService
 * Simulation-first business service for Goal Management.
 * Easily replaceable with sandbox banking APIs later.
 */

function getGoals(userId, db) {
  const goals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  return goals.map(goal => {
    const progressPct = goal.target_amount > 0 
      ? Math.round((goal.current_saved / goal.target_amount) * 100) 
      : 0;

    const now = new Date();
    const targetDate = new Date(goal.target_date);
    const monthsRemaining = Math.max(1, (targetDate - now) / (1000 * 60 * 60 * 24 * 30));
    const amountRemaining = goal.target_amount - goal.current_saved;
    const isPaused = goal.status === 'Paused';
    
    const monthlyRequired = (amountRemaining > 0 && !isPaused) ? Math.round(amountRemaining / monthsRemaining) : 0;

    const surplus = user ? (user.monthly_income * 0.4) : 25000;
    let completionProbability = isPaused ? 'Low' : 'High';
    if (!isPaused) {
      if (monthlyRequired > surplus * 0.75) {
        completionProbability = 'Low';
      } else if (monthlyRequired > surplus * 0.35) {
        completionProbability = 'Medium';
      }
    }

    const projectedMonths = (monthlyRequired > 0 && !isPaused) ? (amountRemaining / monthlyRequired) : 0;
    const projectedDate = new Date(now.getFullYear(), now.getMonth() + Math.ceil(projectedMonths), now.getDate());
    
    let recommendation = isPaused 
      ? 'Goal is currently paused. Resume saving to stay on track.'
      : 'On track. Keep saving consistently!';
      
    if (!isPaused) {
      if (completionProbability === 'Low') {
        recommendation = `Shortfall expected. Increase monthly saving by ₹${Math.round(monthlyRequired * 0.2).toLocaleString('en-IN')} or delay target date by 6 months.`;
      } else if (completionProbability === 'Medium') {
        recommendation = `Tight margin. Try setting up an automatic SIP to auto-save ₹${monthlyRequired.toLocaleString('en-IN')}/month.`;
      }
    }

    // Map investment type to user-friendly funding source tag
    let fundingSource = 'Savings Account';
    if (goal.investment_type === 'FD') fundingSource = 'Fixed Deposit';
    else if (goal.investment_type === 'Mutual Fund') fundingSource = 'Mutual Funds';
    else if (goal.investment_type === 'Stocks') fundingSource = 'Equity Shares';

    return {
      id: goal.id,
      goalName: goal.goal_name,
      targetAmount: goal.target_amount,
      currentSaved: goal.current_saved,
      targetDate: goal.target_date,
      status: goal.status || 'Active',
      investmentType: goal.investment_type || 'Savings',
      progressPct,
      monthsRemaining: Math.round(monthsRemaining),
      monthlyRequired,
      isOnTrack: !isPaused && (progressPct >= (100 - (monthsRemaining / (monthsRemaining + 1) * 100))),
      isMilestoneHit: progressPct >= 50,
      completionProbability,
      projectedCompletionDate: isPaused ? 'N/A' : projectedDate.toISOString().split('T')[0],
      fundingSource,
      recommendation
    };
  });
}

function createGoal(userId, { goalName, targetAmount, currentSaved, targetDate, investmentType }, db) {
  const invType = investmentType || 'Savings';
  const initialSaved = Number(currentSaved || 0);

  try {
    db.prepare('BEGIN TRANSACTION').run();

    // 1. Create the goal
    const result = db.prepare(
      'INSERT INTO goals (user_id, goal_name, target_amount, current_saved, target_date, status, investment_type) VALUES (?, ?, ?, ?, ?, \'Active\', ?)'
    ).run(userId, goalName, Number(targetAmount), initialSaved, targetDate, invType);

    // 2. Deduct from savings balance and log transaction if initial saved > 0
    if (initialSaved > 0) {
      db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(initialSaved, userId);
      db.prepare(
        'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Investment\')'
      ).run(userId, `Initial Funding: ${goalName}`, -initialSaved);
      console.log(`[Goal Funding] Deducted ₹${initialSaved} from savings for initial goal creation: ${goalName}`);
    }

    db.prepare('COMMIT').run();
    return { success: true, goalId: result.lastInsertRowid };
  } catch (err) {
    try { db.prepare('ROLLBACK').run(); } catch(e) {}
    throw err;
  }
}

function updateGoal(userId, goalId, fields, db) {
  const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
  if (!existing) {
    throw new Error('Goal not found');
  }

  const uId = userId || existing.user_id;

  try {
    db.prepare('BEGIN TRANSACTION').run();

    // If currentSaved is being updated, handle balance & transaction updates
    if (fields.currentSaved !== undefined) {
      const nextSaved = Number(fields.currentSaved);
      const prevSaved = existing.current_saved;
      const diff = nextSaved - prevSaved;
      
      if (diff > 0) {
        // Deduct from savings balance
        db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(diff, uId);
        // Log transaction
        db.prepare(
          'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Investment\')'
        ).run(uId, `Deposit to Goal: ${existing.goal_name}`, -diff);
        console.log(`[Goal Funding] Deducted ₹${diff} from user ${uId} savings balance for goal: ${existing.goal_name}`);
      } else if (diff < 0) {
        // Refund back to savings balance
        const refund = Math.abs(diff);
        db.prepare('UPDATE users SET savings_balance = savings_balance + ? WHERE id = ?').run(refund, uId);
        db.prepare(
          'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Investment\')'
        ).run(uId, `Withdrawal from Goal: ${existing.goal_name}`, refund);
        console.log(`[Goal Funding] Refunded ₹${refund} to user ${uId} savings balance from goal: ${existing.goal_name}`);
      }
    }

    db.prepare(`
      UPDATE goals 
      SET goal_name = ?, target_amount = ?, current_saved = ?, target_date = ?, status = ?, investment_type = ?
      WHERE id = ?
    `).run(
      fields.goalName !== undefined ? fields.goalName : existing.goal_name,
      fields.targetAmount !== undefined ? Number(fields.targetAmount) : existing.target_amount,
      fields.currentSaved !== undefined ? Number(fields.currentSaved) : existing.current_saved,
      fields.targetDate !== undefined ? fields.targetDate : existing.target_date,
      fields.status !== undefined ? fields.status : (existing.status || 'Active'),
      fields.investmentType !== undefined ? fields.investmentType : (existing.investment_type || 'Savings'),
      goalId
    );

    db.prepare('COMMIT').run();
    return { success: true };
  } catch (err) {
    try { db.prepare('ROLLBACK').run(); } catch(e) {}
    throw err;
  }
}

function deleteGoal(userId, goalId, db) {
  const result = db.prepare('DELETE FROM goals WHERE id = ?').run(goalId);
  if (result.changes === 0) {
    throw new Error('Goal not found');
  }
  return { success: true };
}

module.exports = {
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal
};
