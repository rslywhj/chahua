import Cookies from 'js-cookie';
import { kvDelete, kvGet, kvSet } from './db';
import { normalizeInviteCode } from './inviteUrl';

const PENDING_INVITE_COOKIE_KEY = 'pending_invite';
const PENDING_INVITE_QUERY_PARAM = 'invite';
const PENDING_INVITE_STORAGE_KEY = 'pending_invite';
const PENDING_INVITE_COOKIE_OPTIONS = { path: '/', expires: 30 };

let cachedPendingInviteCode: string | null = null;

export function parsePendingInviteFromLanding(search: string): string | null {
  const searchParams = new URLSearchParams(search);
  return normalizeInviteCode(searchParams.get(PENDING_INVITE_QUERY_PARAM));
}

function hasPendingInviteQueryParam(search: string): boolean {
  return new URLSearchParams(search).has(PENDING_INVITE_QUERY_PARAM);
}

function getPendingInviteCodeFromCookie(): string | null {
  return normalizeInviteCode(Cookies.get(PENDING_INVITE_COOKIE_KEY));
}

function setPendingInviteCookie(inviteCode: string): void {
  Cookies.set(PENDING_INVITE_COOKIE_KEY, inviteCode, PENDING_INVITE_COOKIE_OPTIONS);
}

function removePendingInviteCookie(): void {
  Cookies.remove(PENDING_INVITE_COOKIE_KEY, { path: '/' });
}

function getStoredPendingInviteCode(): string | null {
  return cachedPendingInviteCode ?? getPendingInviteCodeFromCookie();
}

export async function persistPendingInviteCode(inviteCode: string): Promise<void> {
  cachedPendingInviteCode = inviteCode;
  setPendingInviteCookie(inviteCode);
  await kvSet(PENDING_INVITE_STORAGE_KEY, inviteCode);
  await setPendingInviteCache(inviteCode);
}

export async function clearPendingInviteCode(): Promise<void> {
  cachedPendingInviteCode = null;
  removePendingInviteCookie();
  await kvDelete(PENDING_INVITE_STORAGE_KEY);
  await clearPendingInviteCache();
}

export async function loadPendingInviteFromStorage(): Promise<string | null> {
  const idbInvite = normalizeInviteCode(await kvGet<string>(PENDING_INVITE_STORAGE_KEY));
  if (idbInvite) {
    cachedPendingInviteCode = idbInvite;
    if (!getPendingInviteCodeFromCookie()) {
      setPendingInviteCookie(idbInvite);
    }
    return idbInvite;
  }

  const cookieInvite = getPendingInviteCodeFromCookie();
  if (cookieInvite) {
    cachedPendingInviteCode = cookieInvite;
    await kvSet(PENDING_INVITE_STORAGE_KEY, cookieInvite);
    return cookieInvite;
  }

  const cacheInvite = normalizeInviteCode(await getPendingInviteCache());
  if (cacheInvite) {
    cachedPendingInviteCode = cacheInvite;
    setPendingInviteCookie(cacheInvite);
    await kvSet(PENDING_INVITE_STORAGE_KEY, cacheInvite);
    return cacheInvite;
  }

  return null;
}

export function syncPendingInviteFromLanding(search: string): string | null {
  if (!hasPendingInviteQueryParam(search)) {
    return getStoredPendingInviteCode();
  }

  const queryInvite = parsePendingInviteFromLanding(search);
  if (queryInvite) {
    cachedPendingInviteCode = queryInvite;
    setPendingInviteCookie(queryInvite);
    void kvSet(PENDING_INVITE_STORAGE_KEY, queryInvite);
    void setPendingInviteCache(queryInvite);
    return queryInvite;
  }

  void clearPendingInviteCode();
  return null;
}

async function setPendingInviteCache(inviteCode: string): Promise<void> {
  try {
    const cache = await caches.open(PENDING_INVITE_STORAGE_KEY);
    await cache.put(PENDING_INVITE_STORAGE_KEY, new Response(inviteCode));
  } catch (error) {
    console.error('Error inserting pending invite into cache', error);
  }
}

async function getPendingInviteCache(): Promise<string | undefined> {
  try {
    const cache = await caches.open(PENDING_INVITE_STORAGE_KEY);
    const response = await cache.match(PENDING_INVITE_STORAGE_KEY);
    return response?.text();
  } catch {
    console.warn('Failed fetching pending invite from cache');
    return undefined;
  }
}

async function clearPendingInviteCache(): Promise<void> {
  try {
    await caches.delete(PENDING_INVITE_STORAGE_KEY);
  } catch {
    console.warn('Failed clearing pending invite cache');
  }
}
