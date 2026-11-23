import { redirectPrivate, startLogin } from '../../lib/server/session';
export const dynamic = 'force-dynamic';
export async function GET() {
  return redirectPrivate(await startLogin());
}
