import { Settings } from 'lucide-react';

export default function PhoneFrameWrapper({ children, showDemoGear, onDemoClick, isDemoActive }) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });

  return (
    <div className="phone-frame">
      {/* Notch */}
      <div className="phone-notch" />

      {/* Status Bar */}
      <div className="phone-status-bar">
        <span>{timeStr}</span>
        <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor" opacity="0.6">
            <rect x="0" y="6" width="3" height="4" rx="0.5" />
            <rect x="4" y="4" width="3" height="6" rx="0.5" />
            <rect x="8" y="2" width="3" height="8" rx="0.5" />
            <rect x="12" y="0" width="3" height="10" rx="0.5" />
          </svg>
          <svg width="20" height="10" viewBox="0 0 20 10" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6">
            <rect x="0.5" y="0.5" width="16" height="9" rx="2" />
            <rect x="17" y="3" width="2" height="4" rx="0.5" fill="currentColor" />
            <rect x="1.5" y="1.5" width="12" height="7" rx="1" fill="currentColor" opacity="0.4" />
          </svg>
        </span>
      </div>

      {/* Demo Gear Button */}
      {showDemoGear && (
        <button
          className="gear-btn"
          onClick={onDemoClick}
          title="Toggle Demo Controls"
          style={isDemoActive ? { background: 'rgba(245, 158, 11, 0.3)' } : {}}
        >
          <Settings size={16} />
        </button>
      )}

      {children}
    </div>
  );
}
