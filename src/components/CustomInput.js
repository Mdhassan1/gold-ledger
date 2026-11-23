import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export function CustomInput({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'default',
  multiline = false,
  secureTextEntry = false,
  helper,
  autoCapitalize = 'sentences',
  maxLength,
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        maxLength={maxLength}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surfaceSecondary,
            borderColor: error ? theme.colors.danger : theme.colors.border,
          },
        ]}
      />
      {error ? <Text style={[styles.helper, { color: theme.colors.danger }]}>{error}</Text> : null}
      {!error && helper ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '500',
  },
  multiline: { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
  helper: { fontSize: 13, lineHeight: 18 },
});
