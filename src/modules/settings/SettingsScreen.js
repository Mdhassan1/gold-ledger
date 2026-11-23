import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { useTheme } from '../../theme/ThemeProvider';
import { Screen } from '../../components/Screen';
import { CustomInput } from '../../components/CustomInput';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SecondaryButton } from '../../components/SecondaryButton';
import { FilterChips } from '../../components/FilterChips';
import { CustomModal } from '../../components/CustomModal';
import { CustomerSelectList } from '../../components/CustomerSelectList';
import { THEME_MODES } from '../../utils/constants';
import { formatBytes } from '../../utils/currency';
import {
  changePin,
  clearPin,
  setBiometricEnabled,
  setPin,
} from '../../services/settingsService';
import { getStorageInfo } from '../../services/galleryService';
import { shareMonthStatement } from '../../services/statementService';
import { AppError, isAppError, userMessage } from '../../utils/errors';
import { todayISODate } from '../../utils/dateUtils';
import { useSecurity } from '../../context/SecurityContext';

function Section({ title, children }) {
  const { theme } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.6 }}>{title}</Text>
      <View style={{ padding: 16, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, gap: 12 }}>
        {children}
      </View>
    </View>
  );
}

export function SettingsScreen({ navigation }) {
  const { theme, mode, setMode } = useTheme();
  const security = useSecurity();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [storage, setStorage] = useState(null);
  const [pinMode, setPinMode] = useState(null);
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');

  const run = async (action) => {
    setError('');
    setMessage('');
    try {
      await action();
    } catch (actionError) {
      setError(isAppError(actionError) ? actionError.message : userMessage(actionError));
    }
  };

  const share = (format) => run(async () => {
    setExporting(true);
    try {
      await shareMonthStatement({
        customerId: selectedCustomer?.id || null,
        month: todayISODate(),
        format,
      });
      setExportOpen(false);
      setPickingCustomer(false);
      setSelectedCustomer(null);
      setMessage(format === 'pdf' ? 'PDF report is ready to save.' : 'CSV report is ready to save.');
    } finally {
      setExporting(false);
    }
  });

  const savePin = () => run(async () => {
    if (pinMode === 'set') await setPin(nextPin);
    if (pinMode === 'change') await changePin(currentPin, nextPin);
    if (pinMode === 'clear') await clearPin(currentPin);
    setPinMode(null);
    setCurrentPin('');
    setNextPin('');
    await security.refresh();
    setMessage('PIN updated.');
  });

  return (
    <Screen scroll>
      <Section title="APPEARANCE">
        <FilterChips options={THEME_MODES} value={mode} onChange={setMode} />
      </Section>

      <Section title="DATA">
        <SecondaryButton label="Export this month report" onPress={() => { setSelectedCustomer(null); setPickingCustomer(false); setExportOpen(true); }} />
        <SecondaryButton label="Backup database" onPress={() => navigation.navigate('CustomerStack', { screen: 'BackupRestore' })} />
        <SecondaryButton label="Restore database" onPress={() => navigation.navigate('CustomerStack', { screen: 'BackupRestore' })} />
        <SecondaryButton label="Storage information" onPress={() => run(async () => setStorage(await getStorageInfo()))} />
      </Section>

      <Section title="ABOUT APP">
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700' }}>GoldLedger</Text>
        <Text style={{ color: theme.colors.textMuted }}>Version {Constants.expoConfig?.version || '1.0.0'}</Text>
        <Text style={{ color: theme.colors.text }}>
          A private ledger for gold customers, instalments, advance, and conversions.
        </Text>
       
      </Section>

      {message ? <Text style={{ color: theme.colors.success, fontWeight: '700' }}>{message}</Text> : null}
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}

      <CustomModal visible={exportOpen} title="Which customer report do you want to export?" onClose={() => setExportOpen(false)}>
        <Text style={{ color: theme.colors.textMuted }}>This month. Advance deposits stay separate from income.</Text>
        {!pickingCustomer && !selectedCustomer ? (
          <>
            <SecondaryButton label="One customer" onPress={() => setPickingCustomer(true)} />
            <SecondaryButton label="All customers" onPress={() => setSelectedCustomer({ id: null, name: 'All customers' })} />
          </>
        ) : null}
        {pickingCustomer && !selectedCustomer ? (
          <CustomerSelectList onSelect={(customer) => { setSelectedCustomer(customer); setPickingCustomer(false); }} />
        ) : null}
        {selectedCustomer ? (
          <>
            <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{selectedCustomer.name}</Text>
            <PrimaryButton label="Share PDF" onPress={() => share('pdf')} loading={exporting} />
            <SecondaryButton label="Share CSV" onPress={() => share('csv')} disabled={exporting} />
          </>
        ) : null}
      </CustomModal>

      <CustomModal visible={Boolean(pinMode)} title={pinMode === 'clear' ? 'Remove PIN' : 'PIN'} onClose={() => setPinMode(null)}>
        {pinMode !== 'set' ? <CustomInput label="Current PIN" value={currentPin} onChangeText={setCurrentPin} keyboardType="number-pad" secureTextEntry maxLength={6} /> : null}
        {pinMode !== 'clear' ? <CustomInput label="New PIN" value={nextPin} onChangeText={setNextPin} keyboardType="number-pad" secureTextEntry maxLength={6} helper="4 to 6 digits." /> : null}
        <PrimaryButton label="Save" onPress={savePin} />
      </CustomModal>

      <CustomModal visible={Boolean(storage)} title="Storage" onClose={() => setStorage(null)}>
        {storage ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.text }}>{storage.imageCount} gallery images</Text>
            <Text style={{ color: theme.colors.text }}>{formatBytes(storage.bytes)} used by images</Text>
            <Text style={{ color: theme.colors.textMuted }}>{storage.missing} missing files</Text>
          </View>
        ) : null}
      </CustomModal>
    </Screen>
  );
}
