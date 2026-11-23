import { appOrigin, bridgeUrl, clearCookie, isIdentity, pendingLogin, redirectPrivate, startSession } from '../../../lib/server/session';
export const dynamic = 'force-dynamic';
function failure(status: number) {
  return new Response('No se pudo completar el acceso. Vuelve a /login para iniciar sesión de nuevo.', {
    status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  });
}
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const state = await pendingLogin();
  const code = query.get('code') || '';
  if (!state || state.state !== query.get('state') || !/^[A-Za-z0-9_-]{43}$/.test(code)) return failure(400);
  await clearCookie('pending');
  try {
    const exchange = await fetch(bridgeUrl(), { method: 'POST', redirect: 'error', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ code, verifier: state.verifier, redirect_uri: new URL('/auth/callback', appOrigin()).href })
    });
    if (!exchange.ok) return failure(401);
    const user: unknown = await exchange.json();
    if (!isIdentity(user)) return failure(401);
    await startSession(user);
    return redirectPrivate(new URL('/login', appOrigin()));
  } catch {
    return failure(503);
  }
}
