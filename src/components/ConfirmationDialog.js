import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { PrimaryButton } from './PrimaryButton';
import { SecondaryButton } from './SecondaryButton';

export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  loading = false,
  destructive = false,
  children,
}) {
  const { theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={loading ? undefined : onCancel}>
        <Pressable style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text> : null}
          {children}
          <View style={styles.actions}>
            <View style={styles.action}>
              <SecondaryButton label={cancelLabel} onPress={onCancel} disabled={loading} />
            </View>
            <View style={styles.action}>
              {destructive ? (
                <SecondaryButton label={confirmLabel} onPress={onConfirm} loading={loading} danger />
              ) : (
                <PrimaryButton label={confirmLabel} onPress={onConfirm} loading={loading} />
              )}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  action: { flex: 1 },
});
