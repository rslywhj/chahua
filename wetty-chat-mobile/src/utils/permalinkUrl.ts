import { base64UrlToUint8Array, toBase64Url } from '@/utils/base64url';

const PERMALINK_PATH_PREFIX = '/m/';

/**
 * Pack two snowflake ID strings into a base64url-encoded segment.
 * Each ID is treated as a BigInt and written as an 8-byte big-endian value,
 * giving 16 bytes total → 22 base64url characters (no padding).
 */
export function encodePermalink(chatId: string, messageId: string): string {
  const buf = new ArrayBuffer(16);
  const view = new DataView(buf);
  view.setBigUint64(0, BigInt(chatId));
  view.setBigUint64(8, BigInt(messageId));

  return toBase64Url(new Uint8Array(buf));
}

export function decodePermalink(encoded: string): { chatId: string; messageId: string } {
  if (!encoded) {
    throw new Error('Missing permalink segment');
  }

  const bytes = base64UrlToUint8Array(encoded);
  if (bytes.length !== 16) {
    throw new Error(`Invalid permalink payload length: ${bytes.length}`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chatId = view.getBigUint64(0).toString();
  const messageId = view.getBigUint64(8).toString();

  return { chatId, messageId };
}

export function buildPermalinkUrl(chatId: string, messageId: string): string {
  return document.location.origin + PERMALINK_PATH_PREFIX + encodePermalink(chatId, messageId);
}

export function parsePermalinkSegment(pathname: string): string | null {
  if (!pathname.startsWith(PERMALINK_PATH_PREFIX)) return null;
  const segment = pathname.slice(PERMALINK_PATH_PREFIX.length);
  if (!segment) return null;
  return segment;
}
