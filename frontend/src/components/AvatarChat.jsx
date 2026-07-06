import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, ShieldCheck } from 'lucide-react';
import { apiUrl } from '../api';

const QUICK_REPLIES = [
  "How's my portfolio doing?",
  "Can I afford my goal?",
  "Should I increase my SIP?",
  "Analyze my spending",
];

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिंदी' },
  { value: 'mr', label: 'मराठी' }
];

function detectLanguage(text) {
  return /[ऀ-ॿ]/.test(text) ? 'hi' : 'en';
}

function shouldShowContextCards(text) {
  const normalized = (text || '').toLowerCase();
  return /(portfolio|risk|allocation|sip|spending|goal|wellness|invest|expense|income|balance|insurance|recommend|save|afford|track)/.test(normalized);
}

export default function AvatarChat({ userId, conversationSummary, setConversationSummary, onBack, onOpenGoals, onOpenPortfolio, onGoalsUpdated }) {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: "Hi! I'm Sankalp, your AI wealth advisor. I can help with portfolio health, SIP planning, spending insights, and goal tracking. What would you like to know?",
      tone: 'encouraging',
      complianceChecked: true,
      action_buttons: [
        "How's my portfolio doing?",
        "Can I afford my goal?",
        "Analyze my spending"
      ]
    }
  ]);
  const [input, setInput] = useState('');
  const [language, setLanguage] = useState('en');
  const [advisorCards, setAdvisorCards] = useState([]);
  const [dashboardInsights, setDashboardInsights] = useState([]);
  const [wellnessScore, setWellnessScore] = useState(null);
  const [nextBestActions, setNextBestActions] = useState([]);
  const [riskAdjustedRecommendations, setRiskAdjustedRecommendations] = useState([]);
  const [monthChangeAnalysis, setMonthChangeAnalysis] = useState([]);
  const [goalAction, setGoalAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const turnCount = useRef(0);
  const contextCardsShownRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  useEffect(() => {
    // Proactively scan active nudges to personalize welcome greeting
    fetch(apiUrl(`/nudges/${userId}`))
      .then(res => res.json())
      .then(data => {
        if (data.nudges && data.nudges.length > 0) {
          const highPriority = data.nudges.find(n => ['missed_sip', 'idle_balance', 'goal_offtrack'].includes(n.trigger_type)) || data.nudges[0];
          setMessages(prev => {
            const copy = [...prev];
            if (copy.length === 1 && copy[0].role === 'ai') {
              copy[0].text = `Hi! I'm Sankalp, your AI wealth advisor. I noticed an alert: "${highPriority.headline}". ${highPriority.body} Would you like to review this now?`;
              copy[0].action_buttons = [
                highPriority.cta_label || "Review Alert",
                "How's my portfolio doing?",
                "Can I afford my goal?"
              ];
            }
            return copy;
          });
        }
      })
      .catch(err => console.error("[Welcome Nudges] Fetch error:", err));
  }, [userId]);

  const handleSend = useCallback(async (textOverride = null) => {
    const textToSend = (textOverride || input).trim();
    if (!textToSend || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setGoalAction(null);
    setInput('');
    setIsLoading(true);
    turnCount.current++;

    try {
      const resolvedLanguage = detectLanguage(textToSend) === 'hi' ? 'hi' : language;
      setLanguage(resolvedLanguage);

      const response = await fetch(apiUrl('/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          message: textToSend,
          conversationSummary,
          preferredLanguage: resolvedLanguage
        })
      });

      const data = await response.json();
      const replyText = data.reply || "I'm here to help!";
      const showContextCards = shouldShowContextCards(textToSend);

      if (showContextCards && !contextCardsShownRef.current) {
        setAdvisorCards(data.advisorCards || []);
        setDashboardInsights(data.dashboardInsights || []);
        setWellnessScore(data.wellnessScore || null);
        setNextBestActions(data.nextBestActions || []);
        setRiskAdjustedRecommendations(data.riskAdjustedRecommendations || []);
        setMonthChangeAnalysis(data.monthChangeAnalysis || []);
        contextCardsShownRef.current = true;
      } else if (!contextCardsShownRef.current) {
        setAdvisorCards([]);
        setDashboardInsights([]);
        setWellnessScore(null);
        setNextBestActions([]);
        setRiskAdjustedRecommendations([]);
        setMonthChangeAnalysis([]);
      }

      setGoalAction(data.goalAction || null);
      if ((data.goalsUpdated || data.balanceUpdated || data.portfolioUpdated) && onGoalsUpdated) {
        onGoalsUpdated();
      }
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingText('');

      // Contextual check to display widgets only when relevant
      const textLower = textToSend.toLowerCase();
      const showPortfolio = /(portfolio|allocation|balance)/.test(textLower);
      const showWellness = /(wellness|score|health)/.test(textLower);
      const showSpending = /(spending|expense|groceries|dining|utilities|transport|month|change|pattern)/.test(textLower);
      const showRecommendations = /(recommend|suggest|risk)/.test(textLower);
      const showGoalConflict = /(goal|saving|conflict|budget|afford|sip)/.test(textLower);

      setMessages(prev => [...prev, {
        role: 'ai',
        text: replyText,
        tone: data.tone,
        suggested_action: data.suggested_action,
        compliance_note: data.compliance_note,
        action_buttons: data.action_buttons,
        complianceChecked: data.complianceChecked,
        // Context-aware inline rich widgets
        dashboardInsights: showPortfolio ? (data.dashboardInsights || []) : [],
        wellnessScore: showWellness ? (data.wellnessScore || null) : null,
        nextBestActions: showSpending ? (data.nextBestActions || []) : [],
        riskAdjustedRecommendations: showRecommendations ? (data.riskAdjustedRecommendations || []) : [],
        monthChangeAnalysis: showSpending ? (data.monthChangeAnalysis || []) : [],
        goalAction: data.goalAction || null, // Always show if action was performed
        goalConflicts: showGoalConflict ? (data.goalConflicts || null) : null
      }]);

      // Update rolling conversation summary on every turn (keep the last 4 messages to preserve context)
      const allMessages = [...messages, { role: 'user', text: textToSend }, { role: 'ai', text: replyText }];
      const lastFew = allMessages.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Sankalp'}: ${m.text}`).join(' | ');
      const truncated = lastFew.length > 500 ? lastFew.substring(lastFew.length - 500) : lastFew;
      setConversationSummary(truncated);

    } catch (err) {
      setIsLoading(false);
      if (!contextCardsShownRef.current) {
        setDashboardInsights([]);
        setWellnessScore(null);
        setNextBestActions([]);
        setRiskAdjustedRecommendations([]);
        setMonthChangeAnalysis([]);
      }
      setGoalAction(null);
      setMessages(prev => [...prev, {
        role: 'ai',
        text: "Sankalp AI is temporarily unavailable due to a connection issue. Please try again shortly, or select below to connect with a human relationship manager.",
        tone: 'neutral',
        action_buttons: ["Connect to Human Support", "Try again"],
        complianceChecked: false
      }]);
    }
  }, [input, isLoading, userId, conversationSummary, messages, setConversationSummary]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-screen">
      {/* Header */}
      <div className="chat-header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-primary)', padding: '4px' }}>
          <ArrowLeft size={20} />
        </button>
        <div className="sankalp-avatar-small">S</div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>Sankalp</p>
          <p style={{ fontSize: '0.68rem', color: isLoading ? 'var(--color-accent-teal)' : 'var(--color-text-secondary)' }}>
            {isLoading ? 'Analyzing...' : 'AI Wealth Advisor'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.map((msg, idx) => {
          const isLast = idx === messages.length - 1;
          return (
            <div key={idx} style={{ marginBottom: '12px' }}>
              <div className={`chat-bubble-wrapper ${msg.role}`}>
                {msg.role === 'ai' && <div className="sankalp-avatar-small" style={{ width: '26px', height: '26px', fontSize: '0.55rem' }}>S</div>}
                <div>
                  <div className={`chat-bubble ${msg.role}`}>
                    {msg.text}
                  </div>
                  {msg.role === 'ai' && msg.complianceChecked && (
                    <div className="compliance-badge" title="This response was checked against your risk profile and eligibility.">
                      <ShieldCheck size={10} />
                      <span>Compliance verified</span>
                    </div>
                  )}
                  {msg.role === 'ai' && msg.suggested_action && (
                    <div className="suggested-action">💡 {msg.suggested_action}</div>
                  )}
                  {msg.role === 'ai' && msg.compliance_note && (
                    <p className="compliance-note-inline">{msg.compliance_note}</p>
                  )}
                </div>
              </div>
              
              {/* Inline Rich Widgets per AI message */}
              {msg.role === 'ai' && (
                <div style={{ padding: '4px 0 8px 34px', display: 'grid', gap: '8px', maxWidth: '85%' }}>
                  {msg.wellnessScore && (
                    <div style={{ border: '1px solid rgba(45, 212, 191, 0.25)', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.16), rgba(14, 165, 233, 0.12))', padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>Financial Wellness Score</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '2px' }}>{msg.wellnessScore.score}/100</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{msg.wellnessScore.label}</div>
                    </div>
                  )}

                  {msg.dashboardInsights && msg.dashboardInsights.length > 0 && (
                    <div style={{ display: 'grid', gap: '6px', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
                      {msg.dashboardInsights.map((insight) => (
                        <div key={insight.title} style={{ border: '1px solid rgba(45, 212, 191, 0.2)', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', padding: '10px 12px' }}>
                          <div style={{ fontSize: '0.66rem', color: 'var(--color-text-secondary)' }}>{insight.title}</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '2px' }}>{insight.value}</div>
                          <div style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{insight.hint}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.nextBestActions && msg.nextBestActions.length > 0 && (
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {msg.nextBestActions.map((action) => (
                        <div key={action.title} style={{ border: '1px solid rgba(45, 212, 191, 0.2)', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', padding: '10px 12px' }}>
                          <div style={{ fontSize: '0.74rem', fontWeight: 700 }}>{action.title}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{action.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.riskAdjustedRecommendations && msg.riskAdjustedRecommendations.length > 0 && (
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {msg.riskAdjustedRecommendations.map((rec) => (
                        <div key={rec.title} style={{ border: '1px solid rgba(14, 165, 233, 0.2)', borderRadius: '12px', background: 'rgba(14, 165, 233, 0.08)', padding: '10px 12px' }}>
                          <div style={{ fontSize: '0.74rem', fontWeight: 700 }}>{rec.title}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{rec.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.monthChangeAnalysis && msg.monthChangeAnalysis.length > 0 && (
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {msg.monthChangeAnalysis.map((item) => (
                        <div key={item.title} style={{ border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: '12px', background: 'rgba(251, 191, 36, 0.08)', padding: '10px 12px' }}>
                          <div style={{ fontSize: '0.74rem', fontWeight: 700 }}>{item.title}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.goalAction && (
                    <div style={{ border: '1px solid rgba(45, 212, 191, 0.25)', borderRadius: '12px', background: 'rgba(45, 212, 191, 0.12)', padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                        {msg.goalAction.type === 'create' ? 'Goal Created' : msg.goalAction.type === 'delete' ? 'Goal Deleted' : 'Goal Updated'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                        {msg.goalAction.goalName || 'Goal'}
                        {msg.goalAction.targetAmount !== undefined && msg.goalAction.targetAmount !== null && ` • ₹${Number(msg.goalAction.targetAmount).toLocaleString('en-IN')}`}
                      </div>
                    </div>
                  )}

                  {/* Goal Conflict Interactive Resolver */}
                  {msg.goalConflicts && msg.goalConflicts.hasConflict && (
                    <div style={{ border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.08)', padding: '10px 12px' }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--color-danger)' }}>⚠️ Goal Planning Conflict</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                        {msg.goalConflicts.conflicts[0]}
                      </div>
                      {isLast && (
                        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                          <button
                            onClick={() => handleSend("Extend my goal target dates by 6 months")}
                            style={{ flex: 1, padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, border: '1px solid var(--color-danger)', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-danger)', cursor: 'pointer' }}
                          >
                            Extend Target Dates
                          </button>
                          <button
                            onClick={() => handleSend("Connect to human relationship manager")}
                            style={{ flex: 1, padding: '6px 8px', fontSize: '0.7rem', fontWeight: 700, border: '1px solid var(--color-text-secondary)', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
                          >
                            Talk to Advisor
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {msg.role === 'ai' && msg.action_buttons && msg.action_buttons.length > 0 && (
                <div className="chat-action-buttons-container">
                  {msg.action_buttons.map((btnText, btnIdx) => (
                    <button
                      key={btnIdx}
                      className="chat-action-btn"
                      onClick={() => handleSend(btnText)}
                      disabled={isLoading || isStreaming || !isLast}
                    >
                      {btnText}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {(onOpenGoals || onOpenPortfolio) && (
          <div style={{ padding: '0 0 8px', display: 'flex', gap: '8px' }}>
            {onOpenPortfolio && (
              <button
                onClick={onOpenPortfolio}
                style={{ flex: 1, border: '1px solid rgba(45, 212, 191, 0.25)', borderRadius: '999px', background: 'rgba(45, 212, 191, 0.12)', color: 'var(--color-text-primary)', padding: '8px 10px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Open Portfolio
              </button>
            )}
            {onOpenGoals && (
              <button
                onClick={onOpenGoals}
                style={{ flex: 1, border: '1px solid rgba(14, 165, 233, 0.25)', borderRadius: '999px', background: 'rgba(14, 165, 233, 0.12)', color: 'var(--color-text-primary)', padding: '8px 10px', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Open Goals
              </button>
            )}
          </div>
        )}

        {/* Streaming text */}
        {isStreaming && (
          <div className="chat-bubble-wrapper ai">
            <div className="sankalp-avatar-small" style={{ width: '26px', height: '26px', fontSize: '0.55rem' }}>S</div>
            <div className={`chat-bubble ai streaming-cursor`}>
              {streamingText}
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isLoading && !isStreaming && (
          <div className="chat-bubble-wrapper ai">
            <div className="sankalp-avatar-small" style={{ width: '26px', height: '26px', fontSize: '0.55rem' }}>S</div>
            <div className="typing-indicator">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Chips */}
      {messages.length <= 2 && (
        <div className="quick-chips" style={{ padding: '4px 16px 0' }}>
          {QUICK_REPLIES.map((q, i) => (
            <button key={i} className="quick-chip" onClick={() => handleSend(q)} disabled={isLoading}>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="chat-input-area">
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ border: '1px solid rgba(45, 212, 191, 0.25)', borderRadius: '999px', background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-primary)', padding: '6px 10px', fontSize: '0.72rem' }}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>Reply language</span>
        </div>
        <div className="chat-input-wrapper">
          <input
            className="chat-input"
            type="text"
            placeholder={language === 'hi' ? 'Sankalp से पूछें...' : language === 'mr' ? 'Sankalp ला विचारा...' : 'Ask Sankalp anything...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading || isStreaming}
          />
          <button
            className="chat-send-btn"
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading || isStreaming}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
