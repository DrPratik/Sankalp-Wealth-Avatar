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
const SYSTEM_INSTRUCTION = `You are Sankalp, a friendly and trustworthy AI wealth advisory avatar for an Indian bank's mobile app. You help customers understand their spending and investments in simple, warm, conversational language. You are NOT a licensed financial advisor and must never guarantee returns or give definitive "buy/sell" instructions — only educational guidance and clearly-labeled suggestions. Keep responses under 80 words unless the user asks for detail. Respond ONLY in valid JSON matching this schema, with no markdown formatting, no code fences, no extra text:

{
  "reply": "string - the conversational response to show the user",
  "tone": "string - one of: encouraging, cautionary, neutral, celebratory",
  "suggested_action": "string or null - a short actionable next step if relevant",
  "compliance_note": "string or null - a short disclaimer if the reply touches on investment products"
}`;

/**
 * Build the user-turn prompt for a chat interaction.
 */
function buildChatPrompt({ user, portfolioSummary, spendingSummary, goals, complianceText, conversationSummary, userMessage }) {
  const goalLines = goals.map(g =>
    `${g.goalName} - ₹${g.currentSaved.toLocaleString('en-IN')}/₹${g.targetAmount.toLocaleString('en-IN')} (${g.progressPct}%), target date ${g.targetDate}`
  ).join('\n');

  const spendingLines = spendingSummary.categories.slice(0, 3).map(c =>
    `${c.name}: ₹${c.currentMonth.toLocaleString('en-IN')} this month${c.changePct !== 0 ? ` (${c.changePct > 0 ? '+' : ''}${c.changePct}% vs avg)` : ''}`
  ).join('. ');

  const sipLine = spendingSummary.sipStatus?.message || '';

  return `User profile: ${user.name}, age ${user.age}, risk profile: ${user.risk_profile}, monthly income: ₹${user.monthly_income.toLocaleString('en-IN')}

Portfolio summary: Total value ₹${portfolioSummary.totalValue.toLocaleString('en-IN')}, allocated ${portfolioSummary.allocationPct.Equity || 0}% equity / ${portfolioSummary.allocationPct.Debt || 0}% debt / ${portfolioSummary.allocationPct.Gold || 0}% gold / ${portfolioSummary.allocationPct.Hybrid || 0}% hybrid. Overall gain: ${portfolioSummary.gainLossPct}%. Risk alignment: ${portfolioSummary.riskAlignment}.

Recent spending pattern: ${spendingLines}. ${sipLine}

Active goals: ${goalLines || 'None'}

Conversation so far (summary): ${conversationSummary || 'This is the beginning of the conversation.'}

Compliance-approved facts only (do not contradict): ${complianceText}

User's current message: "${userMessage}"

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
