import * as SQLite from 'expo-sqlite';
import { setDatabase } from './connection';
import { migrate } from './migrations';

function bind(params = []) {
  return params.map((value) => (value === undefined ? null : value));
}

export function createExpoAdapter(raw) {
  let chain = Promise.resolve();
  let depth = 0;

  const base = {
    path: raw.databasePath,
    async exec(sql) {
      if (sql && String(sql).trim()) await raw.execAsync(sql);
    },
    async run(sql, params = []) {
      const bound = bind(params);
      const result = bound.length ? await raw.runAsync(sql, bound) : await raw.runAsync(sql);
      return { changes: result?.changes ?? 0, lastInsertRowid: result?.lastInsertRowid };
    },
    async get(sql, params = []) {
      const bound = bind(params);
      const row = bound.length ? await raw.getFirstAsync(sql, bound) : await raw.getFirstAsync(sql);
      return row ?? null;
    },
    async all(sql, params = []) {
      const bound = bind(params);
      return bound.length ? raw.getAllAsync(sql, bound) : raw.getAllAsync(sql);
    },
  };

  // Every public call waits its turn. A transaction holds this queue until
  // COMMIT or ROLLBACK. Its body uses `base` directly, so it does not try to
  // take the queue again. Other reads and writes cannot run in the middle of
  // that transaction and then publish a total from before the insert.
  const lock = (fn) => {
    const next = chain.then(async () => {
      depth += 1;
      try {
        return await fn();
      } finally {
        depth -= 1;
      }
    });
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  return {
    path: raw.databasePath,
    exec: (sql) => lock(() => base.exec(sql)),
    run: (sql, params) => lock(() => base.run(sql, params)),
    get: (sql, params) => lock(() => base.get(sql, params)),
    all: (sql, params) => lock(() => base.all(sql, params)),
    withTransaction(fn) {
      return lock(async () => {
        await raw.execAsync('BEGIN IMMEDIATE');
        try {
          const result = await fn(base);
          await raw.execAsync('COMMIT');
          return result;
        } catch (error) {
          try {
            await raw.execAsync('ROLLBACK');
          } catch (rollbackError) {
            // Preserve the original failure.
          }
          throw error;
        }
      });
    },
  };
}

export async function initDatabase() {
  const raw = await SQLite.openDatabaseAsync('goldledger.db');
  const db = createExpoAdapter(raw);
  await db.exec('PRAGMA foreign_keys = ON;');
  try {
    await db.exec('PRAGMA journal_mode = WAL;');
  } catch (error) {
    // WAL is an optimisation. The default journal still keeps transactions atomic.
  }
  await migrate(db);
  setDatabase(db);
  return db;
}
