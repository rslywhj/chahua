export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(encoded: string): string {
  const padding = '='.repeat((4 - (encoded.length % 4)) % 4);
  const base64 = (encoded + padding).replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}

export function base64UrlToUint8Array(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = fromBase64Url(encoded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
