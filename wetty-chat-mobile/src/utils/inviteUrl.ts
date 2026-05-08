const INVITE_JOIN_PATH_PREFIX = '/chats/join/';

const INVITE_CODE_REGEX = /^[A-Za-z0-9]{10}$/;

export function normalizeInviteCode(value: string | null | undefined): string | null {
  const code = value?.trim();
  return code && INVITE_CODE_REGEX.test(code) ? code : null;
}

export function buildInviteUrl(code: string): string {
  return document.location.origin + INVITE_JOIN_PATH_PREFIX + code;
}

export function parseInviteCodeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== document.location.origin) return null;
    if (!parsed.pathname.startsWith(INVITE_JOIN_PATH_PREFIX)) return null;

    return normalizeInviteCode(parsed.pathname.slice(INVITE_JOIN_PATH_PREFIX.length));
  } catch {
    return null;
  }
}
