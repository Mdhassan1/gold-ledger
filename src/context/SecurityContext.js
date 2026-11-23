import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getSecurityState, verifyPin } from '../services/settingsService';
import { LOCK_TIMEOUTS } from '../utils/constants';

const SecurityContext = createContext(null);

export function SecurityProvider({ initialState, children }) {
  const [state, setState] = useState(initialState || { hasPin: false, timeout: 'immediate', biometricEnabled: false });
  const [locked, setLocked] = useState(Boolean(initialState?.hasPin));
  const backgroundedAt = useRef(null);

  const refresh = async () => {
    const next = await getSecurityState();
    setState(next);
    if (!next.hasPin) setLocked(false);
    return next;
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (!state.hasPin) return;
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAt.current = Date.now();
        if (state.timeout === 'immediate') setLocked(true);
        return;
      }
      if (nextState === 'active' && backgroundedAt.current) {
        const option = LOCK_TIMEOUTS.find((item) => item.id === state.timeout);
        if (option && option.milliseconds !== null && Date.now() - backgroundedAt.current >= option.milliseconds) {
          setLocked(true);
        }
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, [state.hasPin, state.timeout]);

  const unlock = async (pin) => {
    const accepted = await verifyPin(pin);
    if (accepted) setLocked(false);
    return accepted;
  };

  const markUnlocked = () => setLocked(false);

  return (
    <SecurityContext.Provider value={{ ...state, locked, refresh, unlock, markUnlocked, lockNow: () => state.hasPin && setLocked(true) }}>
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) throw new Error('useSecurity must be used within SecurityProvider.');
  return context;
}
