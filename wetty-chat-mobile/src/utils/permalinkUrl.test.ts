import { describe, expect, it } from 'vitest';
import { decodePermalink, encodePermalink, parsePermalinkSegment } from './permalinkUrl';

describe('permalink URL helpers', () => {
  it('packs chat and message ids into a fixed-width segment', () => {
    expect(encodePermalink('1', '2')).toBe('AAAAAAAAAAEAAAAAAAAAAg');
  });

  it('decodes packed permalink segments', () => {
    expect(decodePermalink(encodePermalink('123456789', '987654321'))).toEqual({
      chatId: '123456789',
      messageId: '987654321',
    });
  });

  it('rejects payloads with the wrong byte length', () => {
    expect(() => decodePermalink('AQ')).toThrow('Invalid permalink payload length: 1');
  });

  it('parses permalink path segments', () => {
    expect(parsePermalinkSegment('/m/AAAAAAAAAAEAAAAAAAAAAg')).toBe('AAAAAAAAAAEAAAAAAAAAAg');
    expect(parsePermalinkSegment('/chats')).toBeNull();
    expect(parsePermalinkSegment('/m/')).toBeNull();
  });
});
