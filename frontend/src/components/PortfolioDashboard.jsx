import { useState, useEffect } from 'react';
import { LogOut, TrendingUp, TrendingDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import NudgeFeed from './NudgeFeed';

const ALLOC_COLORS = { Equity: '#3B82F6', Debt: '#10B981', Hybrid: '#8B5CF6', Gold: '#F59E0B' };

export default function PortfolioDashboard({ userId, nudgeRefreshKey, onOpenChat, onSwitchPersona }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/portfolio/${userId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId, nudgeRefreshKey]);

  if (loading || !data) {
    return (
      <div className="dashboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="spinner" />
      </div>
    );
  }

  const { user, portfolio, spending } = data;
  const isGain = portfolio.gainLoss >= 0;

  // Pie chart data
  const pieData = Object.entries(portfolio.allocationPct)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, color: ALLOC_COLORS[name] || '#94A3B8' }));

  // Time-of-day greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="dashboard">
      {/* Greeting */}
      <div className="greeting-section">
        <div className="sankalp-avatar">S</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{greeting}, {user.name.split(' ')[0]}!</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Here's your financial snapshot</p>
        </div>
        <button
          onClick={onSwitchPersona}
          style={{
            background: 'none', border: '1px solid var(--color-border)', borderRadius: '8px',
            padding: '6px 8px', cursor: 'pointer', color: 'var(--color-text-secondary)',
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem'
          }}
          title="Switch persona"
        >
          <LogOut size={14} />
        </button>
      </div>

      {/* Portfolio Card */}
      <div className="portfolio-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '4px' }}>Total Portfolio Value</p>
            <p style={{ fontSize: '1.6rem', fontWeight: 700 }}>₹{portfolio.totalValue.toLocaleString('en-IN')}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
              {isGain ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span style={{ fontSize: '0.8rem', color: isGain ? '#A7F3D0' : '#FCA5A5' }}>
                {isGain ? '+' : ''}₹{portfolio.gainLoss.toLocaleString('en-IN')} ({portfolio.gainLossPct}%)
              </span>
            </div>
          </div>
          {/* Mini Pie */}
          <div style={{ width: 70, height: 70 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={20} outerRadius={32} paddingAngle={3} stroke="none">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Allocation Grid */}
        <div className="allocation-grid">
          {pieData.map(item => (
            <div key={item.name} className="alloc-item">
              <span className="alloc-dot" style={{ background: item.color }} />
              <span>{item.name} {item.value}%</span>
            </div>
          ))}
        </div>

        {/* Risk alignment */}
        <div style={{
          marginTop: '12px', padding: '6px 10px', borderRadius: '8px', fontSize: '0.72rem',
          background: portfolio.riskAlignment === 'aligned'
            ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: portfolio.riskAlignment === 'aligned' ? '#A7F3D0' : '#FCA5A5'
        }}>
          {portfolio.riskAlignment === 'aligned'
            ? `✓ Aligned with your ${user.riskProfile} risk profile`
            : `⚠ Allocation may not match your ${user.riskProfile} risk profile`}
        </div>
      </div>

      {/* Spending Insight */}
      {spending.anomalies?.length > 0 && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '12px',
          padding: '12px 14px', marginBottom: '16px', fontSize: '0.8rem', color: '#92400E',
          display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          <span style={{ fontSize: '1.1rem' }}>📊</span>
          <span>{spending.anomalies[0]}</span>
        </div>
      )}

      {/* Nudge Feed */}
      <NudgeFeed userId={userId} refreshKey={nudgeRefreshKey} />
    </div>
  );
}
