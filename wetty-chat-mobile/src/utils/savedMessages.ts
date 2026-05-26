import type { SavedMessageResponse } from '@/api/savedMessages';

export interface SavedMessageTarget {
  pathname: string;
  hash: string;
}

export function buildSavedMessageTarget(
  saved: Pick<SavedMessageResponse, 'originalChatId' | 'originalMessageId' | 'originalThreadRootId'>,
): SavedMessageTarget {
  const chatId = encodeURIComponent(saved.originalChatId);
  const messageId = encodeURIComponent(saved.originalMessageId);

  if (saved.originalThreadRootId) {
    return {
      pathname: `/chats/chat/${chatId}/thread/${encodeURIComponent(saved.originalThreadRootId)}`,
      hash: `#msg=${messageId}`,
    };
  }

  return {
    pathname: `/chats/chat/${chatId}`,
    hash: `#msg=${messageId}`,
  };
}
