/**
 * PortfolioService
 * Simulation-first business service for portfolio asset holdings and trades.
 * Easily replaceable with sandbox banking APIs later.
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
      holdingsCount: 0,
      holdings: []
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

  const allocationPct = {};
  for (const [cat, val] of Object.entries(allocation)) {
    allocationPct[cat] = totalValue > 0 ? Math.round((val / totalValue) * 100) : 0;
  }

  const riskAlignment = checkRiskAlignment(user?.risk_profile || 'Moderate', allocationPct);

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

function checkRiskAlignment(riskProfile, allocationPct) {
  const equityExposure = (allocationPct.Equity || 0) + (allocationPct.Hybrid || 0) * 0.5;

  switch (riskProfile) {
    case 'Conservative':
      return equityExposure <= 30 ? 'aligned' : 'misaligned';
    case 'Moderate':
      return equityExposure >= 25 && equityExposure <= 75 ? 'aligned' : 'misaligned';
    case 'Aggressive':
      return equityExposure >= 40 ? 'aligned' : 'misaligned';
    default:
      return 'unknown';
  }
}

function buyAsset(userId, assetName, amount, category, db) {
  const amt = Number(amount);
  const cat = category || 'Equity';

  try {
    db.prepare('BEGIN TRANSACTION').run();
    db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
    db.prepare(
      'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Investment\')'
    ).run(userId, `Invested in ${assetName}`, -amt);
    
    const existing = db.prepare('SELECT id FROM portfolio_holdings WHERE user_id = ? AND instrument_name = ?').get(userId, assetName);
    if (existing) {
      db.prepare('UPDATE portfolio_holdings SET current_value = current_value + ?, invested_value = invested_value + ? WHERE id = ?').run(amt, amt, existing.id);
    } else {
      db.prepare(
        'INSERT INTO portfolio_holdings (user_id, instrument_name, instrument_type, current_value, invested_value, category) VALUES (?, ?, \'Mutual Fund\', ?, ?, ?)'
      ).run(userId, assetName, amt, amt, cat);
    }
    db.prepare('COMMIT').run();
    return { success: true, message: `Invested ₹${amt.toLocaleString('en-IN')} in ${assetName} successfully.` };
  } catch (err) {
    try { db.prepare('ROLLBACK').run(); } catch(e) {}
    throw err;
  }
}

function sellAsset(userId, assetName, amount, db) {
  const amt = Number(amount);
  
  try {
    db.prepare('BEGIN TRANSACTION').run();
    const existing = db.prepare('SELECT * FROM portfolio_holdings WHERE user_id = ? AND instrument_name = ?').get(userId, assetName);
    if (!existing || existing.current_value < amt) {
      throw new Error('Insufficient holdings to sell.');
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
    db.prepare('COMMIT').run();
    return { success: true, message: `Redeemed ₹${amt.toLocaleString('en-IN')} from ${assetName} successfully.` };
  } catch (err) {
    try { db.prepare('ROLLBACK').run(); } catch(e) {}
    throw err;
  }
}

module.exports = {
  getPortfolioSummary,
  buyAsset,
  sellAsset
};
