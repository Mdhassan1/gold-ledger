const { openMemoryDatabase } = require('../src/database/nodeAdapter');
const { migrate } = require('../src/database/migrations');
const { setDatabase, resetDatabase } = require('../src/database/connection');
const { setFileStore } = require('../src/services/fileStore');

function createMemoryFileStore() {
  const files = new Map();
  return {
    files,
    async saveFromUri({ customerId, imageId, sourceUri, mimeType, fileName }) {
      const extension = fileName && String(fileName).includes('.')
        ? String(fileName).slice(String(fileName).lastIndexOf('.'))
        : '.jpg';
      const uri = `memory://customer-gallery/${customerId}/${imageId}${extension}`;
      files.set(uri, {
        base64: String(sourceUri),
        mimeType: mimeType || 'image/jpeg',
        size: String(sourceUri).length,
      });
      return { uri, mimeType: mimeType || 'image/jpeg', extension };
    },
    async writeBase64({ customerId, imageId, extension = '.jpg', base64, mimeType, fileName }) {
      const name = fileName || `${imageId}${extension}`;
      const uri = `memory://customer-gallery/${customerId}/${name}`;
      files.set(uri, {
        base64: String(base64),
        mimeType: mimeType || 'image/jpeg',
        size: String(base64).length,
      });
      return { uri, mimeType: mimeType || 'image/jpeg' };
    },
    async delete(uri) {
      files.delete(uri);
    },
    async readBase64(uri) {
      return files.get(uri)?.base64 ?? null;
    },
    async size(uri) {
      return files.get(uri)?.size || 0;
    },
    exists(uri) {
      return files.has(uri);
    },
    async writeTextFile(filename, contents) {
      const uri = `memory://cache/${filename}`;
      files.set(uri, { text: contents, base64: contents, size: contents.length });
      return uri;
    },
    async readTextFile(uri) {
      const file = files.get(uri);
      if (!file) throw new Error('File not found.');
      return file.text || file.base64;
    },
  };
}

async function useTestDatabase() {
  const db = await openMemoryDatabase();
  await migrate(db);
  setDatabase(db);
  const files = createMemoryFileStore();
  setFileStore(files);
  return { db, files };
}

function resetTestState() {
  resetDatabase();
  setFileStore(null);
}

module.exports = { useTestDatabase, resetTestState, createMemoryFileStore };
