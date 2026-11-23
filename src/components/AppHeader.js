import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';

export function AppHeader({ title, subtitle, onSearch, onSettings }) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.mark, { backgroundColor: theme.colors.accent }]}>
        <Text style={[styles.markText, { color: theme.colors.accentText }]}>Au</Text>
      </View>
      <View style={styles.titles}>
        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {onSearch ? <IconButton icon="search" onPress={onSearch} accessibilityLabel="Search customers" /> : null}
      {onSettings ? <IconButton icon="settings-outline" onPress={onSettings} accessibilityLabel="Open settings" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  mark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  markText: { fontSize: 16, fontWeight: '800' },
  titles: { flex: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
});
