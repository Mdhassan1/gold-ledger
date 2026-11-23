import { DatabaseSync } from 'node:sqlite';

function bind(params = []) {
  return params.map((value) => {
    if (typeof value === 'bigint') {
      const asNumber = Number(value);
      if (!Number.isSafeInteger(asNumber)) {
        throw new Error('Integer is too large to store.');
      }
      return asNumber;
    }
    if (value === undefined) return null;
    return value;
  });
}

export function createNodeAdapter(raw) {
  let chain = Promise.resolve();
  let depth = 0;

  const base = {
    path: ':memory:',
    async exec(sql) {
      if (sql && String(sql).trim()) raw.exec(sql);
    },
    async run(sql, params = []) {
      const info = raw.prepare(sql).run(...bind(params));
      return { changes: Number(info.changes || 0), lastInsertRowid: info.lastInsertRowid };
    },
    async get(sql, params = []) {
      return raw.prepare(sql).get(...bind(params)) ?? null;
    },
    async all(sql, params = []) {
      return raw.prepare(sql).all(...bind(params));
    },
  };

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
    path: ':memory:',
    exec: (sql) => lock(() => base.exec(sql)),
    run: (sql, params) => lock(() => base.run(sql, params)),
    get: (sql, params) => lock(() => base.get(sql, params)),
    all: (sql, params) => lock(() => base.all(sql, params)),
    withTransaction(fn) {
      return lock(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await fn(base);
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          try {
            raw.exec('ROLLBACK');
          } catch (rollbackError) {
            // The original error is the one the caller needs.
          }
          throw error;
        }
      });
    },
  };
}

export function createMemoryDatabase() {
  const raw = new DatabaseSync(':memory:');
  const db = createNodeAdapter(raw);
  return db;
}

export async function openMemoryDatabase() {
  const db = createMemoryDatabase();
  await db.exec('PRAGMA foreign_keys = ON;');
  return db;
}
