import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { Screen } from '../../components/Screen';
import { CustomInput } from '../../components/CustomInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SecondaryButton } from '../../components/SecondaryButton';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { shareBackup, restoreBackupPayload, decodeBackupText, summarizeBackup } from '../../services/backupService';
import { getFileStore } from '../../services/fileStore';
import { isAppError, userMessage } from '../../utils/errors';
import { formatTimestamp } from '../../utils/dateUtils';

export function BackupRestoreScreen() {
  const { theme } = useTheme();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pendingText, setPendingText] = useState('');
  const [summary, setSummary] = useState(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmPlain, setConfirmPlain] = useState(false);

  const create = async () => {
    if (!password) {
      setConfirmPlain(true);
      return;
    }
    await writeBackup(password);
  };

  const writeBackup = async (backupPassword) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const created = await shareBackup(backupPassword || undefined);
      setMessage(created.encrypted
        ? 'Encrypted backup is ready to save from the share sheet.'
        : 'Unencrypted backup is ready to save from the share sheet.');
    } catch (backupError) {
      setError(isAppError(backupError) ? backupError.message : userMessage(backupError));
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async (backupPassword) => {
    setBusy(true);
    setError('');
    try {
      const DocumentPicker = require('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/json', 'application/octet-stream', '*/*'],
      });
      if (result.canceled || !result.assets?.length) return;
      const text = await getFileStore().readTextFile(result.assets[0].uri);
      const parsed = JSON.parse(text);
      if (parsed.encrypted && !backupPassword) {
        setPendingText(text);
        setError('This backup is encrypted. Enter its password, then choose the file again.');
        return;
      }
      const payload = await decodeBackupText(text, backupPassword);
      setPendingText(text);
      setSummary(summarizeBackup(payload));
      setConfirmRestore(true);
    } catch (restoreError) {
      setError(isAppError(restoreError) ? restoreError.message : userMessage(restoreError));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const payload = await decodeBackupText(pendingText, password);
      const restored = await restoreBackupPayload(payload);
      setConfirmRestore(false);
      setMessage(`Restored ${restored.customers} customers and ${restored.images} images.`);
    } catch (restoreError) {
      setError(isAppError(restoreError) ? restoreError.message : userMessage(restoreError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text style={{ color: theme.colors.textMuted, lineHeight: 22 }}>
        A backup contains the database and customer images. Use a password of at least 8 characters to encrypt it with AES-256-GCM. Restore replaces every customer and transaction on this phone.
      </Text>
      <CustomInput
        label="Backup password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Optional for export, required for an encrypted file"
        autoCapitalize="none"
      />
      <PrimaryButton label="Create backup" onPress={create} loading={busy} />
      <SecondaryButton label="Choose backup to restore" onPress={() => chooseFile(password)} disabled={busy} />
      {message ? <Text style={{ color: theme.colors.success, fontWeight: '700' }}>{message}</Text> : null}
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <ConfirmationDialog
        visible={confirmPlain}
        title="Save without encryption?"
        message="Anyone with this file can read customer and financial records. Continue only if you will store it somewhere private."
        confirmLabel="Create backup"
        onCancel={() => setConfirmPlain(false)}
        onConfirm={() => {
          setConfirmPlain(false);
          writeBackup('');
        }}
      />
      <ConfirmationDialog
        visible={confirmRestore}
        title="Replace all data on this phone?"
        confirmLabel="Restore"
        destructive
        loading={busy}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={restore}
      >
        {summary ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: theme.colors.text }}>Created {summary.createdAt ? formatTimestamp(summary.createdAt) : 'unknown'}</Text>
            <Text style={{ color: theme.colors.text }}>{summary.customers} customers</Text>
            <Text style={{ color: theme.colors.text }}>{summary.income} income records</Text>
            <Text style={{ color: theme.colors.text }}>{summary.advances} advance records</Text>
            <Text style={{ color: theme.colors.text }}>{summary.conversions} conversions</Text>
            <Text style={{ color: theme.colors.text }}>{summary.images} images</Text>
          </View>
        ) : null}
      </ConfirmationDialog>
    </Screen>
  );
}
