import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { PrimaryButton } from './PrimaryButton';

export function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      <Ionicons name="alert-circle-outline" size={36} color={theme.colors.danger} />
      <Text style={[styles.title, { color: theme.colors.text }]}>Unable to continue</Text>
      <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
      {onRetry ? <PrimaryButton label="Try again" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
