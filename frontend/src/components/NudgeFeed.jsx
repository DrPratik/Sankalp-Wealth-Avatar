import { useState, useEffect, useCallback } from 'react';
import { Sparkles, PiggyBank, Target, TrendingDown, AlertTriangle, ShieldCheck, X, CreditCard } from 'lucide-react';
import { apiUrl } from '../api';

const TRIGGER_ICONS = {
  idle_balance: { icon: PiggyBank, bg: '#DBEAFE', color: '#2563EB' },
  missed_sip: { icon: AlertTriangle, bg: '#FEE2E2', color: '#DC2626' },
  goal_milestone: { icon: Target, bg: '#D1FAE5', color: '#059669' },
  goal_offtrack: { icon: Target, bg: '#FEF3C7', color: '#D97706' },
  spending_spike: { icon: TrendingDown, bg: '#FCE7F3', color: '#DB2777' },
  cross_sell: { icon: ShieldCheck, bg: '#E0E7FF', color: '#4F46E5' },
  general: { icon: CreditCard, bg: '#F1F5F9', color: '#64748B' }
};

export default function NudgeFeed({ userId, refreshKey }) {
  const [nudges, setNudges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(new Set());

  const fetchNudges = useCallback(() => {
    setLoading(true);
    fetch(apiUrl(`/nudges/${userId}`))
      .then(r => r.json())
      .then(data => {
        setNudges(data.nudges || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    fetchNudges();
  }, [fetchNudges, refreshKey]);

  const handleDismiss = (nudgeId) => {
    setDismissing(prev => new Set([...prev, nudgeId]));
    setTimeout(() => {
      setNudges(prev => prev.filter(n => n.id !== nudgeId));
      setDismissing(prev => {
        const next = new Set(prev);
        next.delete(nudgeId);
        return next;
      });
    }, 300);

    // Fire and forget dismiss API call
    fetch(apiUrl(`/nudges/${nudgeId}/dismiss`), { method: 'POST' }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="nudge-section">
        <div className="nudge-section-header">
          <Sparkles size={16} style={{ color: 'var(--color-accent-gold)' }} />
          <span>For You</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (nudges.length === 0) {
    return (
      <div className="nudge-section">
        <div className="nudge-section-header">
          <Sparkles size={16} style={{ color: 'var(--color-accent-gold)' }} />
          <span>For You</span>
        </div>
        <div style={{
          textAlign: 'center', padding: '20px', color: 'var(--color-text-secondary)',
          fontSize: '0.82rem', background: 'var(--color-surface-card)',
          border: '1px solid var(--color-border)', borderRadius: '14px'
        }}>
          ✨ All clear! No new insights right now.
        </div>
      </div>
    );
  }

  return (
    <div className="nudge-section">
      <div className="nudge-section-header">
        <Sparkles size={16} style={{ color: 'var(--color-accent-gold)' }} />
        <span>For You</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
          {nudges.length} insight{nudges.length !== 1 ? 's' : ''}
        </span>
      </div>

      {nudges.map((nudge, idx) => {
        const trigger = TRIGGER_ICONS[nudge.trigger_type] || TRIGGER_ICONS.general;
        const IconComponent = trigger.icon;
        const isDismissing = dismissing.has(nudge.id);

        return (
          <div
            key={nudge.id || idx}
            className={`nudge-card ${isDismissing ? 'dismissing' : ''}`}
            style={{ animationDelay: `${idx * 0.08}s` }}
          >
            <div className="nudge-icon" style={{ background: trigger.bg }}>
              <IconComponent size={18} style={{ color: trigger.color }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: '20px' }}>
              <p style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: '2px', color: 'var(--color-text-primary)' }}>
                {nudge.headline}
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                {nudge.body}
              </p>
              {nudge.cta_label && (
                <button className="nudge-cta" style={{ background: trigger.bg, color: trigger.color }}>
                  {nudge.cta_label}
                </button>
              )}
              {nudge.compliance_note && (
                <p className="nudge-compliance">{nudge.compliance_note}</p>
              )}
            </div>
            <button className="nudge-dismiss" onClick={() => handleDismiss(nudge.id)} title="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
