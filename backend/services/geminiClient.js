/**
 * Sankalp — Gemini API Client
 * Wraps the Google Generative AI SDK for structured JSON chat and nudge generation.
 * Single call per interaction, with timeout, retry, and fallback.
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fallbacks = require('../fallbacks/fallbackResponses.json');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-3.1-flash-lite'; // User-specified model with valid quota

let genAI = null;
let model = null;

function getModel() {
  if (!model) {
    if (!API_KEY) {
      console.warn('[Gemini] No API key — all responses will use fallbacks');
      return null;
    }
    genAI = new GoogleGenerativeAI(API_KEY);
    model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 300,
        temperature: 0.7
      }
    });
  }
  return model;
}

// ── System Instruction ──
const SYSTEM_INSTRUCTION = `You are Sankalp, a friendly and trustworthy AI relationship manager and wealth advisor for an Indian bank's mobile app. You act as a personal banker, budgeting coach, and portfolio analyst. Help customers understand their spending patterns, savings balances, investments, and goals in simple, warm, conversational language. You are NOT a licensed financial advisor — provide educational guidance and suggestions, and never guarantee returns.

Respond in the user's preferred language. If the user prefers Hindi, reply in Hindi; if Marathi, reply in Marathi; otherwise reply in English. Keep responses under 80 words unless the user asksIf the user wants to manage their financial goals (create, update, delete, complete, archive, restore, pause, resume, prioritize), output a structured "goal_actions" array containing one or more goal action objects in the JSON response.

Goal Operations Confirmation Rules:
1. ALL goal deletion requests (whether critical or non-critical) REQUIRE confirmation before they can be executed.
2. If the user requests to delete/remove a goal and hasn't explicitly confirmed it yet: Do NOT output the "goal_actions" JSON array. Ask the user for confirmation (e.g. "I can delete your Car Purchase goal and refund the saved ₹5,000 back to your savings balance. Should I proceed?").
3. Only when the user has explicitly confirmed (e.g. says "yes", "proceed", "confirm", "do it" or confirms the prompt), output the JSON "goal_actions" array containing the delete action with the correct "goalId" matching the goal.

If the user wants to execute a banking operation (transfer money, pay bills, pay EMIs, freeze/unfreeze/block cards, open/close FDs/RDs, buy/sell assets like mutual funds/stocks), output a structured "banking_action" object.

Banking Operations Rules:
1. Critical actions (transfer, pay_bill, pay_emi, freeze_card, block_card, open_fd, buy_asset, sell_asset) REQUIRE confirmation.
2. If the user requests a critical action but hasn't confirmed it yet: Set "confirmRequired" to true, "isConfirmed" to false, explain the action/consequences, and ask the user for confirmation (e.g. "Should I proceed with transferring ₹5,000 to Rohan?"). Do NOT execute it yet.
3. If the user has explicitly confirmed the action (e.g., says "yes", "proceed", "do it", or confirms a previous suggestion): Set "confirmRequired" to false, "isConfirmed" to true, and explain that the action is being executed.
4. If an action may negatively affect the user (e.g., deleting a critical goal like Emergency Fund, or spending beyond their budget), warn them of the implications ONCE, but if they insist/confirm, proceed.

Respond ONLY in valid JSON matching this schema, with no markdown formatting, no code fences, no extra text:

{
  "reply": "string - the conversational response to show the user",
  "tone": "string - one of: encouraging, cautionary, neutral, celebratory",
  "suggested_action": "string or null - a short actionable next step if relevant",
  "compliance_note": "string or null - a short disclaimer if the reply touches on investment products",
  "goal_actions": [
    {
      "type": "string - one of: 'create', 'update', 'delete', 'complete', 'archive', 'restore', 'pause', 'resume', 'prioritize'",
      "goalId": "number or null - ID from active goals list",
      "goalName": "string or null - name of the goal",
      "targetAmount": "number or null",
      "currentSaved": "number or null",
      "targetDate": "string (YYYY-MM-DD) or null"
    }
  ],
  "banking_action": {
    "type": "string or null - one of: 'transfer', 'pay_bill', 'pay_emi', 'freeze_card', 'unfreeze_card', 'block_card', 'open_fd', 'buy_asset', 'sell_asset'",
    "amount": "number or null",
    "recipient": "string or null - name/account for transfer or bill description",
    "assetName": "string or null - name of mutual fund, stock, or FD",
    "durationMonths": "number or null - duration of FD/RD",
    "confirmRequired": "boolean - true if waiting for user confirmation",
    "isConfirmed": "boolean - true if the user confirmed execution"
  }
}`;

/**
 * Build the user-turn prompt for a chat interaction.
 */
