import { describe, expect, it } from 'vitest';
import { createStore, type RootState } from './index';
import reducer, {
  applyRealtimeMessage,
  clearPendingLiveMessages,
  confirmOptimistic,
  insertAfterAnchor,
  insertAround,
  insertBeforeAnchor,
  markOptimisticFailed,
  refreshLatest,
  selectActiveTimelineMessages,
  selectAllTimelineMessages,
  selectCanLoadNewer,
  selectCanLoadOlder,
  selectHasLoadedTimeline,
  selectLatestServerMessage,
  selectLatestThreadReplyMessage,
  selectNewerAnchor,
  selectOlderAnchor,
  selectPendingLiveCount,
  setTimelineMode,
  type MessagesState,
} from './messagesSlice';
import { selectAllChats, selectChatUnreadCount } from './chatsSlice';
import { messageAdded, messageConfirmed, messagePatched, messagesBulkDeleted, reactionsUpdated } from './messageEvents';
import type { MessageResponse } from '@/api/messages';

function message(
  id: string,
  clientGeneratedId = `client-${id}`,
  patch: Partial<MessageResponse> = {},
): MessageResponse {
  const numericId = Number(id.replace(/\D/g, '')) || 1;
  return {
    id,
    clientGeneratedId,
    chatId: '1',
    replyRootId: null,
    message: `message ${id}`,
    messageType: 'text',
    sender: { uid: 2, name: 'User', gender: 0 },
    createdAt: new Date(numericId).toISOString(),
    isEdited: false,
    isDeleted: false,
    hasAttachments: false,
    ...patch,
  };
}

function optimisticMessage(clientGeneratedId = 'client-optimistic'): MessageResponse {
  return message('cg_1', clientGeneratedId, { createdAt: new Date(999).toISOString() });
}

function ids(messages: MessageResponse[]): string[] {
  return messages.map((item) => item.id);
}

function segmentIds(messages: MessagesState, chatId = '1'): string[][] {
  return messages.chats[chatId]?.segments.map((segment) => ids(segment.messages)) ?? [];
}

function state(messages: MessagesState): { messages: MessagesState } {
  return { messages };
}

function addOptimistic(state: MessagesState, optimistic = optimisticMessage()): MessagesState {
  return reducer(
    state,
    messageAdded({ chatId: '1', storeChatId: '1', message: optimistic, origin: 'optimistic', scope: 'main' }),
  );
}

