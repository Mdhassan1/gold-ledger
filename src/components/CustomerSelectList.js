import { useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { listCustomers } from '../services/customerService';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { userMessage } from '../utils/errors';
import { useScreenData } from '../hooks/useScreenData';

export function CustomerSelectList({ onSelect }) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const { data, loading, error, reload } = useScreenData(() => listCustomers(query), [query]);

  return (
    <View style={{ gap: 10, maxHeight: 420 }}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name or mobile"
        placeholderTextColor={theme.colors.textMuted}
        style={{
          minHeight: 48,
          borderRadius: 14,
          paddingHorizontal: 14,
          backgroundColor: theme.colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: theme.colors.border,
          color: theme.colors.text,
          fontSize: 16,
        }}
      />
      {loading && !data ? <LoadingState label="Finding customers" /> : null}
      {error && !data ? <ErrorState message={userMessage(error)} onRetry={reload} /> : null}
      {data ? (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          style={{ maxHeight: 320 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<EmptyState icon="people-outline" title="No customers" message="Try another name or mobile number." />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item)}
              style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ color: theme.colors.textMuted }}>{item.phone || 'No mobile number'}</Text>
            </Pressable>
          )}
        />
      ) : null}
    </View>
  );
}
