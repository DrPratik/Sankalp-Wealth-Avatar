/**
 * BankingService
 * Simulation-first business service for conversational banking transactions.
 * Easily replaceable with sandbox banking APIs later.
 */

function transferMoney(userId, amount, recipient, db) {
  const amt = Number(amount);
  try {
    db.prepare('BEGIN TRANSACTION').run();
    db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
    db.prepare(
      'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Transfer\')'
    ).run(userId, `Transfer to ${recipient}`, -amt);
    db.prepare('COMMIT').run();
    return { success: true, message: `Transferred ₹${amt.toLocaleString('en-IN')} to ${recipient} successfully.` };
  } catch (err) {
    try { db.prepare('ROLLBACK').run(); } catch(e) {}
    throw err;
  }
}

function payBill(userId, amount, recipient, db) {
  const amt = Number(amount);
  try {
    db.prepare('BEGIN TRANSACTION').run();
    db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
    db.prepare(
      'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Bills\')'
    ).run(userId, `Payment: ${recipient}`, -amt);
    db.prepare('COMMIT').run();
    return { success: true, message: `Paid ₹${amt.toLocaleString('en-IN')} for ${recipient} successfully.` };
  } catch (err) {
    try { db.prepare('ROLLBACK').run(); } catch(e) {}
    throw err;
  }
}

function payEMI(userId, amount, recipient, db) {
  const amt = Number(amount);
  try {
    db.prepare('BEGIN TRANSACTION').run();
    db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
    db.prepare(
      'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'EMI\')'
    ).run(userId, `EMI Payment: ${recipient}`, -amt);
    db.prepare('COMMIT').run();
    return { success: true, message: `Paid EMI of ₹${amt.toLocaleString('en-IN')} successfully.` };
  } catch (err) {
    try { db.prepare('ROLLBACK').run(); } catch(e) {}
    throw err;
  }
}

function freezeCard(userId, db) {
  db.prepare("UPDATE users SET card_status = 'Frozen' WHERE id = ?").run(userId);
  return { success: true, message: 'Your debit card has been frozen successfully.' };
}

// Unfreeze card
function unfreezeCard(userId, db) {
  db.prepare("UPDATE users SET card_status = 'Active' WHERE id = ?").run(userId);
  return { success: true, message: 'Your debit card has been unfrozen successfully.' };
}

// Block card
function blockCard(userId, db) {
  db.prepare("UPDATE users SET card_status = 'Blocked' WHERE id = ?").run(userId);
  return { success: true, message: 'Your debit card has been permanently blocked. A replacement has been ordered.' };
}

function openFD(userId, amount, durationMonths, db) {
  const amt = Number(amount);
  const duration = durationMonths || 12;
  try {
    db.prepare('BEGIN TRANSACTION').run();
    db.prepare('UPDATE users SET savings_balance = savings_balance - ? WHERE id = ?').run(amt, userId);
    db.prepare(
      'INSERT INTO transactions (user_id, date, description, amount, category) VALUES (?, date(\'now\'), ?, ?, \'Investment\')'
    ).run(userId, `Opened Fixed Deposit`, -amt);
    db.prepare(
      'INSERT INTO portfolio_holdings (user_id, instrument_name, instrument_type, current_value, invested_value, category) VALUES (?, ?, \'FD\', ?, ?, \'Debt\')'
    ).run(userId, `Fixed Deposit (${duration} Months)`, amt, amt);
    db.prepare('COMMIT').run();
    return { success: true, message: `Opened a Fixed Deposit of ₹${amt.toLocaleString('en-IN')} for ${duration} months successfully.` };
  } catch (err) {
    try { db.prepare('ROLLBACK').run(); } catch(e) {}
    throw err;
  }
}

module.exports = {
  transferMoney,
  payBill,
  payEMI,
  freezeCard,
  unfreezeCard,
  blockCard,
  openFD
};