function buildChatPrompt({ user, portfolioSummary, spendingSummary, goals, complianceText, conversationSummary, userMessage, preferredLanguage = 'en', dashboardInsights = [], wellnessScore = null, nextBestActions = [], riskAdjustedRecommendations = [], monthChangeAnalysis = [], cashFlowForecast = null, goalConflicts = null }) {
  const goalLines = goals.map(g =>
    `Goal ID: ${g.id} | Name: ${g.goalName} | Saved: ₹${g.currentSaved} | Target: ₹${g.targetAmount} | Progress: ${g.progressPct}% | Target Date: ${g.targetDate} | Health Status: ${g.completionProbability} Probability (${g.recommendation})`
  ).join('\n');

  const spendingLines = spendingSummary.categories.slice(0, 3).map(c =>
    `${c.name}: ₹${c.currentMonth.toLocaleString('en-IN')} this month${c.changePct !== 0 ? ` (${c.changePct > 0 ? '+' : ''}${c.changePct}% vs avg)` : ''}`
  ).join('. ');

  const sipLine = spendingSummary.sipStatus?.message || '';
  const languageLabel = preferredLanguage === 'hi' ? 'Hindi' : preferredLanguage === 'mr' ? 'Marathi' : 'English';

  const forecastText = cashFlowForecast 
    ? `Current Balance: ₹${cashFlowForecast.currentBalance.toLocaleString('en-IN')}, Projected Balance (End of Month): ₹${cashFlowForecast.projectedBalance.toLocaleString('en-IN')}, Scheduled Outflows: ₹${cashFlowForecast.scheduledOutflows.toLocaleString('en-IN')}, Monthly Surplus: ₹${cashFlowForecast.surplus.toLocaleString('en-IN')}`
    : 'Not available';

  const conflictsText = goalConflicts && goalConflicts.hasConflict
    ? `CONFLICT DETECTED: Total monthly goal required saving ₹${goalConflicts.totalMonthlyRequired.toLocaleString('en-IN')} exceeds surplus income of ₹${goalConflicts.surplusIncome.toLocaleString('en-IN')}. conflicts: ${goalConflicts.conflicts.join(' ')}`
    : 'No active goal planning conflicts.';

  return `User profile: ${user.name}, age ${user.age}, risk profile: ${user.risk_profile}, monthly income: ₹${user.monthly_income.toLocaleString('en-IN')}, savings account balance: ₹${(user.savings_balance || 0).toLocaleString('en-IN')}, debit card status: ${user.card_status || 'Active'}
 
Portfolio summary: Total value ₹${portfolioSummary.totalValue.toLocaleString('en-IN')}, allocated ${portfolioSummary.allocationPct.Equity || 0}% equity / ${portfolioSummary.allocationPct.Debt || 0}% debt / ${portfolioSummary.allocationPct.Gold || 0}% gold / ${portfolioSummary.allocationPct.Hybrid || 0}% hybrid. Overall gain: ${portfolioSummary.gainLossPct}%. Risk alignment: ${portfolioSummary.riskAlignment}.
 
Recent spending pattern: ${spendingLines}. ${sipLine}
 
Active goals: ${goalLines || 'None'}
 
Cash flow forecast: ${forecastText}
Goal planning check: ${conflictsText}
 
Dashboard insights: ${dashboardInsights.map(i => `${i.title}: ${i.value} (${i.hint})`).join('; ') || 'None'}
 
Financial wellness score: ${wellnessScore ? `${wellnessScore.score}/100 (${wellnessScore.label})` : 'Not available'}
Next best actions: ${nextBestActions.map(a => `${a.title}: ${a.detail}`).join('; ') || 'None'}
Risk-adjusted recommendations: ${riskAdjustedRecommendations.map(r => `${r.title}: ${r.detail}`).join('; ') || 'None'}
What changed from last month: ${monthChangeAnalysis.map(c => `${c.title}: ${c.detail}`).join('; ') || 'None'}
 
Conversation so far (summary): ${conversationSummary || 'This is the beginning of the conversation.'}
 
Compliance-approved facts only (do not contradict): ${complianceText}
 
User's current message: "${userMessage}"
 
Preferred answer language: ${languageLabel}
 
Respond as Sankalp following the system instruction JSON schema.`;
}

