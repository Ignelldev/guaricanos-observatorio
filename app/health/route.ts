import { database } from '../../lib/server/db';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const result = await database().query("SELECT 1 FROM school_migrations WHERE id='sites-v3'");
    return Response.json({ready: result.rowCount === 1}, {status: result.rowCount === 1 ? 200 : 503});
  } catch {
    return Response.json({ready: false}, {status: 503});
  }
}
