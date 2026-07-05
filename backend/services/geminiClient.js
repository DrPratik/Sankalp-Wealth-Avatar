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
const SYSTEM_INSTRUCTION = `You are Sankalp, a friendly and trustworthy AI wealth advisory avatar for an Indian bank's mobile app. You help customers understand their spending, savings balance, and investments in simple, warm, conversational language. You are NOT a licensed financial advisor and must never guarantee returns or give definitive "buy/sell" instructions — only educational guidance and clearly-labeled suggestions.

Respond in the user's preferred language. If the user prefers Hindi, reply in Hindi; if Marathi, reply in Marathi; otherwise reply in English. Keep responses under 80 words unless the user asks for detail.

If the user wants to manage their financial goals (create, update, delete, or complete), identify their intent and parameters from natural language variations, and output a structured "goal_action" object in the JSON response to synchronize with the database and UI.

Goals Management Rules:
1. "create" goal: Name must not be empty. Target amount must be positive. Target date must be in the future (YYYY-MM-DD format).
2. "update" goal: Map the request to the correct Goal ID from the active goals list. You can update name, targetAmount, currentSaved (adding or setting funds), or targetDate.
3. "delete" goal: Map the request to the correct Goal ID. If it is a critical goal (e.g. containing "emergency", "retirement", "medical") and the user hasn't explicitly confirmed their absolute decision yet in the conversation summary/current message, warn them of the implications first and ask: "Are you sure you want to delete this goal?" Do NOT output the goal_action yet. If they confirm (e.g., say "yes", "confirm", "do it"), output the delete action. If it is not a critical goal, delete it directly without asking for confirmation.
4. "complete" goal: Mark a goal as completed (e.g., set currentSaved equal to targetAmount, or map to a complete action).

Respond ONLY in valid JSON matching this schema, with no markdown formatting, no code fences, no extra text:

{
  "reply": "string - the conversational response to show the user",
  "tone": "string - one of: encouraging, cautionary, neutral, celebratory",
  "suggested_action": "string or null - a short actionable next step if relevant",
  "compliance_note": "string or null - a short disclaimer if the reply touches on investment products",
  "goal_action": {
    "type": "string or null - one of: 'create', 'update', 'delete', 'complete'",
    "goalId": "number or null - required for update, delete, complete",
    "goalName": "string or null - name of the goal",
    "targetAmount": "number or null - target amount",
    "currentSaved": "number or null - current saved amount",
    "targetDate": "string (YYYY-MM-DD) or null - target date"
  }
}`;

/**
 * Build the user-turn prompt for a chat interaction.
 */
function buildChatPrompt({ user, portfolioSummary, spendingSummary, goals, complianceText, conversationSummary, userMessage, preferredLanguage = 'en', dashboardInsights = [], wellnessScore = null, nextBestActions = [], riskAdjustedRecommendations = [], monthChangeAnalysis = [] }) {
  const goalLines = goals.map(g =>
    `Goal ID: ${g.id} | Name: ${g.goalName} | Saved: ₹${g.currentSaved} | Target: ₹${g.targetAmount} | Progress: ${g.progressPct}% | Target Date: ${g.targetDate}`
  ).join('\n');

  const spendingLines = spendingSummary.categories.slice(0, 3).map(c =>
    `${c.name}: ₹${c.currentMonth.toLocaleString('en-IN')} this month${c.changePct !== 0 ? ` (${c.changePct > 0 ? '+' : ''}${c.changePct}% vs avg)` : ''}`
  ).join('. ');

  const sipLine = spendingSummary.sipStatus?.message || '';
  const languageLabel = preferredLanguage === 'hi' ? 'Hindi' : preferredLanguage === 'mr' ? 'Marathi' : 'English';

  return `User profile: ${user.name}, age ${user.age}, risk profile: ${user.risk_profile}, monthly income: ₹${user.monthly_income.toLocaleString('en-IN')}, savings account balance: ₹${(user.savings_balance || 0).toLocaleString('en-IN')}

Portfolio summary: Total value ₹${portfolioSummary.totalValue.toLocaleString('en-IN')}, allocated ${portfolioSummary.allocationPct.Equity || 0}% equity / ${portfolioSummary.allocationPct.Debt || 0}% debt / ${portfolioSummary.allocationPct.Gold || 0}% gold / ${portfolioSummary.allocationPct.Hybrid || 0}% hybrid. Overall gain: ${portfolioSummary.gainLossPct}%. Risk alignment: ${portfolioSummary.riskAlignment}.

Recent spending pattern: ${spendingLines}. ${sipLine}

Active goals: ${goalLines || 'None'}

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
    const parsed = JSON.parse(responseText);
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
      return JSON.parse(responseText);
    } catch (retryErr) {
      console.error('[Gemini] Retry failed:', retryErr.message);
      return getFallbackChat(promptPayload.user?.id);
    }
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

    const parsed = JSON.parse(responseText);
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