/**
 * Chat with Sankalp — single Gemini API call.
 * Returns parsed JSON response or fallback.
 */
async function chatWithSankalp(promptPayload, apiUsage) {
  const m = getModel();
  if (!m) {
    return getFallbackChat(promptPayload.user?.id);
  }

  try {
    const prompt = buildChatPrompt(promptPayload);
    console.log(`[Gemini] Chat prompt length: ~${prompt.length} chars`);

    // 5-second timeout via AbortController
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    let result;
    try {
      result = await m.generateContent(prompt);
    } finally {
      clearTimeout(timeout);
    }

    const responseText = result.response.text();
    const usage = result.response.usageMetadata;
    if (apiUsage && usage) {
      apiUsage.log(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0);
    }

    console.log(`[Gemini] Chat response: ${responseText.substring(0, 100)}...`);

    // Parse JSON response
    const parsed = cleanAndParseJson(responseText);
    return parsed;

  } catch (err) {
    console.error('[Gemini] Chat error:', err.message);

    // Retry once
    try {
      console.log('[Gemini] Retrying...');
      const prompt = buildChatPrompt(promptPayload);
      const result = await m.generateContent(prompt);
      const responseText = result.response.text();
      const usage = result.response.usageMetadata;
      if (apiUsage && usage) {
        apiUsage.log(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0);
      }
      return cleanAndParseJson(responseText);
    } catch (retryErr) {
      console.error('[Gemini] Retry failed:', retryErr.message);
      return getFallbackChat(promptPayload.user?.id);
    }
  }
}

function cleanAndParseJson(text) {
  if (!text) throw new Error('Empty response');

  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = cleaned.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = cleaned.lastIndexOf(']');
    }

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const extracted = cleaned.substring(startIdx, endIdx + 1);
      return JSON.parse(extracted);
    }

    throw err;
  }
}

/**
 * Generate nudges — single batched Gemini call for all triggered events.
 */
async function generateNudges(triggers, user, complianceText, apiUsage) {
  if (!triggers.length) return [];

  const m = getModel();
  if (!m) {
    return triggers.map(t => getFallbackNudge(t.trigger_type));
  }

  const triggerLines = triggers.map((t, i) =>
    `${i + 1}. ${t.trigger_type}: ${t.fact_text}`
  ).join('\n');

  const prompt = `Generate short, friendly notification-style nudges for the following triggered events for ${user.name} (risk profile: ${user.risk_profile}). Return a JSON array, one object per event, each with: trigger_type (string), headline (max 8 words), body (max 25 words), cta_label (max 4 words), compliance_note (string or null).

Triggered events:
${triggerLines}

Do not suggest anything blocked by these compliance rules: ${complianceText}

Respond ONLY with a valid JSON array, no markdown, no code fences.`;

  try {
    console.log(`[Gemini] Nudge prompt for ${triggers.length} triggers`);

    const result = await m.generateContent(prompt);
    const responseText = result.response.text();
    const usage = result.response.usageMetadata;
    if (apiUsage && usage) {
      apiUsage.log(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0);
    }

    const parsed = cleanAndParseJson(responseText);
    return Array.isArray(parsed) ? parsed : [parsed];

  } catch (err) {
    console.error('[Gemini] Nudge generation error:', err.message);
    return triggers.map(t => getFallbackNudge(t.trigger_type));
  }
}

/**
 * Get fallback chat response when API is unavailable.
 */
function getFallbackChat(userId) {
  const key = String(userId);
  if (fallbacks.chat[key]) {
    return fallbacks.chat[key];
  }
  return fallbacks.chat.default;
}

/**
 * Get fallback nudge for a trigger type.
 */
function getFallbackNudge(triggerType) {
  return fallbacks.nudges[triggerType] || fallbacks.nudges.default;
}

module.exports = {
  chatWithSankalp,
  generateNudges,
  buildChatPrompt
};
