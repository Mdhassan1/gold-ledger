let database = null;

export function setDatabase(next) {
  database = next;
}

export function getDatabase() {
  if (!database) {
    const error = new Error('Database is not ready.');
    error.code = 'DB_NOT_READY';
    throw error;
  }
  return database;
}

export function resetDatabase() {
  database = null;
}

export function activeDb(tx) {
  return tx || getDatabase();
}
