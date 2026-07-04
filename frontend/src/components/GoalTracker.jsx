import { useState, useEffect, useCallback } from 'react';
import { Target, TrendingUp, AlertCircle, PartyPopper, Plus, Trash2, Edit3, Check, X, Coins } from 'lucide-react';

export default function GoalTracker({ userId }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [isAdding, setIsAdding] = useState(false);
  const [newGoal, setNewGoal] = useState({
    goalName: '',
    targetAmount: '',
    currentSaved: '',
    targetDate: ''
  });

  // Edit states
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [editFields, setEditFields] = useState({
    goalName: '',
    targetAmount: '',
    currentSaved: '',
    targetDate: ''
  });

  const fetchGoals = useCallback(() => {
    setLoading(true);
    fetch(`/api/goals/${userId}`)
      .then(r => r.json())
      .then(data => { setGoals(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!newGoal.goalName || !newGoal.targetAmount || !newGoal.targetDate) return;

    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          goalName: newGoal.goalName,
          targetAmount: Number(newGoal.targetAmount),
          currentSaved: Number(newGoal.currentSaved || 0),
          targetDate: newGoal.targetDate
        })
      });

      if (res.ok) {
        setIsAdding(false);
        setNewGoal({ goalName: '', targetAmount: '', currentSaved: '', targetDate: '' });
        fetchGoals();
      }
    } catch (err) {
      console.error('Failed to add goal:', err);
    }
  };

  const handleStartEdit = (goal) => {
    setEditingGoalId(goal.id);
    setEditFields({
      goalName: goal.goalName,
      targetAmount: goal.targetAmount,
      currentSaved: goal.currentSaved,
      targetDate: goal.targetDate
    });
  };

  const handleSaveEdit = async (goalId) => {
    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalName: editFields.goalName,
          targetAmount: Number(editFields.targetAmount),
          currentSaved: Number(editFields.currentSaved),
          targetDate: editFields.targetDate
        })
      });

      if (res.ok) {
        setEditingGoalId(null);
        fetchGoals();
      }
    } catch (err) {
      console.error('Failed to update goal:', err);
    }
  };

  const handleDeleteGoal = async (goalId) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;

    try {
      const res = await fetch(`/api/goals/${goalId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        fetchGoals();
      }
    } catch (err) {
      console.error('Failed to delete goal:', err);
    }
  };

  const handleQuickAdd = async (goal, amount) => {
    try {
      const res = await fetch(`/api/goals/${goal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSaved: goal.currentSaved + amount
        })
      });

      if (res.ok) {
        fetchGoals();
      }
    } catch (err) {
      console.error('Failed to quick add funds:', err);
    }
  };

  if (loading && goals.length === 0) {
    return (
      <div className="goals-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="goals-screen">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Target size={22} style={{ color: 'var(--color-primary)' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Your Goals</h2>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              background: 'var(--color-primary)', color: 'white', border: 'none',
              borderRadius: '20px', padding: '6px 12px', fontSize: '0.75rem',
              fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer'
            }}
          >
            <Plus size={14} /> Add Goal
          </button>
        )}
      </div>

      {/* Add Goal Form */}
      {isAdding && (
        <form onSubmit={handleAddGoal} style={{
          background: 'var(--color-surface-card)', border: '1px solid var(--color-primary)',
          borderRadius: '14px', padding: '16px', marginBottom: '16px', display: 'flex',
          flexDirection: 'column', gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-primary)' }}>New Financial Goal</h3>
            <button type="button" onClick={() => setIsAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              <X size={16} />
            </button>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Goal Name</label>
            <input
              type="text"
              placeholder="e.g. Vacation, New Laptop"
              value={newGoal.goalName}
              onChange={e => setNewGoal(p => ({ ...p, goalName: e.target.value }))}
              style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Target (₹)</label>
              <input
                type="number"
                placeholder="50000"
                value={newGoal.targetAmount}
                onChange={e => setNewGoal(p => ({ ...p, targetAmount: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' }}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Already Saved (₹)</label>
              <input
                type="number"
                placeholder="0"
                value={newGoal.currentSaved}
                onChange={e => setNewGoal(p => ({ ...p, currentSaved: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '2px' }}>Target Date</label>
            <input
              type="date"
              value={newGoal.targetDate}
              onChange={e => setNewGoal(p => ({ ...p, targetDate: e.target.value }))}
              style={{ width: '100%', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '0.8rem', outline: 'none' }}
              required
            />
          </div>

          <button type="submit" style={{
            background: 'var(--color-primary)', color: 'white', border: 'none',
            borderRadius: '8px', padding: '10px', fontSize: '0.82rem', fontWeight: 700,
            marginTop: '6px', cursor: 'pointer'
          }}>
            Create Goal
          </button>
        </form>
      )}

      {/* Goal Cards */}
      {goals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
          <Target size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
          <p>No goals set yet.</p>
        </div>
      ) : (
        goals.map((goal) => {
          const isEditing = editingGoalId === goal.id;
          const progressColor = goal.progressPct >= 75 ? '#10B981'
            : goal.progressPct >= 50 ? '#F59E0B'
            : goal.progressPct >= 25 ? '#3B82F6'
            : '#EF4444';

          const statusIcon = goal.isMilestoneHit
            ? <PartyPopper size={16} style={{ color: '#10B981' }} />
            : goal.isOnTrack
            ? <TrendingUp size={16} style={{ color: '#10B981' }} />
            : <AlertCircle size={16} style={{ color: '#F59E0B' }} />;

          return (
            <div key={goal.id} className="goal-card" style={{ position: 'relative' }}>
              
              {/* Card Actions (Edit/Delete) */}
              {!isEditing && (
                <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px' }}>
                  <button onClick={() => handleStartEdit(goal)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', padding: '2px' }} title="Edit Goal">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDeleteGoal(goal.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px' }} title="Delete Goal">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              {isEditing ? (
                /* Edit Mode Form */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)' }}>Editing Goal</span>
                    <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                      <button type="button" onClick={() => handleSaveEdit(goal.id)} style={{ background: '#10B981', color: 'white', border: 'none', borderRadius: '4px', padding: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={14} />
                      </button>
                      <button type="button" onClick={() => setEditingGoalId(null)} style={{ background: '#64748B', color: 'white', border: 'none', borderRadius: '4px', padding: '3px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={editFields.goalName}
                    onChange={e => setEditFields(p => ({ ...p, goalName: e.target.value }))}
                    style={{ padding: '6px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '0.78rem', background: 'white' }}
                    placeholder="Goal Name"
                  />
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <input
                      type="number"
                      value={editFields.currentSaved}
                      onChange={e => setEditFields(p => ({ ...p, currentSaved: e.target.value }))}
                      style={{ padding: '6px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '0.78rem', background: 'white' }}
                      placeholder="Saved"
                    />
                    <input
                      type="number"
                      value={editFields.targetAmount}
                      onChange={e => setEditFields(p => ({ ...p, targetAmount: e.target.value }))}
                      style={{ padding: '6px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '0.78rem', background: 'white' }}
                      placeholder="Target"
                    />
                  </div>

                  <input
                    type="date"
                    value={editFields.targetDate}
                    onChange={e => setEditFields(p => ({ ...p, targetDate: e.target.value }))}
                    style={{ padding: '6px', border: '1px solid var(--color-border)', borderRadius: '6px', fontSize: '0.78rem', background: 'white' }}
                  />
                </div>
              ) : (
                /* Standard Display Mode */
                <>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', paddingRight: '48px' }}>
                      {statusIcon}
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>{goal.goalName}</h3>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      Target by {new Date(goal.targetDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      {' · '}{goal.monthsRemaining} months left
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="goal-progress-bar" style={{ marginTop: '14px' }}>
                    <div
                      className="goal-progress-fill"
                      style={{ width: `${Math.min(goal.progressPct, 100)}%`, background: progressColor }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                    <span>₹{goal.currentSaved.toLocaleString('en-IN')} saved</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{goal.progressPct}%</span>
                    <span>₹{goal.targetAmount.toLocaleString('en-IN')} target</span>
                  </div>

                  {/* Quick Save Buttons */}
                  {goal.progressPct < 100 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Coins size={10} /> Quick Add:
                      </span>
                      <button onClick={() => handleQuickAdd(goal, 1000)} style={{ padding: '3px 8px', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'none', fontSize: '0.68rem', fontWeight: 500, cursor: 'pointer', color: 'var(--color-primary-light)' }}>
                        +₹1K
                      </button>
                      <button onClick={() => handleQuickAdd(goal, 5000)} style={{ padding: '3px 8px', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'none', fontSize: '0.68rem', fontWeight: 500, cursor: 'pointer', color: 'var(--color-primary-light)' }}>
                        +₹5K
                      </button>
                      <button onClick={() => handleQuickAdd(goal, 10000)} style={{ padding: '3px 8px', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'none', fontSize: '0.68rem', fontWeight: 500, cursor: 'pointer', color: 'var(--color-primary-light)' }}>
                        +₹10K
                      </button>
                    </div>
                  )}

                  {goal.monthlyRequired > 0 && goal.progressPct < 100 && (
                    <div style={{
                      marginTop: '8px', padding: '6px 10px', borderRadius: '8px',
                      background: 'var(--color-surface)', fontSize: '0.72rem', color: 'var(--color-text-secondary)'
                    }}>
                      💡 Save ₹{goal.monthlyRequired.toLocaleString('en-IN')}/month to stay on track
                    </div>
                  )}

                  {goal.isMilestoneHit && (
                    <div style={{
                      marginTop: '8px', padding: '6px 10px', borderRadius: '8px',
                      background: '#D1FAE5', fontSize: '0.72rem', color: '#059669'
                    }}>
                      🎉 Milestone reached! You've crossed {goal.progressPct >= 75 ? '75%' : '50%'} — keep going!
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
