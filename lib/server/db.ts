import pg from 'pg';
import type { PoolClient } from 'pg';

export const SCHOOL = 'escuela-guaricanos';
export interface StoredRecord {
  id: string;
  owner: string;
  kind: string;
  payload: string;
  created: string;
}

let pool: pg.Pool | undefined;
export function database() {
  if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
  return pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
}

export async function readRecords(client: pg.Pool | PoolClient = database()) {
  return (await client.query<StoredRecord>(
    'SELECT id, owner, kind, payload, created FROM records WHERE owner=$1 ORDER BY created, id', [SCHOOL]
  )).rows;
}

export function byKind(records: StoredRecord[], kind: string) {
  return records.filter(row => row.kind === kind).map(row => JSON.parse(row.payload));
}

export async function schoolTransaction<T>(task: (client: PoolClient) => Promise<T>) {
  const client = await database().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(739152, 2)');
    const value = await task(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function writeRecord(client: PoolClient, id: string, kind: string, data: unknown, now: string, replace = false) {
  const query = 'INSERT INTO records(id,owner,kind,payload,created) VALUES ($1,$2,$3,$4,$5)' +
    (replace ? ' ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload WHERE records.owner=EXCLUDED.owner AND records.kind=EXCLUDED.kind' : '');
  await client.query(query, [id, SCHOOL, kind, JSON.stringify(data), now]);
}
