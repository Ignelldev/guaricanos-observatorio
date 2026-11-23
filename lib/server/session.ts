import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { sealData, unsealData } from 'iron-session';

export type SchoolIdentity = { userId: string; email: string; displayName: string; schoolAdmin: boolean };
type Pending = { state: string; verifier: string };
const LOGIN_TTL = 10 * 60;
const SESSION_TTL = 8 * 60 * 60;

function getOrigin(value: string | undefined) {
  if (!value) throw new Error('Falta la dirección de la aplicación.');
  const url = new URL(value);
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password) throw new Error('Origen no permitido.');
  return url.origin;
}
export const appOrigin = () => getOrigin(process.env.RENDER_EXTERNAL_URL || process.env.APP_ORIGIN);
export const identityOrigin = () => getOrigin(process.env.SCHOOL_IDENTITY_ORIGIN || 'https://guaricanos-observatorio.orangeokapi21.chatgpt.site');
export const bridgeUrl = () => new URL('/api/render-auth', identityOrigin());
const secure = () => new URL(appOrigin()).protocol === 'https:';
const name = (type: 'session' | 'pending') => (secure() ? '__Host-' : '') + 'guaricanos-' + type;
const secret = () => {
  const value = process.env.SCHOOL_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Falta el secreto de sesión.');
  return value;
};

async function setCookie(type: 'session' | 'pending', value: object, seconds: number) {
  const expires = Date.now() + seconds * 1000;
  const token = await sealData({ type, value, expires }, { password: secret(), ttl: seconds });
  (await cookies()).set(name(type), token, { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: seconds });
}
async function getCookie<T>(type: 'session' | 'pending'): Promise<T | null> {
  const raw = (await cookies()).get(name(type))?.value;
  if (!raw) return null;
  const data = await unsealData<{ type?: string; expires?: number; value?: T }>(raw, { password: secret() });
  return data.type === type && Number(data.expires) > Date.now() ? data.value ?? null : null;
}
export async function clearCookie(type: 'session' | 'pending') {
  (await cookies()).set(name(type), '', { httpOnly: true, secure: secure(), sameSite: 'lax', path: '/', maxAge: 0 });
}
export const userSession = () => getCookie<SchoolIdentity>('session');
export const pendingLogin = () => getCookie<Pending>('pending');
export const startSession = (user: SchoolIdentity) => setCookie('session', user, SESSION_TTL);
export async function startLogin() {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  await setCookie('pending', { state, verifier }, LOGIN_TTL);
  const url = bridgeUrl();
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
  url.searchParams.set('redirect_uri', new URL('/auth/callback', appOrigin()).href);
  return url;
}

export function redirectPrivate(url: URL) {
  return new Response(null, { status: 303, headers: { Location: url.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
export const isIdentity = (x: unknown): x is SchoolIdentity => {
  if (!x || typeof x !== 'object') return false;
  const item = x as Partial<SchoolIdentity>;
  return typeof item.userId === 'string' && !!item.userId && typeof item.email === 'string' &&
    !!item.email && typeof item.displayName === 'string' && typeof item.schoolAdmin === 'boolean';
};
