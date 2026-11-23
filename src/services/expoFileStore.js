import { Directory, File, Paths } from 'expo-file-system';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];

export function extensionFor(mimeType, fileName) {
  const fromName = fileName && String(fileName).includes('.')
    ? String(fileName).slice(String(fileName).lastIndexOf('.')).toLowerCase()
    : '';
  if (ALLOWED_EXTENSIONS.includes(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName === '.heif' ? '.heic' : fromName;
  }
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return '.heic';
  return '.jpg';
}

function customerDirectory(customerId) {
  const directory = new Directory(Paths.document, 'customer-gallery', String(customerId));
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

export const expoFileStore = {
  async saveFromUri({ customerId, imageId, sourceUri, mimeType, fileName }) {
    const extension = extensionFor(mimeType, fileName);
    const directory = customerDirectory(customerId);
    const destination = new File(directory, `${imageId}${extension}`);
    const source = new File(sourceUri);
    try {
      await source.copy(destination);
    } catch (error) {
      const encoded = await source.base64();
      if (!destination.exists) destination.create({ intermediates: true });
      await destination.write(encoded, { encoding: 'base64' });
    }
    return { uri: destination.uri, mimeType: mimeType || 'image/jpeg', extension };
  },

  async writeBase64({ customerId, imageId, extension, base64, mimeType, fileName }) {
    const directory = customerDirectory(customerId);
    const safeExtension = extensionFor(mimeType, fileName || `file${extension || '.jpg'}`);
    const destinationName = fileName && /^[A-Za-z0-9._-]+$/.test(fileName)
      ? fileName
      : `${imageId}${safeExtension}`;
    const destination = new File(directory, destinationName);
    if (destination.exists) destination.delete();
    destination.create({ intermediates: true });
    await destination.write(base64, { encoding: 'base64' });
    return { uri: destination.uri, mimeType: mimeType || 'image/jpeg' };
  },

  async delete(uri) {
    if (!uri || uri.startsWith('memory://')) return;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (error) {
      // A missing file should not block metadata removal.
    }
  },

  async readBase64(uri) {
    try {
      const file = new File(uri);
      if (!file.exists) return null;
      return await file.base64();
    } catch (error) {
      return null;
    }
  },

  async size(uri) {
    try {
      const file = new File(uri);
      if (!file.exists) return 0;
      return Number(file.size || 0);
    } catch (error) {
      return 0;
    }
  },

  exists(uri) {
    try {
      return Boolean(new File(uri).exists);
    } catch (error) {
      return false;
    }
  },

  async writeTextFile(filename, contents) {
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    await file.write(contents);
    return file.uri;
  },

  async readTextFile(uri) {
    const file = new File(uri);
    return file.text();
  },
};
