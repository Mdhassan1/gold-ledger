import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function FilterChips({ options, value, onChange }) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.colors.accent : theme.colors.surfaceSecondary,
                borderColor: active ? theme.colors.accent : theme.colors.border,
              },
            ]}
          >
            <Text style={{ color: active ? theme.colors.accentText : theme.colors.text, fontWeight: '700', fontSize: 13 }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
});
