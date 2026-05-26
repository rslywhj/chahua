import { describe, expect, it } from 'vitest';
import { buildSavedMessageTarget } from './savedMessages';

describe('saved message helpers', () => {
  it('builds direct chat target for top-level saved messages', () => {
    expect(
      buildSavedMessageTarget({
        originalChatId: '10',
        originalMessageId: '200',
        originalThreadRootId: null,
      }),
    ).toEqual({
      pathname: '/chats/chat/10',
      hash: '#msg=200',
    });
  });

  it('builds direct thread target for saved replies', () => {
    expect(
      buildSavedMessageTarget({
        originalChatId: '10',
        originalMessageId: '201',
        originalThreadRootId: '150',
      }),
    ).toEqual({
      pathname: '/chats/chat/10/thread/150',
      hash: '#msg=201',
    });
  });

  it('URL encodes saved message route ids', () => {
    expect(
      buildSavedMessageTarget({
        originalChatId: 'chat 10/20',
        originalMessageId: 'message #200',
        originalThreadRootId: 'thread/150',
      }),
    ).toEqual({
      pathname: '/chats/chat/chat%2010%2F20/thread/thread%2F150',
      hash: '#msg=message%20%23200',
    });
  });
});
