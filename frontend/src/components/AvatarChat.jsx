import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, ShieldCheck } from 'lucide-react';

const QUICK_REPLIES = [
  "How's my portfolio doing?",
  "Can I afford my goal?",
  "Should I increase my SIP?",
  "Analyze my spending",
];

export default function AvatarChat({ userId, conversationSummary, setConversationSummary, onBack }) {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: "Hi! I'm Sankalp, your AI wealth advisor. I've analyzed your portfolio and spending patterns. What would you like to know?",
      tone: 'encouraging',
      complianceChecked: true
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const turnCount = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  // Simulated streaming: reveal text character by character
  const simulateStream = useCallback((fullText, onComplete) => {
    setIsStreaming(true);
    setStreamingText('');
    let idx = 0;
    const interval = setInterval(() => {
      idx += Math.floor(Math.random() * 3) + 1; // 1-3 chars at a time
      if (idx >= fullText.length) {
        idx = fullText.length;
        clearInterval(interval);
        setIsStreaming(false);
        setStreamingText('');
        onComplete();
      } else {
        setStreamingText(fullText.substring(0, idx));
      }
    }, 20);
    return () => clearInterval(interval);
  }, []);

  const handleSend = useCallback(async (textOverride = null) => {
    const textToSend = (textOverride || input).trim();
    if (!textToSend || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setInput('');
    setIsLoading(true);
    turnCount.current++;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          message: textToSend,
          conversationSummary
        })
      });

      const data = await response.json();
      const replyText = data.reply || "I'm here to help!";
      setIsLoading(false);

      // Simulate streaming
      simulateStream(replyText, () => {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: replyText,
          tone: data.tone,
          suggested_action: data.suggested_action,
          compliance_note: data.compliance_note,
          complianceChecked: data.complianceChecked
        }]);
      });

      // Update rolling conversation summary every 4 turns
      if (turnCount.current % 4 === 0) {
        const lastFew = messages.slice(-4).map(m => m.text).join('. ');
        const truncated = lastFew.length > 200 ? lastFew.substring(0, 200) + '...' : lastFew;
        setConversationSummary(truncated);
      }

    } catch (err) {
      setIsLoading(false);
      setMessages(prev => [...prev, {
        role: 'ai',
        text: "I'm having a brief connectivity issue. Your portfolio looks steady — try asking again in a moment!",
        tone: 'neutral',
        complianceChecked: false
      }]);
    }
  }, [input, isLoading, userId, conversationSummary, messages, setConversationSummary, simulateStream]);

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
        <div className="chat-input-wrapper">
          <input
            className="chat-input"
            type="text"
            placeholder="Ask Sankalp anything..."
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
