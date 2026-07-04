import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { apiUrl } from '../api';

const AVATAR_COLORS = {
  1: { bg: 'linear-gradient(135deg, #10B981, #059669)', letter: 'R' },
  2: { bg: 'linear-gradient(135deg, #F472B6, #EC4899)', letter: 'A' },
  3: { bg: 'linear-gradient(135deg, #F59E0B, #D97706)', letter: 'S' }
};

const RISK_DESCRIPTIONS = {
  Conservative: 'Prefers safe, stable investments',
  Aggressive: 'Comfortable with high-risk, high-reward',
  Moderate: 'Balanced mix of growth and safety'
};

export default function PersonaSelector({ onSelect }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl('/users'))
      .then(r => r.json())
      .then(data => { setUsers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="persona-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.2)' }} />
      </div>
    );
  }

  return (
    <div className="persona-screen">
      <div style={{ paddingTop: '12px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div className="sankalp-avatar" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>S</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>Sankalp</h1>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          AI Wealth Advisory Avatar
        </p>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginTop: '4px' }}>
          Select a profile to begin your personalized advisory session
        </p>
      </div>

      <div style={{ flex: 1 }}>
        {users.map(user => {
          const avatar = AVATAR_COLORS[user.id] || { bg: '#666', letter: '?' };
          const riskClass = `risk-${user.risk_profile.toLowerCase()}`;

          return (
            <div key={user.id} className="persona-card" onClick={() => onSelect(user.id)}>
              <div
                className="persona-avatar"
                style={{ background: avatar.bg, color: 'white' }}
              >
                {avatar.letter}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 600, color: 'white', fontSize: '0.95rem' }}>{user.name}</span>
                  <span className={`risk-badge ${riskClass}`}>{user.risk_profile}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
                  {user.age} yrs · {user.city} · ₹{(user.monthly_income / 1000).toFixed(0)}K/mo
                </div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
                  {RISK_DESCRIPTIONS[user.risk_profile]}
                </div>
              </div>
              <ChevronRight size={18} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
            </div>
          );
        })}
      </div>

      <div style={{ textAlign: 'center', paddingTop: '16px' }}>
        <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>
          IDBI Innovate 2026 · Track 01 · Hackathon Prototype
        </p>
      </div>
    </div>
  );
}
