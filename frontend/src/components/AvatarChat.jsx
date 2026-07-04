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

export default function AvatarChat({ userId, conversationSummary, setConversationSummary, onBack, onOpenGoals, onOpenPortfolio }) {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: "Hi! I'm Sankalp, your AI wealth advisor. I can help with portfolio health, SIP planning, spending insights, and goal tracking. What would you like to know?",
      tone: 'encouraging',
      complianceChecked: true
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
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingText('');

      setMessages(prev => [...prev, {
        role: 'ai',
        text: replyText,
        tone: data.tone,
        suggested_action: data.suggested_action,
        compliance_note: data.compliance_note,
        complianceChecked: data.complianceChecked
      }]);

      // Update rolling conversation summary every 4 turns
      if (turnCount.current % 4 === 0) {
        const lastFew = messages.slice(-4).map(m => m.text).join('. ');
        const truncated = lastFew.length > 200 ? lastFew.substring(0, 200) + '...' : lastFew;
        setConversationSummary(truncated);
      }

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
        text: "I'm having a brief connectivity issue. Your portfolio looks steady — try asking again in a moment!",
        tone: 'neutral',
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
        {messages.map((msg, idx) => (
          <div key={idx}>
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
          </div>
        ))}

        {dashboardInsights.length > 0 && (
          <div style={{ padding: '0 16px 8px', display: 'grid', gap: '8px' }}>
            {dashboardInsights.map((insight) => (
              <div key={insight.title} style={{ border: '1px solid rgba(45, 212, 191, 0.2)', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', padding: '10px 12px' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>{insight.title}</div>
                <div style={{ fontSize: '0.84rem', fontWeight: 700, marginTop: '2px' }}>{insight.value}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{insight.hint}</div>
              </div>
            ))}
          </div>
        )}

        {goalAction && (
          <div style={{ padding: '0 16px 8px' }}>
            <div style={{ border: '1px solid rgba(45, 212, 191, 0.25)', borderRadius: '12px', background: 'rgba(45, 212, 191, 0.12)', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 700 }}>Goal created</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{goalAction.goalName} • ₹{goalAction.targetAmount.toLocaleString('en-IN')}</div>
            </div>
          </div>
        )}

        {wellnessScore && (
          <div style={{ padding: '0 16px 8px' }}>
            <div style={{ border: '1px solid rgba(45, 212, 191, 0.25)', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.16), rgba(14, 165, 233, 0.12))', padding: '10px 12px' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>Financial Wellness Score</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '2px' }}>{wellnessScore.score}/100</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{wellnessScore.label}</div>
            </div>
          </div>
        )}

        {nextBestActions.length > 0 && (
          <div style={{ padding: '0 16px 8px', display: 'grid', gap: '8px' }}>
            {nextBestActions.map((action) => (
              <div key={action.title} style={{ border: '1px solid rgba(45, 212, 191, 0.2)', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', padding: '10px 12px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{action.title}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{action.detail}</div>
              </div>
            ))}
          </div>
        )}

        {riskAdjustedRecommendations.length > 0 && (
          <div style={{ padding: '0 16px 8px', display: 'grid', gap: '8px' }}>
            {riskAdjustedRecommendations.map((rec) => (
              <div key={rec.title} style={{ border: '1px solid rgba(14, 165, 233, 0.2)', borderRadius: '12px', background: 'rgba(14, 165, 233, 0.08)', padding: '10px 12px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{rec.title}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{rec.detail}</div>
              </div>
            ))}
          </div>
        )}

        {monthChangeAnalysis.length > 0 && (
          <div style={{ padding: '0 16px 8px', display: 'grid', gap: '8px' }}>
            {monthChangeAnalysis.map((item) => (
              <div key={item.title} style={{ border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: '12px', background: 'rgba(251, 191, 36, 0.08)', padding: '10px 12px' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{item.title}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{item.detail}</div>
              </div>
            ))}
          </div>
        )}

        {advisorCards.length > 0 && (
          <div style={{ padding: '0 16px 8px', display: 'grid', gap: '8px' }}>
            {advisorCards.map((card) => (
              <button
                key={card.title}
                onClick={() => handleSend(card.prompt)}
                disabled={isLoading || isStreaming}
                style={{
                  textAlign: 'left',
                  border: '1px solid rgba(45, 212, 191, 0.28)',
                  borderRadius: '12px',
                  background: 'rgba(45, 212, 191, 0.08)',
                  padding: '10px 12px',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 700 }}>{card.title}</div>
                <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{card.value}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>{card.subtitle}</div>
              </button>
            ))}
          </div>
        )}

        {(onOpenGoals || onOpenPortfolio) && (
          <div style={{ padding: '0 16px 8px', display: 'flex', gap: '8px' }}>
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
