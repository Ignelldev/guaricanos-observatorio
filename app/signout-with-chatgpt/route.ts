import { clearCookie, identityOrigin, redirectPrivate } from '../../lib/server/session';
export const dynamic = 'force-dynamic';
export async function GET() {
  await clearCookie('session');
  await clearCookie('pending');
  const url = new URL('/signout-with-chatgpt', identityOrigin());
  url.searchParams.set('return_to', '/api/render-auth?action=logged_out');
  return redirectPrivate(url);
}
