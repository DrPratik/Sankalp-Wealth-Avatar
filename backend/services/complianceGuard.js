/**
 * Sankalp — Compliance Guard
 * Deterministic rule-based compliance filter. NO LLM calls.
 * Runs BEFORE the Gemini call and produces constraints for the prompt.
 * Also post-processes LLM output to enforce disclaimers and ban unsafe language.
 */

// ── Banned phrases that imply guaranteed returns ──
const BANNED_PHRASES = [
  'guaranteed return',
  'guaranteed returns',
  'assured profit',
  'assured profits',
  'risk-free investment',
  'risk free investment',
  'no risk',
  'zero risk',
  'sure shot',
  'guaranteed growth',
  'assured return',
  'assured returns',
  'definite profit',
  'certain return'
];

// ── Keywords that trigger mandatory disclaimer ──
const DISCLAIMER_KEYWORDS = [
  'fund', 'mutual fund', 'equity', 'market', 'stock', 'shares',
  'nifty', 'sensex', 'invest', 'sip', 'nav', 'portfolio',
  'returns', 'wealth', 'capital', 'asset'
];

const DEFAULT_DISCLAIMER = 'Mutual fund investments are subject to market risks. Read all scheme-related documents carefully before investing.';

/**
 * Generate compliance constraint text to inject into the LLM prompt.
 * This constrains what the LLM is allowed to suggest.
 */
function generateComplianceConstraints(user, portfolioSummary, db) {
  const constraints = [];

  // Rule 1: Risk mismatch block
  if (user.risk_profile === 'Conservative') {
    constraints.push(
      'User has a CONSERVATIVE risk profile — do NOT suggest small-cap funds, sector funds, ' +
      'direct equity, or any high-risk instruments. Only suggest debt funds, hybrid funds, FDs, ' +
      'large-cap funds, and government-backed instruments.'
    );
  } else if (user.risk_profile === 'Moderate') {
    constraints.push(
      'User has a MODERATE risk profile — suggest a balanced mix. Avoid pure small-cap or sector-specific bets. ' +
      'Prefer large-cap, flexi-cap, balanced advantage, and hybrid funds alongside some debt.'
    );
  }
  // Aggressive gets fewer restrictions

  // Rule 2: Income-based eligibility
  if (user.monthly_income < 30000) {
    constraints.push(
      'User income is below ₹30,000/month — do NOT suggest PMS (Portfolio Management Services), ' +
      'AIF (Alternative Investment Funds), or high-ticket insurance products (premium > ₹10,000/month). ' +
      'Flag as "not eligible for premium products".'
    );
  }

  // Rule 3: Insurance product cooldown
  const hasRecentInsurance = checkRecentInsurance(user.id, db);
  if (hasRecentInsurance) {
    constraints.push(
      'User already holds an insurance product purchased recently — do NOT suggest another insurance cross-sell.'
    );
  }

  // Rule 4: General compliance reminder
  constraints.push(
    'Always include a compliance_note disclaimer if mentioning any market-linked investment products. ' +
    'Never guarantee returns or suggest specific buy/sell timing.'
  );

  // Rule 5: Crypto/unregulated products
  constraints.push(
    'Do NOT recommend cryptocurrency, NFTs, or any unregulated investment products. ' +
    'If asked about these, politely explain that the bank does not offer advisory on unregulated assets, ' +
    'and redirect to regulated alternatives appropriate for the user\'s risk profile.'
  );

  return constraints.join('\n');
}

/**
 * Check if user has purchased insurance in the last 12 months.
 */
function checkRecentInsurance(userId, db) {
  const holdings = db.prepare(
    'SELECT * FROM portfolio_holdings WHERE user_id = ? AND instrument_type = ?'
  ).all(userId, 'Insurance');
  
  // For the hackathon prototype, if they have ANY insurance holding, treat as recent
  return holdings.length > 0;
}

/**
 * Post-process the LLM's JSON reply to enforce compliance rules.
 * Returns the cleaned reply object, plus a flag indicating if it was modified.
 */
function postProcessReply(replyJson) {
  let modified = false;
  const result = { ...replyJson };

  // Rule 5: Check for banned phrases
  if (result.reply) {
    const replyLower = result.reply.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (replyLower.includes(phrase)) {
        console.warn(`[Compliance] BLOCKED banned phrase: "${phrase}" in reply`);
        result.reply = "Based on your profile, I'd suggest reviewing your current portfolio allocation with your bank's investment advisor for personalized guidance. Your financial goals are on the right path — let's keep that momentum going!";
        result.tone = 'neutral';
        result.compliance_note = DEFAULT_DISCLAIMER;
        result._complianceBlocked = true;
        modified = true;
        break;
      }
    }
  }

  // Rule 4: Enforce mandatory disclaimer
  if (!result._complianceBlocked && result.reply) {
    const replyLower = result.reply.toLowerCase();
    const needsDisclaimer = DISCLAIMER_KEYWORDS.some(kw => replyLower.includes(kw));
    
    if (needsDisclaimer && !result.compliance_note) {
      result.compliance_note = DEFAULT_DISCLAIMER;
      modified = true;
      console.log('[Compliance] Injected mandatory disclaimer (missing from LLM output)');
    }
  }

  result._wasModified = modified;
  return result;
}

/**
 * Validate a nudge against compliance rules before showing to user.
 * Returns true if the nudge is safe to display.
 */
function validateNudge(nudge, user) {
  if (!nudge || !nudge.body) return false;

  const bodyLower = nudge.body.toLowerCase();

  // Check banned phrases in nudge text
  for (const phrase of BANNED_PHRASES) {
    if (bodyLower.includes(phrase)) {
      console.warn(`[Compliance] Nudge blocked: banned phrase "${phrase}"`);
      return false;
    }
  }

  // Conservative users should not get equity nudges
  if (user.risk_profile === 'Conservative') {
    const equityTerms = ['small-cap', 'small cap', 'sector fund', 'direct equity', 'mid-cap', 'mid cap'];
    for (const term of equityTerms) {
      if (bodyLower.includes(term)) {
        console.warn(`[Compliance] Nudge blocked for Conservative user: "${term}"`);
        return false;
      }
    }
  }

  return true;
}

module.exports = {
  generateComplianceConstraints,
  postProcessReply,
  validateNudge,
  BANNED_PHRASES,
  DISCLAIMER_KEYWORDS,
  DEFAULT_DISCLAIMER
};