describe('messagesSlice canonical timeline reducers', () => {
  it('refreshes latest into an empty timeline', () => {
    const next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('2'), message('1')], nextCursor: '1', prevCursor: null }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['1', '2']);
    expect(next.chats['1'].hasReachedLatest).toBe(true);
    expect(next.chats['1'].hasReachedOldest).toBe(false);
  });

  it('refreshes latest by merging overlap with existing segments', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '2',
        messages: [message('1'), message('2')],
        nextCursor: null,
        prevCursor: '2',
      }),
    );
    next = reducer(
      next,
      refreshLatest({ chatId: '1', messages: [message('4'), message('5')], nextCursor: '4', prevCursor: null }),
    );
    next = reducer(
      next,
      refreshLatest({
        chatId: '1',
        messages: [message('3'), message('4'), message('4', 'client-4-new')],
        nextCursor: '3',
        prevCursor: null,
      }),
    );

    expect(segmentIds(next)).toEqual([
      ['1', '2'],
      ['3', '4', '5'],
    ]);
    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['3', '4', '5']);
  });

  it('preserves unconfirmed optimistic messages across latest refreshes', () => {
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('10')], nextCursor: '10', prevCursor: null }),
    );
    next = addOptimistic(next, optimisticMessage('client-pending'));
    next = reducer(
      next,
      refreshLatest({ chatId: '1', messages: [message('10'), message('11')], nextCursor: '10', prevCursor: null }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['10', '11', 'cg_1']);
  });

  it('removes optimistic messages when latest refresh contains the same clientGeneratedId', () => {
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('10')], nextCursor: '10', prevCursor: null }),
    );
    next = addOptimistic(next, optimisticMessage('client-11'));
    next = reducer(
      next,
      refreshLatest({
        chatId: '1',
        messages: [message('10'), message('11', 'client-11')],
        nextCursor: '10',
        prevCursor: null,
      }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['10', '11']);
    expect(next.chats['1'].optimisticMessages).toEqual([]);
  });

  it('inserts around a historical target without disturbing latest', () => {
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('20'), message('21')], nextCursor: '20', prevCursor: null }),
    );
    next = reducer(
      next,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('9'), message('10'), message('11')],
        nextCursor: '9',
        prevCursor: '11',
      }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['9', '10', '11']);
    expect(selectCanLoadNewer(state(next), '1')).toBe(true);

    next = reducer(next, setTimelineMode({ chatId: '1', mode: { type: 'latest' } }));
    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['20', '21']);
  });

  it('ignores around fetches that do not contain the target message', () => {
    const next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('8'), message('9')],
        nextCursor: '8',
        prevCursor: '9',
      }),
    );

    expect(next.chats['1']).toBeUndefined();
    expect(selectActiveTimelineMessages(state(next), '1')).toEqual([]);
  });

  it('normalizes around and overlapping newer ranges', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('9'), message('10'), message('11')],
        nextCursor: '9',
        prevCursor: '11',
      }),
    );
    next = reducer(
      next,
      insertAfterAnchor({
        chatId: '1',
        anchorMessageId: '11',
        messages: [message('11'), message('12'), message('13')],
        prevCursor: null,
      }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['9', '10', '11', '12', '13']);
    expect(selectCanLoadNewer(state(next), '1')).toBe(false);
  });

  it('inserts older history before the active segment', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('10'), message('11')],
        nextCursor: '10',
        prevCursor: null,
      }),
    );
    next = reducer(
      next,
      insertBeforeAnchor({
        chatId: '1',
        anchorMessageId: '10',
        messages: [message('8'), message('9')],
        nextCursor: null,
      }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['8', '9', '10', '11']);
    expect(next.chats['1'].hasReachedOldest).toBe(true);
  });

  it('filters before-anchor fetches to messages older than the anchor', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('10'), message('11')],
        nextCursor: '10',
        prevCursor: null,
      }),
    );
    next = reducer(
      next,
      insertBeforeAnchor({
        chatId: '1',
        anchorMessageId: '10',
        messages: [message('9'), message('10'), message('12')],
        nextCursor: '9',
      }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['9', '10', '11']);
  });

  it('merges newer history into latest when the fetched range closes the gap', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('9'), message('10')],
        nextCursor: '9',
        prevCursor: '10',
      }),
    );
    next = reducer(
      next,
      refreshLatest({ chatId: '1', messages: [message('13'), message('14')], nextCursor: '13', prevCursor: null }),
    );
    next = reducer(next, setTimelineMode({ chatId: '1', mode: { type: 'around', targetMessageId: '10' } }));
    next = reducer(
      next,
      insertAfterAnchor({
        chatId: '1',
        anchorMessageId: '10',
        messages: [message('11'), message('12'), message('13')],
        prevCursor: null,
      }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['9', '10', '11', '12', '13', '14']);
    expect(segmentIds(next)).toEqual([['9', '10', '11', '12', '13', '14']]);
    expect(selectCanLoadNewer(state(next), '1')).toBe(false);
  });

  it('tracks pending live messages while browsing history', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('9'), message('10'), message('11')],
        nextCursor: '9',
        prevCursor: '11',
      }),
    );
    next = reducer(next, applyRealtimeMessage({ chatId: '1', message: message('20') }));

    expect(selectPendingLiveCount(state(next), '1')).toBe(1);
    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['9', '10', '11']);
  });

  it('does not add duplicate pending live ids for repeated websocket messages', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('10')],
        nextCursor: '10',
        prevCursor: '10',
      }),
    );
    next = reducer(next, applyRealtimeMessage({ chatId: '1', message: message('20') }));
    next = reducer(next, applyRealtimeMessage({ chatId: '1', message: message('20') }));

    expect(selectPendingLiveCount(state(next), '1')).toBe(1);
  });

  it('applies realtime messages when latest is active', () => {
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('10'), message('12')], nextCursor: '10', prevCursor: null }),
    );
    next = reducer(next, applyRealtimeMessage({ chatId: '1', message: message('11') }));

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['10', '11', '12']);
  });

  it('confirms optimistic messages without duplicates', () => {
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('10')], nextCursor: '10', prevCursor: null }),
    );
    next = addOptimistic(next, optimisticMessage('client-1'));
    next = reducer(
      next,
      confirmOptimistic({ chatId: '1', clientGeneratedId: 'client-1', message: message('11', 'client-1') }),
    );
    next = reducer(next, applyRealtimeMessage({ chatId: '1', message: message('11', 'client-1') }));

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['10', '11']);
  });

  it('marks optimistic messages as failed with the current fallback representation', () => {
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('10')], nextCursor: '10', prevCursor: null }),
    );
    next = addOptimistic(next, optimisticMessage('client-failed'));
    next = reducer(next, markOptimisticFailed({ chatId: '1', clientGeneratedId: 'client-failed' }));

    expect(next.chats['1'].optimisticMessages[0].isDeleted).toBe(true);
  });

  it('does not inject optimistic messages into historical slices', () => {
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('20')], nextCursor: '20', prevCursor: null }),
    );
    next = addOptimistic(next, optimisticMessage('client-21'));
    next = reducer(
      next,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('9'), message('10')],
        nextCursor: '9',
        prevCursor: '10',
      }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['9', '10']);
  });

  it('patches, deletes, bulk deletes, and reacts across loaded main/thread segments', () => {
    const replyToMessage = {
      id: '10',
      clientGeneratedId: 'client-10',
      createdAt: message('10').createdAt,
      message: 'message 10',
      messageType: 'text' as const,
      sender: { uid: 2, name: 'User', gender: 0 },
      isDeleted: false,
    };
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('10'), message('11')], nextCursor: null, prevCursor: null }),
    );
    next = reducer(
      next,
      refreshLatest({
        chatId: '1_thread_10',
        messages: [message('12', 'client-12', { replyRootId: '10', replyToMessage })],
        nextCursor: null,
        prevCursor: null,
      }),
    );
    next = reducer(
      next,
      messagePatched({ chatId: '1', messageId: '10', message: { ...message('10'), message: 'edited' } }),
    );
    next = reducer(
      next,
      reactionsUpdated({
        chatId: '1',
        messageId: '11',
        reactions: [{ emoji: 'thumbs-up', count: 1, reactedByMe: true }],
      }),
    );
    next = reducer(next, messagesBulkDeleted({ chatId: '1', messageIds: ['10'] }));

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['11']);
    expect(selectActiveTimelineMessages(state(next), '1')[0].reactions?.[0]?.emoji).toBe('thumbs-up');
    expect(selectActiveTimelineMessages(state(next), '1_thread_10')[0].replyToMessage?.isDeleted).toBe(true);
    expect(selectActiveTimelineMessages(state(next), '1_thread_10')[0].replyToMessage?.message).toBeNull();
  });

  it('exposes selectors for anchors, loadability, loaded timelines, latest, and thread replies', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('10')],
        nextCursor: 'older-cursor',
        prevCursor: 'newer-cursor',
      }),
    );
    next = reducer(
      next,
      refreshLatest({
        chatId: '1_thread_10',
        messages: [
          message('12', 'client-12', { replyRootId: '10' }),
          message('11', 'client-11', { replyRootId: '10' }),
        ],
        nextCursor: null,
        prevCursor: null,
      }),
    );

    expect(selectHasLoadedTimeline(state(next), '1')).toBe(true);
    expect(selectCanLoadOlder(state(next), '1')).toBe(true);
    expect(selectCanLoadNewer(state(next), '1')).toBe(true);
    expect(selectOlderAnchor(state(next), '1')).toBe('older-cursor');
    expect(selectNewerAnchor(state(next), '1')).toBe('newer-cursor');
    expect(selectLatestServerMessage(state(next), '1')?.id).toBe('10');
    expect(ids(selectAllTimelineMessages(state(next), '1_thread_10'))).toEqual(['11', '12']);
    expect(selectLatestThreadReplyMessage(state(next), '1', '10')?.id).toBe('12');
  });

  it('exposes anchors for newer loading and clears pending live state', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('10')],
        nextCursor: '10',
        prevCursor: '10',
      }),
    );
    next = reducer(next, applyRealtimeMessage({ chatId: '1', message: message('20') }));
    expect(selectNewerAnchor(state(next), '1')).toBe('10');
    next = reducer(next, setTimelineMode({ chatId: '1', mode: { type: 'latest' } }));
    next = reducer(next, clearPendingLiveMessages({ chatId: '1' }));
    expect(selectPendingLiveCount(state(next), '1')).toBe(0);
  });
});

