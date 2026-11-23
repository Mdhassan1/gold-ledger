import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { CustomerDetailsScreen } from '../modules/customers/CustomerDetailsScreen';
import { AddCustomerScreen } from '../modules/customers/AddCustomerScreen';
import { EditCustomerScreen } from '../modules/customers/EditCustomerScreen';
import { AddIncomeScreen } from '../modules/income/AddIncomeScreen';
import { IncomeHistoryScreen } from '../modules/income/IncomeHistoryScreen';
import { AddAdvanceScreen } from '../modules/advance/AddAdvanceScreen';
import { GoldConversionScreen } from '../modules/conversion/GoldConversionScreen';
import { ConversionSuccessScreen } from '../modules/conversion/ConversionSuccessScreen';
import { TransactionDetailsScreen } from '../modules/transactions/TransactionDetailsScreen';
import { CustomerGalleryScreen } from '../modules/gallery/CustomerGalleryScreen';
import { ImageViewerScreen } from '../modules/gallery/ImageViewerScreen';
import { BackupRestoreScreen } from '../modules/backup/BackupRestoreScreen';

const Stack = createNativeStackNavigator();

export function CustomerNavigator() {
  const { theme } = useTheme();
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '700' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="CustomerDetails" component={CustomerDetailsScreen} options={{ title: 'Customer' }} />
      <Stack.Screen name="AddCustomer" component={AddCustomerScreen} options={{ title: 'Add customer' }} />
      <Stack.Screen name="EditCustomer" component={EditCustomerScreen} options={{ title: 'Edit customer' }} />
      <Stack.Screen name="AddIncome" component={AddIncomeScreen} options={{ title: 'Add income' }} />
      <Stack.Screen name="IncomeHistory" component={IncomeHistoryScreen} options={{ title: 'Income history' }} />
      <Stack.Screen name="AddAdvance" component={AddAdvanceScreen} options={{ title: 'Add advance' }} />
      <Stack.Screen name="GoldConversion" component={GoldConversionScreen} options={{ title: 'Convert to gold' }} />
      <Stack.Screen name="ConversionSuccess" component={ConversionSuccessScreen} options={{ title: 'Conversion complete', headerBackVisible: false }} />
      <Stack.Screen name="TransactionDetails" component={TransactionDetailsScreen} options={{ title: 'Transaction' }} />
      <Stack.Screen name="CustomerGallery" component={CustomerGalleryScreen} options={{ title: 'Customer gallery' }} />
      <Stack.Screen name="ImageViewer" component={ImageViewerScreen} options={{ headerShown: false }} />
      <Stack.Screen name="BackupRestore" component={BackupRestoreScreen} options={{ title: 'Backup and restore' }} />
    </Stack.Navigator>
  );
}
