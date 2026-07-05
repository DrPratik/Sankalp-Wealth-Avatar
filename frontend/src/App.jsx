import { useState, useCallback } from 'react';
import PhoneFrameWrapper from './components/PhoneFrameWrapper';
import PersonaSelector from './components/PersonaSelector';
import PortfolioDashboard from './components/PortfolioDashboard';
import AvatarChat from './components/AvatarChat';
import GoalTracker from './components/GoalTracker';
import DemoControls from './components/DemoControls';
import { Home, MessageCircle, Target, Settings } from 'lucide-react';

export default function App() {
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('login'); // login | dashboard | chat | goals | demo
  const [nudgeRefreshKey, setNudgeRefreshKey] = useState(0);
  const [conversationSummary, setConversationSummary] = useState('');

  const handleSelectPersona = useCallback((userId) => {
    setCurrentUserId(userId);
    setCurrentScreen('dashboard');
    setNudgeRefreshKey(k => k + 1);
    setConversationSummary('');
  }, []);

  const handleDemoApplied = useCallback(() => {
    setNudgeRefreshKey(k => k + 1);
    setConversationSummary(''); // Reset chat context
  }, []);

  const handleSwitchPersona = useCallback(() => {
    setCurrentUserId(null);
    setCurrentScreen('login');
    setConversationSummary('');
  }, []);

  const renderScreen = () => {
    if (currentScreen === 'login' || !currentUserId) {
      return <PersonaSelector onSelect={handleSelectPersona} />;
    }

    if (currentScreen === 'chat') {
      return (
        <AvatarChat
          userId={currentUserId}
          conversationSummary={conversationSummary}
          setConversationSummary={setConversationSummary}
          onBack={() => setCurrentScreen('dashboard')}
          onOpenGoals={() => setCurrentScreen('goals')}
          onOpenPortfolio={() => setCurrentScreen('dashboard')}
          onGoalsUpdated={() => setNudgeRefreshKey(k => k + 1)}
        />
      );
    }

    if (currentScreen === 'goals') {
      return <GoalTracker userId={currentUserId} />;
    }

    if (currentScreen === 'demo') {
      return (
        <DemoControls
          userId={currentUserId}
          onApplied={handleDemoApplied}
        />
      );
    }

    // Dashboard (default)
    return (
      <PortfolioDashboard
        userId={currentUserId}
        nudgeRefreshKey={nudgeRefreshKey}
        onOpenChat={() => setCurrentScreen('chat')}
        onSwitchPersona={handleSwitchPersona}
      />
    );
  };

  const showBottomNav = currentUserId && currentScreen !== 'login' && currentScreen !== 'chat';

  return (
    <PhoneFrameWrapper
      showDemoGear={!!currentUserId && currentScreen !== 'login'}
      onDemoClick={() => setCurrentScreen(currentScreen === 'demo' ? 'dashboard' : 'demo')}
      isDemoActive={currentScreen === 'demo'}
    >
      <div className="phone-content">
        {renderScreen()}

        {/* FAB for chat — only on dashboard */}
        {currentScreen === 'dashboard' && (
          <button className="fab" onClick={() => setCurrentScreen('chat')} title="Chat with Sankalp">
            <MessageCircle size={24} />
          </button>
        )}
      </div>

      {showBottomNav && (
        <nav className="bottom-nav">
          <button
            className={`bottom-nav-item ${currentScreen === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentScreen('dashboard')}
          >
            <Home size={20} />
            <span>Home</span>
          </button>
          <button
            className={`bottom-nav-item ${currentScreen === 'goals' ? 'active' : ''}`}
            onClick={() => setCurrentScreen('goals')}
          >
            <Target size={20} />
            <span>Goals</span>
          </button>
          <button
            className={`bottom-nav-item ${currentScreen === 'chat' ? 'active' : ''}`}
            onClick={() => setCurrentScreen('chat')}
          >
            <MessageCircle size={20} />
            <span>Sankalp</span>
          </button>
          <button
            className={`bottom-nav-item ${currentScreen === 'demo' ? 'active' : ''}`}
            onClick={() => setCurrentScreen(currentScreen === 'demo' ? 'dashboard' : 'demo')}
          >
            <Settings size={20} />
            <span>Demo</span>
          </button>
        </nav>
      )}
    </PhoneFrameWrapper>
  );
}
