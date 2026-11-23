import { useState } from 'react';
import { FlatList, Image, Pressable, Text, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../theme/ThemeProvider';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { CustomModal } from '../../components/CustomModal';
import { CustomInput } from '../../components/CustomInput';
import { DateSelector } from '../../components/DateSelector';
import { PrimaryButton } from '../../components/PrimaryButton';
import { addCustomerImage, listCustomerImages } from '../../services/galleryService';
import { formatDisplayDate, todayISODate } from '../../utils/dateUtils';
import { isAppError, userMessage } from '../../utils/errors';
import { useScreenData } from '../../hooks/useScreenData';

export function CustomerGalleryScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const customerId = route.params?.customerId;
  const { data, loading, error, reload } = useScreenData(
    () => (customerId ? listCustomerImages(customerId) : Promise.resolve(null)),
    [customerId],
  );
  const [draft, setDraft] = useState(null);
  const [name, setName] = useState('');
  const [imageDate, setImageDate] = useState(todayISODate());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const tile = (width - 48) / 2;

  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setFormError('Photo access is needed to add a gallery image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setName(asset.fileName?.replace(/\.[^.]+$/, '') || 'Customer image');
    setImageDate(todayISODate());
    setFormError('');
    setDraft(asset);
  };

  const save = async () => {
    setSaving(true);
    setFormError('');
    try {
      await addCustomerImage({
        customerId,
        imageName: name,
        imageDate,
        sourceUri: draft.uri,
        mimeType: draft.mimeType,
        fileName: draft.fileName,
      });
      setDraft(null);
      reload();
    } catch (saveError) {
      setFormError(isAppError(saveError) ? saveError.message : userMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (!customerId) return <ErrorState message="This customer could not be opened." />;
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={data}
        numColumns={2}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 110 }}
        columnWrapperStyle={data.length > 1 ? { gap: 12 } : undefined}
        ListEmptyComponent={<EmptyState icon="images-outline" title="No images" message="Add documents or photos for this customer only." />}
        renderItem={({ item, index }) => (
          <Pressable
            onPress={() => navigation.navigate('ImageViewer', { customerId, imageId: item.id })}
            style={{ width: tile, borderRadius: 16, overflow: 'hidden', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }}
          >
            <Image source={{ uri: item.local_uri }} style={{ width: '100%', height: tile, backgroundColor: theme.colors.surfaceSecondary }} />
            <View style={{ padding: 10, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '700' }}>{item.image_name}</Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>{formatDisplayDate(item.image_date)}</Text>
            </View>
          </Pressable>
        )}
      />
      {formError && !draft ? <Text style={{ color: theme.colors.danger, paddingHorizontal: 16 }}>{formError}</Text> : null}
      <FloatingActionButton accessibilityLabel="Add image" onPress={pick} />
      <CustomModal visible={Boolean(draft)} title="Save image" onClose={() => setDraft(null)}>
        {draft ? <Image source={{ uri: draft.uri }} style={{ width: '100%', height: 220, borderRadius: 16 }} resizeMode="contain" /> : null}
        <CustomInput label="Image name" value={name} onChangeText={setName} error={formError} />
        <DateSelector label="Image date" value={imageDate} onChange={setImageDate} />
        <PrimaryButton label="Save image" onPress={save} loading={saving} />
      </CustomModal>
    </View>
  );
}
