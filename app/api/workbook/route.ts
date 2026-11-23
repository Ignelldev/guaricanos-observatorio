import { userSession } from '../../../lib/server/session';
import { database, readRecords } from '../../../lib/server/db';
import { currentRole } from '../../../lib/server/school';

export const dynamic = 'force-dynamic';
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  const user = await userSession();
  if (!user) return new Response('Inicia sesión.', { status: 401, headers });
  if (currentRole(user, await readRecords()) === 'denied') return new Response('Sin autorización.', { status: 403, headers });
  const result = await database().query("SELECT workbook FROM school_migrations WHERE id='sites-v3'");
  if (!result.rowCount) return new Response('El Excel no está disponible.', {status: 503, headers});
  return new Response(new Uint8Array(result.rows[0].workbook), {headers: {
    ...headers, 'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition':'attachment; filename="Analisis_KMeans_Ajedrez_PowerBI.xlsx"'
  }});
}
