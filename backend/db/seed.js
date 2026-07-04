/**
 * Sankalp AI Wealth Avatar — Database Seed Script
 * Seeds 3 demo personas with realistic financial data.
 * Dates are computed relative to today so data is always "current".
 * Uses sql.js (pure JS SQLite).
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'sankalp.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

async function seed() {
  // Remove existing DB to start fresh
  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
    console.log('[Seed] Removed existing database.');
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Run schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.run(schema);
  console.log('[Seed] Schema created.');

  // ── Helper: date strings relative to today ──
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }

  function monthsFromNow(n) {
    const d = new Date();
    d.setMonth(d.getMonth() + n);
    return d.toISOString().split('T')[0];
  }

  // ═══════════════════════════════════════════════════════
  // PERSONA 1 — Rahul Deshmukh (Conservative, salaried)
  // ═══════════════════════════════════════════════════════
  db.run(`INSERT INTO users (name, age, monthly_income, risk_profile, city) VALUES (?, ?, ?, ?, ?)`,
    ['Rahul Deshmukh', 34, 65000, 'Conservative', 'Pune']);
  const rahulId = 1;

  // Portfolio: ₹3,20,000 in FDs + 1 debt mutual fund, no equity
  const insertHolding = `INSERT INTO portfolio_holdings (user_id, instrument_name, instrument_type, current_value, invested_value, category) VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(insertHolding, [rahulId, 'SBI Fixed Deposit (3 Year)', 'FD', 180000, 150000, 'Debt']);
  db.run(insertHolding, [rahulId, 'HDFC Fixed Deposit (5 Year)', 'FD', 140000, 120000, 'Debt']);
  db.run(insertHolding, [rahulId, 'ICICI Prudential Corporate Bond Fund', 'Mutual Fund', 52000, 50000, 'Debt']);

  // Transactions
  const insertTxn = `INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, ?, ?, ?, ?)`;

  // Last 6 months of salary
  for (let m = 0; m < 6; m++) {
    db.run(insertTxn, [rahulId, daysAgo(m * 30 + 1), 'Salary Credit - Wipro Ltd', 65000, 'Salary']);
  }

  // Current month expenses
  db.run(insertTxn, [rahulId, daysAgo(2), 'Rent Payment', -18000, 'Rent']);
  db.run(insertTxn, [rahulId, daysAgo(3), 'BigBasket Groceries', -4500, 'Groceries']);
  db.run(insertTxn, [rahulId, daysAgo(5), 'Swiggy Order', -850, 'Food & Dining']);
  db.run(insertTxn, [rahulId, daysAgo(7), 'D-Mart Shopping', -3200, 'Groceries']);
  db.run(insertTxn, [rahulId, daysAgo(10), 'Electricity Bill', -2100, 'Utilities']);
  db.run(insertTxn, [rahulId, daysAgo(12), 'Fuel - Petrol Pump', -2500, 'Transport']);
  db.run(insertTxn, [rahulId, daysAgo(15), 'Amazon Purchase', -1800, 'Shopping']);

  // Previous months — consistent spending
  for (let m = 1; m <= 3; m++) {
    db.run(insertTxn, [rahulId, daysAgo(m * 30 + 2), 'Rent Payment', -18000, 'Rent']);
    db.run(insertTxn, [rahulId, daysAgo(m * 30 + 5), 'Groceries', -4200, 'Groceries']);
    db.run(insertTxn, [rahulId, daysAgo(m * 30 + 8), 'Dining', -600, 'Food & Dining']);
    db.run(insertTxn, [rahulId, daysAgo(m * 30 + 10), 'Utilities', -2000, 'Utilities']);
    db.run(insertTxn, [rahulId, daysAgo(m * 30 + 12), 'Transport', -2300, 'Transport']);
  }

  // SIP — present for last 3 months but MISSING this month → triggers "missed SIP" nudge
  for (let m = 1; m <= 3; m++) {
    db.run(insertTxn, [rahulId, daysAgo(m * 30 + 5), 'SIP - ICICI Prudential Corp Bond Fund', -5000, 'SIP']);
  }

  // Bonus credit 50 days ago (contributes to idle balance)
  db.run(insertTxn, [rahulId, daysAgo(50), 'Bonus Credit - Annual', 90000, 'Salary']);

  // Goal: Daughter's Education
  db.run(`INSERT INTO goals (user_id, goal_name, target_amount, current_saved, target_date) VALUES (?, ?, ?, ?, ?)`,
    [rahulId, "Daughter's Education", 1500000, 200000, '2034-06-01']);


  // ═══════════════════════════════════════════════════════
  // PERSONA 2 — Ananya Kulkarni (Aggressive, young professional)
  // ═══════════════════════════════════════════════════════
  db.run(`INSERT INTO users (name, age, monthly_income, risk_profile, city) VALUES (?, ?, ?, ?, ?)`,
    ['Ananya Kulkarni', 27, 95000, 'Aggressive', 'Mumbai']);
  const ananyaId = 2;

  // Portfolio: ₹4,10,000 across 3 equity MFs + direct stocks
  db.run(insertHolding, [ananyaId, 'Axis Small Cap Fund', 'Mutual Fund', 120000, 95000, 'Equity']);
  db.run(insertHolding, [ananyaId, 'Mirae Asset Large Cap Fund', 'Mutual Fund', 98000, 80000, 'Equity']);
  db.run(insertHolding, [ananyaId, 'Parag Parikh Flexi Cap Fund', 'Mutual Fund', 85000, 72000, 'Equity']);
  db.run(insertHolding, [ananyaId, 'Infosys Ltd (Direct Equity)', 'Stock', 62000, 48000, 'Equity']);
  db.run(insertHolding, [ananyaId, 'HDFC Bank Ltd (Direct Equity)', 'Stock', 45000, 38000, 'Equity']);

  // Transactions — high entertainment/dining spike this month
  for (let m = 0; m < 6; m++) {
    db.run(insertTxn, [ananyaId, daysAgo(m * 30 + 1), 'Salary Credit - Accenture', 95000, 'Salary']);
  }

  // Current month — dining/entertainment spike (40% higher than avg)
  db.run(insertTxn, [ananyaId, daysAgo(1), 'Zomato Gold Dining', -2800, 'Food & Dining']);
  db.run(insertTxn, [ananyaId, daysAgo(3), 'PVR INOX Movie + Snacks', -1200, 'Entertainment']);
  db.run(insertTxn, [ananyaId, daysAgo(4), 'Swiggy Dineout', -1600, 'Food & Dining']);
  db.run(insertTxn, [ananyaId, daysAgo(6), 'BookMyShow Concert Tickets', -3500, 'Entertainment']);
  db.run(insertTxn, [ananyaId, daysAgo(8), 'Cafe Leopold Bill', -2200, 'Food & Dining']);
  db.run(insertTxn, [ananyaId, daysAgo(10), 'Netflix + Spotify Subscription', -800, 'Entertainment']);
  db.run(insertTxn, [ananyaId, daysAgo(12), 'Barbeque Nation Dinner', -1800, 'Food & Dining']);
  db.run(insertTxn, [ananyaId, daysAgo(14), 'Uber Rides (Multiple)', -2400, 'Transport']);
  db.run(insertTxn, [ananyaId, daysAgo(5), 'Rent Payment', -28000, 'Rent']);
  db.run(insertTxn, [ananyaId, daysAgo(7), 'Groceries - Nature Basket', -3500, 'Groceries']);

  // Previous months — lower entertainment baseline
  for (let m = 1; m <= 3; m++) {
    db.run(insertTxn, [ananyaId, daysAgo(m * 30 + 2), 'Rent Payment', -28000, 'Rent']);
    db.run(insertTxn, [ananyaId, daysAgo(m * 30 + 4), 'Dining Out', -3000, 'Food & Dining']);
    db.run(insertTxn, [ananyaId, daysAgo(m * 30 + 6), 'Entertainment', -1500, 'Entertainment']);
    db.run(insertTxn, [ananyaId, daysAgo(m * 30 + 8), 'Groceries', -3200, 'Groceries']);
    db.run(insertTxn, [ananyaId, daysAgo(m * 30 + 10), 'Transport', -1800, 'Transport']);
  }

  // Regular SIPs — all present
  for (let m = 0; m < 4; m++) {
    db.run(insertTxn, [ananyaId, daysAgo(m * 30 + 5), 'SIP - Axis Small Cap Fund', -5000, 'SIP']);
    db.run(insertTxn, [ananyaId, daysAgo(m * 30 + 5), 'SIP - Mirae Asset Large Cap', -5000, 'SIP']);
  }

  // Goal: Goa Trip — nearly at milestone (75%)
  db.run(`INSERT INTO goals (user_id, goal_name, target_amount, current_saved, target_date) VALUES (?, ?, ?, ?, ?)`,
    [ananyaId, 'Goa Trip', 60000, 45000, monthsFromNow(3)]);


  // ═══════════════════════════════════════════════════════
  // PERSONA 3 — Suresh Iyer (Moderate, pre-retirement)
  // ═══════════════════════════════════════════════════════
  db.run(`INSERT INTO users (name, age, monthly_income, risk_profile, city) VALUES (?, ?, ?, ?, ?)`,
    ['Suresh Iyer', 52, 140000, 'Moderate', 'Pune']);
  const sureshId = 3;

  // Portfolio: ₹18,00,000 mixed equity/debt/gold
  db.run(insertHolding, [sureshId, 'HDFC Balanced Advantage Fund', 'Mutual Fund', 350000, 300000, 'Hybrid']);
  db.run(insertHolding, [sureshId, 'SBI Bluechip Fund', 'Mutual Fund', 280000, 240000, 'Equity']);
  db.run(insertHolding, [sureshId, 'ICICI Prudential Equity & Debt Fund', 'Mutual Fund', 220000, 190000, 'Hybrid']);
  db.run(insertHolding, [sureshId, 'Axis Banking & PSU Debt Fund', 'Mutual Fund', 180000, 170000, 'Debt']);
  db.run(insertHolding, [sureshId, 'SBI Fixed Deposit (5 Year)', 'FD', 300000, 250000, 'Debt']);
  db.run(insertHolding, [sureshId, 'HDFC Fixed Deposit (3 Year)', 'FD', 200000, 180000, 'Debt']);
  db.run(insertHolding, [sureshId, 'Sovereign Gold Bond 2024', 'Mutual Fund', 150000, 120000, 'Gold']);
  db.run(insertHolding, [sureshId, 'TCS Ltd (Direct Equity)', 'Stock', 120000, 100000, 'Equity']);

  // Transactions — consistent, no red flags
  for (let m = 0; m < 6; m++) {
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 1), 'Salary Credit - TCS Ltd', 140000, 'Salary']);
  }

  // Current month
  db.run(insertTxn, [sureshId, daysAgo(2), "Rent (Daughter's flat EMI)", -35000, 'Rent']);
  db.run(insertTxn, [sureshId, daysAgo(4), 'Medical Insurance Premium', -5000, 'Insurance']);
  db.run(insertTxn, [sureshId, daysAgo(6), 'Groceries - Ratnadeep', -6500, 'Groceries']);
  db.run(insertTxn, [sureshId, daysAgo(8), 'Electricity Bill', -3200, 'Utilities']);
  db.run(insertTxn, [sureshId, daysAgo(10), 'Dining - Weekend Family', -2500, 'Food & Dining']);
  db.run(insertTxn, [sureshId, daysAgo(13), 'Petrol + Car Service', -4500, 'Transport']);

  // Previous months — very stable
  for (let m = 1; m <= 3; m++) {
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 2), 'Rent/EMI', -35000, 'Rent']);
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 5), 'Groceries', -6000, 'Groceries']);
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 7), 'Dining', -2200, 'Food & Dining']);
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 9), 'Utilities', -3000, 'Utilities']);
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 11), 'Transport', -4000, 'Transport']);
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 4), 'Insurance Premium', -5000, 'Insurance']);
  }

  // Consistent SIPs — all present, no misses
  for (let m = 0; m < 4; m++) {
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 5), 'SIP - HDFC Balanced Advantage', -10000, 'SIP']);
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 5), 'SIP - SBI Bluechip Fund', -8000, 'SIP']);
    db.run(insertTxn, [sureshId, daysAgo(m * 30 + 5), 'SIP - Axis Banking & PSU Debt', -5000, 'SIP']);
  }

  // Goal: Retirement Corpus
  db.run(`INSERT INTO goals (user_id, goal_name, target_amount, current_saved, target_date) VALUES (?, ?, ?, ?, ?)`,
    [sureshId, 'Retirement Corpus', 5000000, 1800000, '2036-01-01']);

  // ═══════════════════════════════════════════════════════
  // Save to file
  // ═══════════════════════════════════════════════════════
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  db.close();

  console.log('[Seed] ✅ Database seeded successfully with 3 demo personas:');
  console.log(`  1. Rahul Deshmukh (id=${rahulId}) — Conservative`);
  console.log(`  2. Ananya Kulkarni (id=${ananyaId}) — Aggressive`);
  console.log(`  3. Suresh Iyer (id=${sureshId}) — Moderate`);
  console.log(`[Seed] Database file: ${DB_PATH}`);
}

seed().catch(err => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});
