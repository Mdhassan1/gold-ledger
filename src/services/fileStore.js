let fileStore = null;

export function setFileStore(store) {
  fileStore = store;
}

export function getFileStore() {
  if (!fileStore) {
    // Loaded only on device. Tests inject a store before any file operation.
    fileStore = require('./expoFileStore').expoFileStore;
  }
  return fileStore;
}
