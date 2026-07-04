import { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { apiUrl } from '../api';

export default function DemoControls({ userId, onApplied }) {
  const [user, setUser] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [goals, setGoals] = useState([]);
  const [formData, setFormData] = useState({
    savings_balance: '',
    monthly_income: '',
    risk_profile: '',
    simulate_missed_sip: false,
    simulate_spending_spike: false,
    spike_category: 'Food & Dining'
  });
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    // Fetch user + portfolio data
    Promise.all([
      fetch(apiUrl(`/users/${userId}`)).then(r => r.json()),
      fetch(apiUrl(`/portfolio/${userId}`)).then(r => r.json()),
      fetch(apiUrl(`/goals/${userId}`)).then(r => r.json()),
    ]).then(([userData, portfolioData, goalsData]) => {
      setUser(userData);
      setHoldings(portfolioData.portfolio?.holdings || []);
      setGoals(goalsData || []);
      setFormData(prev => ({
        ...prev,
        monthly_income: userData.monthly_income,
        risk_profile: userData.risk_profile,
        savings_balance: userData.savings_balance ?? ''
      }));
    }).catch(console.error);
  }, [userId]);

  const handleApply = async () => {
    setApplying(true);
    setResult(null);

    const payload = {};
    if (formData.monthly_income !== '' && formData.monthly_income !== user?.monthly_income) {
      payload.monthly_income = Number(formData.monthly_income);
    }
    if (formData.risk_profile !== user?.risk_profile) payload.risk_profile = formData.risk_profile;
    if (formData.savings_balance !== '' && formData.savings_balance !== null) {
      payload.savings_balance = Number(formData.savings_balance);
    }
    if (formData.simulate_missed_sip) payload.simulate_missed_sip = true;
    if (formData.simulate_spending_spike) {
      payload.simulate_spending_spike = true;
      payload.spike_category = formData.spike_category;
    }

    // Holdings updates
    const holdingUpdates = holdings.filter((h, i) => {
      const orig = holdings[i];
      return h._edited;
    }).map(h => ({ id: h.id, current_value: Number(h.current_value) }));
    if (holdingUpdates.length) payload.holdings = holdingUpdates;

    // Goals updates
    const goalUpdates = goals.filter(g => g._edited).map(g => ({
      id: g.id,
      current_saved: Number(g.currentSaved),
      target_amount: Number(g.targetAmount)
    }));
    if (goalUpdates.length) payload.goals = goalUpdates;

    try {
      const response = await fetch(apiUrl(`/demo/${userId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      setResult({ success: true, triggers: data.triggersDetected, nudges: data.nudges?.length || 0 });
      onApplied();
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setApplying(false);
    }
  };

  if (!user) {
    return (
      <div className="demo-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="demo-panel">
      <span className="demo-badge">
        <Wrench size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
        Demo Controls — Not a customer-facing feature
      </span>

      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#92400E', marginBottom: '4px' }}>
        Editing: {user.name}
      </h3>
      <p style={{ fontSize: '0.7rem', color: '#B45309', marginBottom: '16px' }}>
        Changes will refresh the Nudge Feed and reset chat context.
      </p>

      {/* Savings Balance */}
      <div className="demo-field">
        <label className="demo-label">Savings Account Balance (₹)</label>
        <input
          className="demo-input"
          type="number"
          placeholder="e.g. 500000"
          value={formData.savings_balance}
          onChange={e => setFormData(p => ({ ...p, savings_balance: e.target.value }))}
        />
      </div>

      {/* Monthly Income */}
      <div className="demo-field">
        <label className="demo-label">Monthly Income (₹)</label>
        <input
          className="demo-input"
          type="number"
          value={formData.monthly_income}
          onChange={e => setFormData(p => ({ ...p, monthly_income: e.target.value }))}
        />
      </div>

      {/* Risk Profile */}
      <div className="demo-field">
        <label className="demo-label">Risk Profile</label>
        <select
          className="demo-select"
          value={formData.risk_profile}
          onChange={e => setFormData(p => ({ ...p, risk_profile: e.target.value }))}
        >
          <option value="Conservative">Conservative</option>
          <option value="Moderate">Moderate</option>
          <option value="Aggressive">Aggressive</option>
        </select>
      </div>

      {/* Holdings */}
      {holdings.length > 0 && (
        <div className="demo-field">
          <label className="demo-label">Portfolio Holdings (Current Value)</label>
          <table className="demo-holdings-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Value (₹)</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h, i) => (
                <tr key={h.id}>
                  <td style={{ fontSize: '0.72rem' }}>{h.instrument_name.substring(0, 25)}</td>
                  <td>
                    <input
                      type="number"
                      value={h.current_value}
                      onChange={e => {
                        const updated = [...holdings];
                        updated[i] = { ...updated[i], current_value: e.target.value, _edited: true };
                        setHoldings(updated);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <div className="demo-field">
          <label className="demo-label">Goals</label>
          {goals.map((g, i) => (
            <div key={g.id} style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.goalName}</span>
              <input
                type="number"
                placeholder="Saved"
                value={g.currentSaved}
                onChange={e => {
                  const updated = [...goals];
                  updated[i] = { ...updated[i], currentSaved: e.target.value, _edited: true };
                  setGoals(updated);
                }}
                style={{ width: '70px', padding: '4px 6px', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'inherit' }}
              />
              <span style={{ fontSize: '0.7rem', color: '#92400E' }}>/</span>
              <input
                type="number"
                placeholder="Target"
                value={g.targetAmount}
                onChange={e => {
                  const updated = [...goals];
                  updated[i] = { ...updated[i], targetAmount: e.target.value, _edited: true };
                  setGoals(updated);
                }}
                style={{ width: '80px', padding: '4px 6px', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'inherit' }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Simulation Toggles */}
      <div className="demo-field">
        <div className="demo-toggle">
          <span className="demo-label" style={{ marginBottom: 0 }}>Simulate Missed SIP</span>
          <button
            className={`demo-switch ${formData.simulate_missed_sip ? 'active' : ''}`}
            onClick={() => setFormData(p => ({ ...p, simulate_missed_sip: !p.simulate_missed_sip }))}
          />
        </div>
      </div>

      <div className="demo-field">
        <div className="demo-toggle">
          <span className="demo-label" style={{ marginBottom: 0 }}>Simulate Spending Spike</span>
          <button
            className={`demo-switch ${formData.simulate_spending_spike ? 'active' : ''}`}
            onClick={() => setFormData(p => ({ ...p, simulate_spending_spike: !p.simulate_spending_spike }))}
          />
        </div>
        {formData.simulate_spending_spike && (
          <select
            className="demo-select"
            value={formData.spike_category}
            onChange={e => setFormData(p => ({ ...p, spike_category: e.target.value }))}
            style={{ marginTop: '6px' }}
          >
            <option>Food & Dining</option>
            <option>Entertainment</option>
            <option>Shopping</option>
            <option>Transport</option>
          </select>
        )}
      </div>

      {/* Apply Button */}
      <button className="demo-apply-btn" onClick={handleApply} disabled={applying}>
        {applying ? 'Applying...' : '⚡ Apply Changes & Refresh'}
      </button>

      {/* Result */}
      {result && (
        <div style={{
          marginTop: '12px', padding: '10px', borderRadius: '8px', fontSize: '0.78rem',
          background: result.success ? '#D1FAE5' : '#FEE2E2',
          color: result.success ? '#065F46' : '#991B1B'
        }}>
          {result.success
            ? `✅ Updated! ${result.triggers} trigger(s) detected, ${result.nudges} nudge(s) generated.`
            : `❌ Error: ${result.error}`}
        </div>
      )}
    </div>
  );
}
