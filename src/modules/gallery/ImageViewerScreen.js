import { useRef, useState } from 'react';
import { FlatList, Image, Text, View, useWindowDimensions } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { IconButton } from '../../components/IconButton';
import { ConfirmationDialog } from '../../components/ConfirmationDialog';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { deleteCustomerImage, listCustomerImages } from '../../services/galleryService';
import { formatDisplayDate } from '../../utils/dateUtils';
import { userMessage } from '../../utils/errors';
import { useScreenData } from '../../hooks/useScreenData';

export function ImageViewerScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { width, height } = useWindowDimensions();
  const customerId = route.params?.customerId;
  const imageId = route.params?.imageId;
  const listRef = useRef(null);
  const { data, loading, error, reload } = useScreenData(
    () => (customerId ? listCustomerImages(customerId) : Promise.resolve(null)),
    [customerId],
  );
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!customerId) return <ErrorState message="This customer could not be opened." />;
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={userMessage(error)} onRetry={reload} />;
  if (!data.length) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Text style={{ color: '#fff' }}>No images in this gallery.</Text>
        <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => navigation.goBack()} color="#fff" />
      </View>
    );
  }

  const initial = Math.max(0, data.findIndex((image) => image.id === imageId));
  const currentIndex = Math.min(ready ? index : initial, data.length - 1);
  const current = data[currentIndex];

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteCustomerImage(customerId, current.id);
      setConfirming(false);
      if (data.length === 1) navigation.goBack();
      else reload();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        ref={listRef}
        data={data}
        horizontal
        pagingEnabled
        initialScrollIndex={initial}
        getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / width);
          setIndex(next);
          setReady(true);
        }}
        renderItem={({ item }) => (
          <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
            {missing[item.id] ? (
              <Text style={{ color: '#fff', fontSize: 16 }}>Image file missing</Text>
            ) : (
              <Image
                source={{ uri: item.local_uri }}
                style={{ width, height: height * 0.78 }}
                resizeMode="contain"
                onError={() => setMissing((currentMissing) => ({ ...currentMissing, [item.id]: true }))}
              />
            )}
          </View>
        )}
      />
      <View style={{ position: 'absolute', top: 48, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton icon="chevron-back" accessibilityLabel="Back" onPress={() => navigation.goBack()} color="#fff" />
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, padding: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>{current.image_name}</Text>
          <Text style={{ color: '#E2E8F0' }}>{formatDisplayDate(current.image_date)}  ·  {currentIndex + 1} of {data.length}</Text>
        </View>
        <IconButton icon="trash-outline" accessibilityLabel="Delete image" onPress={() => setConfirming(true)} color="#fff" />
      </View>
      <ConfirmationDialog
        visible={confirming}
        title="Delete this image?"
        message="The photo and its record will be removed from this customer's gallery."
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
      />
    </View>
  );
}