describe('messagesSlice production message event paths', () => {
  it('routes websocket messages through pending-live state while browsing history', () => {
    let next = reducer(
      undefined,
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('9'), message('10'), message('11')],
        nextCursor: '9',
        prevCursor: '11',
      }),
    );
    next = reducer(
      next,
      messageAdded({ chatId: '1', storeChatId: '1', message: message('20'), origin: 'ws', scope: 'main' }),
    );

    expect(selectPendingLiveCount(state(next), '1')).toBe(1);
    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['9', '10', '11']);
  });

  it('routes websocket messages through sorted latest insertion when latest is active', () => {
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('10'), message('12')], nextCursor: '10', prevCursor: null }),
    );
    next = reducer(
      next,
      messageAdded({ chatId: '1', storeChatId: '1', message: message('11'), origin: 'ws', scope: 'main' }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['10', '11', '12']);
  });

  it('dedupes API confirmation and later websocket echo through production events', () => {
    let next = reducer(
      undefined,
      refreshLatest({ chatId: '1', messages: [message('10')], nextCursor: '10', prevCursor: null }),
    );
    next = addOptimistic(next, optimisticMessage('client-11'));
    next = reducer(
      next,
      messageConfirmed({
        chatId: '1',
        storeChatId: '1',
        clientGeneratedId: 'client-11',
        message: message('11', 'client-11'),
        origin: 'api_confirm',
        scope: 'main',
      }),
    );
    next = reducer(
      next,
      messageAdded({ chatId: '1', storeChatId: '1', message: message('11', 'client-11'), origin: 'ws', scope: 'main' }),
    );

    expect(ids(selectActiveTimelineMessages(state(next), '1'))).toEqual(['10', '11']);
  });
});

describe('message listener projections', () => {
  it('projects websocket message events into the chat list while preserving historical rendering', async () => {
    const store = createStore();

    store.dispatch(
      insertAround({
        chatId: '1',
        targetMessageId: '10',
        messages: [message('10')],
        nextCursor: '10',
        prevCursor: '10',
      }),
    );
    store.dispatch(
      messageAdded({ chatId: '1', storeChatId: '1', message: message('20'), origin: 'ws', scope: 'main' }),
    );
    await Promise.resolve();

    const root = store.getState() as RootState;
    expect(selectPendingLiveCount(root, '1')).toBe(1);
    expect(ids(selectActiveTimelineMessages(root, '1'))).toEqual(['10']);
    expect(selectAllChats(root)[0].lastMessage?.id).toBe('20');
    expect(selectChatUnreadCount(root, '1')).toBe(1);
  });
});
