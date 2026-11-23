import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import * as NavigationBar from 'expo-navigation-bar';
import { darkTheme } from './darkTheme';
import { lightTheme } from './lightTheme';
import { setThemeMode as persistThemeMode } from '../services/settingsService';

const ThemeContext = createContext(null);

export function ThemeProvider({ initialMode = 'system', children }) {
  const [mode, setMode] = useState(initialMode);
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const resolved = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const theme = resolved === 'dark' ? darkTheme : lightTheme;

  useEffect(() => {
    const applyChrome = async () => {
      try {
        await SystemUI.setBackgroundColorAsync(theme.colors.background);
      } catch (error) {
        // System UI styling is cosmetic.
      }
      try {
        await NavigationBar.setBackgroundColorAsync(theme.colors.background);
        await NavigationBar.setButtonStyleAsync(resolved === 'dark' ? 'light' : 'dark');
      } catch (error) {
        // Navigation bar APIs are Android-only.
      }
    };
    applyChrome();
  }, [resolved, theme.colors.background]);

  const value = useMemo(
    () => ({
      theme,
      mode,
      resolved,
      setMode: async (next) => {
        setMode(next);
        await persistThemeMode(next);
      },
    }),
    [mode, resolved, theme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider.');
  }
  return context;
}
