import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '../../theme/ThemeProvider';
import { CustomInput } from '../../components/CustomInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SecondaryButton } from '../../components/SecondaryButton';
import { useSecurity } from '../../context/SecurityContext';

export function LockScreen() {
  const { theme } = useTheme();
  const security = useSecurity();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    const accepted = await security.unlock(pin);
    setBusy(false);
    if (!accepted) setError('Incorrect PIN.');
    else setPin('');
  };

  const biometric = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock GoldLedger',
      cancelLabel: 'Use PIN',
    });
    if (result.success) security.markUnlocked();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.colors.accentText, fontWeight: '800', fontSize: 20 }}>Au</Text>
        </View>
        <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '700' }}>GoldLedger is locked</Text>
        <Text style={{ color: theme.colors.textMuted }}>Enter the PIN for this device. Records stay on the phone.</Text>
        <CustomInput label="PIN" value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry maxLength={6} error={error} />
        <PrimaryButton label="Unlock" onPress={submit} loading={busy} disabled={pin.length < 4} />
        {security.biometricEnabled ? <SecondaryButton label="Unlock with biometrics" onPress={biometric} /> : null}
      </View>
    </SafeAreaView>
  );
}
