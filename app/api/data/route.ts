import { appOrigin, userSession } from '../../../lib/server/session';
import { byKind, readRecords } from '../../../lib/server/db';
import { ActionError, applyAction, currentRole } from '../../../lib/server/school';

export const dynamic = 'force-dynamic';
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const anonymous = () => respond({error: 'Inicia sesión con ChatGPT.', anonymous: true}, 401);
export async function GET() {
  try {
    const user = await userSession();
    if (!user) return anonymous();
    const all = await readRecords();
    const role = currentRole(user, all);
    const profile = { name: user.displayName, email: user.email, role };
    if (role === 'denied') return respond({ error: 'Solicita acceso a la administración de la escuela.', denied: true, user: profile }, 403);
    return respond({
      rows: byKind(all, 'observation'), analyses: byKind(all, 'analysis'), settings: byKind(all, 'settings')[0] || {},
      user: profile, members: role === 'admin' ? byKind(all, 'member') : [],
      audit: role === 'admin' ? byKind(all, 'audit').sort((a, b) => b.created.localeCompare(a.created)) : []
    });
  } catch {
    return respond({ error: 'No se pudo consultar la base de datos.' }, 500);
  }
}
export async function POST(request: Request) {
  try {
    const user = await userSession();
    if (!user) return anonymous();
    if (request.headers.get('origin') !== appOrigin()) return respond({ error: 'Origen no permitido.' }, 403);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return respond({ error: 'Se requiere JSON.' }, 415);
    if (Number(request.headers.get('content-length') || 0) > 2500000) return respond({ error: 'El archivo supera el tamaño permitido.' }, 413);
    const reader = request.body?.getReader();
    if (!reader) throw new ActionError('Envía la operación.');
    const chunks = [];
    let size = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 2500000) {
        await reader.cancel();
        return respond({ error: 'El archivo supera el tamaño permitido.' }, 413);
      }
      chunks.push(next.value);
    }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ActionError('JSON no válido.'); }
    return respond(await applyAction(user, body));
  } catch (error) {
    if (error instanceof ActionError) return respond({ error: error.message }, error.status);
    return respond({ error: 'No se pudo completar la operación.' }, 500);
  }
}
