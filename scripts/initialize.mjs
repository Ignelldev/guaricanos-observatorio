import { readFile } from 'node:fs/promises';
import { createDecipheriv } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Falta DATABASE_URL.');
if ((process.env.SCHOOL_SESSION_SECRET || '').length < 32) throw new Error('Falta el secreto de sesión de Render.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(739152, 1)');
  await client.query(`
    CREATE TABLE IF NOT EXISTS records (
      id text PRIMARY KEY, owner text NOT NULL, kind text NOT NULL,
      payload text NOT NULL, created text NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_owner_kind ON records(owner, kind);
    CREATE TABLE IF NOT EXISTS school_migrations (
      id text PRIMARY KEY, workbook bytea NOT NULL
    )
  `);
  const previous = await client.query("SELECT 1 FROM school_migrations WHERE id = 'sites-v3'");
  if (previous.rowCount === 0) {
    const key = Buffer.from(process.env.SCHOOL_DATA_KEY || '', 'base64');
    if (key.length !== 32) throw new Error('La copia inicial requiere SCHOOL_DATA_KEY.');
    const data = await readFile(new URL('../bootstrap/escuela.enc', import.meta.url));
    const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    const raw = Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]);
    const snapshot = JSON.parse(gunzipSync(raw).toString('utf8'));
    if (snapshot.format !== 1 || !snapshot.rows.length || !snapshot.workbook) throw new Error('Copia inicial inválida.');
    await client.query(`
      INSERT INTO records(id,owner,kind,payload,created)
      SELECT id,owner,kind,payload,created
      FROM json_to_recordset($1::json) AS r(id text,owner text,kind text,payload text,created text)
    `, [JSON.stringify(snapshot.rows)]);
    await client.query("INSERT INTO school_migrations VALUES ('sites-v3', $1)", [Buffer.from(snapshot.workbook, 'base64')]);
    console.log('Se importó la copia inicial del Observatorio.');
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
