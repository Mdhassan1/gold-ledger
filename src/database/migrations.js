import { SCHEMA_SQL } from './schema';
import { nowIso } from '../utils/dateUtils';

export const MIGRATIONS = [
  {
    version: 1,
    sql: SCHEMA_SQL,
  },
];

export async function migrate(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const appliedRows = await db.all('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => Number(row.version)));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    await db.withTransaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
        migration.version,
        nowIso(),
      ]);
    });
  }
}

export async function getSchemaVersion(db) {
  const row = await db.get('SELECT MAX(version) AS version FROM schema_migrations');
  return Number(row?.version || 0);
}
