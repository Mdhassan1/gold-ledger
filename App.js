import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import * as SplashScreen from "expo-splash-screen";

import { initDatabase } from "./src/database/database";
import { getThemeMode, getSecurityState } from "./src/services/settingsService";

import { ThemeProvider } from "./src/theme/ThemeProvider";
import { SecurityProvider } from "./src/context/SecurityContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [boot, setBoot] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        await initDatabase();

        const themeMode = await getThemeMode();
        const security = await getSecurityState();

        if (active) {
          setBoot({ themeMode, security });
        }
      } catch (bootError) {
        if (active) setError(bootError);
      } finally {
        SplashScreen.hideAsync().catch(() => {});
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0B1120",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text
          style={{
            color: "#F8FAFC",
            fontSize: 20,
            fontWeight: "700",
            marginBottom: 8,
          }}
        >
          GoldLedger could not start
        </Text>

        <Text style={{ color: "#94A3B8", textAlign: "center" }}>
          {error.message || "The local database could not be opened."}
        </Text>
      </View>
    );
  }

  if (!boot) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider initialMode={boot.themeMode}>
          <SecurityProvider initialState={boot.security}>
            <SafeAreaView style={{ flex: 1 }} edges={["bottom"]} mode="padding">
              <RootNavigator />
            </SafeAreaView>
          </SecurityProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
