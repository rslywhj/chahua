import { describe, expect, it } from 'vitest';
import { base64UrlToUint8Array, fromBase64Url, toBase64Url } from './base64url';

describe('base64url helpers', () => {
  it('encodes bytes with the URL-safe alphabet and no padding', () => {
    expect(toBase64Url(new Uint8Array([251, 255, 255]))).toBe('-___');
    expect(toBase64Url(new Uint8Array([1]))).toBe('AQ');
  });

  it('decodes URL-safe base64 with omitted padding', () => {
    expect(fromBase64Url('AQ')).toBe('\x01');
    expect(Array.from(base64UrlToUint8Array('-___'))).toEqual([251, 255, 255]);
  });

  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    expect(base64UrlToUint8Array(toBase64Url(bytes))).toEqual(bytes);
  });
});
