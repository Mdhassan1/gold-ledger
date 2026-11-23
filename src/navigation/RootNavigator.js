import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useSecurity } from '../context/SecurityContext';
import { TabNavigator } from './TabNavigator';
import { CustomerNavigator } from './CustomerNavigator';
import { LockScreen } from '../modules/settings/LockScreen';

const Stack = createNativeStackNavigator();

export function RootNavigator() {
  const { theme, resolved } = useTheme();
  const security = useSecurity();
  const base = resolved === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.accent,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.danger,
    },
  };

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="MainTabs" component={TabNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="CustomerStack" component={CustomerNavigator} options={{ headerShown: false }} />
        </Stack.Navigator>
      </NavigationContainer>
      {security.locked ? (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          <LockScreen />
        </View>
      ) : null}
    </View>
  );
}
