import { createSelector, createSlice } from '@reduxjs/toolkit';
import type { MessageResponse } from '@/api/messages';
import { messageAdded, messageConfirmed, messagePatched, messagesBulkDeleted, reactionsUpdated } from './messageEvents';
import { compareMessageOrder } from './messageProjection';

export interface MessageSegment {
  messages: MessageResponse[];
  nextCursor: string | null;
  prevCursor: string | null;
}

export interface ChatTimelineState {
  segments: MessageSegment[];
  optimisticMessages: MessageResponse[];
  hasReachedOldest: boolean;
  hasReachedLatest: boolean;
  generation: number;
}

export type TimelineMode = { type: 'latest' } | { type: 'around'; targetMessageId: string };

export interface TimelineViewState {
  mode: TimelineMode;
  pendingLiveMessageIds: string[];
}

export interface MessagesState {
  chats: Record<string, ChatTimelineState>;
  views: Record<string, TimelineViewState>;
}

const EMPTY_ARRAY: MessageResponse[] = [];
const DEFAULT_MODE: TimelineMode = { type: 'latest' };

const initialState: MessagesState = {
  chats: {},
  views: {},
};

function isOptimisticMessage(message: Pick<MessageResponse, 'id'>): boolean {
  return message.id.startsWith('cg_');
}

function isSameLogicalMessage(
  left: Pick<MessageResponse, 'id' | 'clientGeneratedId'>,
  right: Pick<MessageResponse, 'id' | 'clientGeneratedId'>,
  fallbackClientGeneratedId?: string,
): boolean {
  if (left.id === right.id) return true;
  const rightClientGeneratedId = right.clientGeneratedId || fallbackClientGeneratedId;
  return !!left.clientGeneratedId && !!rightClientGeneratedId && left.clientGeneratedId === rightClientGeneratedId;
}

function sortMessages(messages: MessageResponse[]): MessageResponse[] {
  return [...messages].sort(compareMessageOrder);
}

function dedupeMessages(messages: MessageResponse[]): MessageResponse[] {
  const result: MessageResponse[] = [];
  for (const message of sortMessages(messages)) {
    const existingIndex = result.findIndex((current) => isSameLogicalMessage(current, message));
    if (existingIndex === -1) {
      result.push(message);
      continue;
    }
    if (!isOptimisticMessage(message)) {
      result[existingIndex] = message;
    }
  }
  return result;
}

function insertMessageSorted(messages: MessageResponse[], message: MessageResponse): MessageResponse[] {
  return dedupeMessages([...messages, message]);
}

function firstMessage(segment: MessageSegment): MessageResponse | undefined {
  return segment.messages[0];
}

function lastMessage(segment: MessageSegment): MessageResponse | undefined {
  return segment.messages[segment.messages.length - 1];
}

function segmentOverlaps(left: MessageSegment, right: MessageSegment): boolean {
  const leftFirst = firstMessage(left);
  const leftLast = lastMessage(left);
  const rightFirst = firstMessage(right);
  const rightLast = lastMessage(right);
  if (!leftFirst || !leftLast || !rightFirst || !rightLast) return false;
  return compareMessageOrder(leftFirst, rightLast) <= 0 && compareMessageOrder(rightFirst, leftLast) <= 0;
}

function normalizeSegments(segments: MessageSegment[]): MessageSegment[] {
  const nonEmpty = segments
    .filter((segment) => segment.messages.length > 0)
    .map((segment) => ({ ...segment, messages: dedupeMessages(segment.messages) }))
    .sort((left, right) => compareMessageOrder(firstMessage(left), firstMessage(right)));

  const result: MessageSegment[] = [];
  for (const segment of nonEmpty) {
    const previous = result[result.length - 1];
    if (!previous || !segmentOverlaps(previous, segment)) {
      result.push(segment);
      continue;
    }
    previous.messages = dedupeMessages([...previous.messages, ...segment.messages]);
    previous.nextCursor = previous.nextCursor ?? segment.nextCursor;
    previous.prevCursor = segment.prevCursor ?? previous.prevCursor;
  }
  return result;
}

function makeSegment(
  messages: MessageResponse[],
  nextCursor: string | null,
  prevCursor: string | null,
): MessageSegment | null {
  const serverMessages = dedupeMessages(messages.filter((message) => !isOptimisticMessage(message)));
  if (serverMessages.length === 0) return null;
  return { messages: serverMessages, nextCursor, prevCursor };
}

function getChat(state: MessagesState, chatId: string): ChatTimelineState {
  if (!state.chats[chatId]) {
    state.chats[chatId] = {
      segments: [],
      optimisticMessages: [],
      hasReachedOldest: false,
      hasReachedLatest: false,
      generation: 0,
    };
  }
  return state.chats[chatId];
}

function getView(state: MessagesState, chatId: string): TimelineViewState {
  if (!state.views[chatId]) {
    state.views[chatId] = { mode: DEFAULT_MODE, pendingLiveMessageIds: [] };
  }
  return state.views[chatId];
}

function latestSegment(chat: ChatTimelineState): MessageSegment | undefined {
  return chat.segments[chat.segments.length - 1];
}

function findSegmentContaining(chat: ChatTimelineState, messageId: string): MessageSegment | undefined {
  return chat.segments.find((segment) => segment.messages.some((message) => message.id === messageId));
}

function takeSegmentContaining(chat: ChatTimelineState, messageId: string): MessageSegment | undefined {
  const index = chat.segments.findIndex((segment) => segment.messages.some((message) => message.id === messageId));
  if (index === -1) return undefined;
  const [segment] = chat.segments.splice(index, 1);
  return segment;
}

function activeSegment(
  chat: ChatTimelineState | undefined,
  view: TimelineViewState | undefined,
): MessageSegment | undefined {
  if (!chat) return undefined;
  const mode = view?.mode ?? DEFAULT_MODE;
  if (mode.type === 'around') {
    return findSegmentContaining(chat, mode.targetMessageId) ?? latestSegment(chat);
  }
  return latestSegment(chat);
}

function removeLogicalMessage(
  chat: ChatTimelineState,
  message: Pick<MessageResponse, 'id' | 'clientGeneratedId'>,
): void {
  chat.optimisticMessages = chat.optimisticMessages.filter((current) => !isSameLogicalMessage(current, message));
  chat.segments = chat.segments
    .map((segment) => ({
      ...segment,
      messages: segment.messages.filter((current) => !isSameLogicalMessage(current, message)),
    }))
    .filter((segment) => segment.messages.length > 0);
}

function insertServerMessage(chat: ChatTimelineState, message: MessageResponse): void {
  if (isOptimisticMessage(message)) {
    upsertOptimisticMessage(chat, message);
    return;
  }
  removeLogicalMessage(chat, message);
  const latest = latestSegment(chat);
  if (!latest) {
    chat.segments = [{ messages: [message], nextCursor: null, prevCursor: null }];
    return;
  }
  latest.messages = insertMessageSorted(latest.messages, message);
  chat.segments = normalizeSegments(chat.segments);
}

function upsertOptimisticMessage(chat: ChatTimelineState, message: MessageResponse): void {
  const next = chat.optimisticMessages.filter((current) => !isSameLogicalMessage(current, message));
  next.push(message);
  chat.optimisticMessages = next;
}

function mergeSegment(chat: ChatTimelineState, segment: MessageSegment): void {
  chat.segments = normalizeSegments([...chat.segments, segment]);
}

function clearPendingLiveForLoadedMessages(view: TimelineViewState, chat: ChatTimelineState): void {
  const loadedIds = new Set(chat.segments.flatMap((segment) => segment.messages.map((message) => message.id)));
  view.pendingLiveMessageIds = view.pendingLiveMessageIds.filter((messageId) => !loadedIds.has(messageId));
}

function allLoadedMessages(chat: ChatTimelineState | undefined): MessageResponse[] {
  if (!chat) return EMPTY_ARRAY;
  return chat.segments.flatMap((segment) => segment.messages);
}

const messagesSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    resetChat(
      state,
      action: {
        payload: { chatId: string; messages: MessageResponse[]; nextCursor: string | null; prevCursor: string | null };
      },
    ) {
      const { chatId, messages, nextCursor, prevCursor } = action.payload;
      const prevGen = state.chats[chatId]?.generation ?? 0;
      const segment = makeSegment(messages, nextCursor, prevCursor);
      state.chats[chatId] = {
        segments: segment ? [segment] : [],
        optimisticMessages: [],
        hasReachedOldest: nextCursor === null,
        hasReachedLatest: prevCursor === null,
        generation: prevGen + 1,
      };
      state.views[chatId] = { mode: DEFAULT_MODE, pendingLiveMessageIds: [] };
    },

    setTimelineMode(state, action: { payload: { chatId: string; mode: TimelineMode } }) {
      const view = getView(state, action.payload.chatId);
      view.mode = action.payload.mode;
      if (action.payload.mode.type === 'latest') {
        view.pendingLiveMessageIds = [];
      }
    },

    clearPendingLiveMessages(state, action: { payload: { chatId: string } }) {
      getView(state, action.payload.chatId).pendingLiveMessageIds = [];
    },

    refreshLatest(
      state,
      action: {
        payload: { chatId: string; messages: MessageResponse[]; nextCursor: string | null; prevCursor: string | null };
      },
    ) {
      const { chatId, messages, nextCursor, prevCursor } = action.payload;
      const chat = getChat(state, chatId);
      const segment = makeSegment(messages, nextCursor, prevCursor);
      const fetchedClientIds = new Set(messages.map((message) => message.clientGeneratedId).filter(Boolean));
      chat.optimisticMessages = chat.optimisticMessages.filter(
        (message) => !message.clientGeneratedId || !fetchedClientIds.has(message.clientGeneratedId),
      );
      if (segment) {
        mergeSegment(chat, segment);
      }
      chat.hasReachedLatest = true;
      chat.hasReachedOldest = nextCursor === null || chat.hasReachedOldest;
      chat.generation++;
      const view = getView(state, chatId);
      view.mode = DEFAULT_MODE;
      clearPendingLiveForLoadedMessages(view, chat);
    },

    insertAround(
      state,
      action: {
        payload: {
          chatId: string;
          targetMessageId: string;
          messages: MessageResponse[];
          nextCursor: string | null;
          prevCursor: string | null;
        };
      },
    ) {
      const { chatId, targetMessageId, messages, nextCursor, prevCursor } = action.payload;
      if (!messages.some((message) => message.id === targetMessageId)) return;
      const segment = makeSegment(messages, nextCursor, prevCursor);
      if (!segment) return;
      const chat = getChat(state, chatId);
      mergeSegment(chat, segment);
      chat.hasReachedOldest = nextCursor === null || chat.hasReachedOldest;
      chat.hasReachedLatest = prevCursor === null || chat.hasReachedLatest;
      chat.generation++;
      getView(state, chatId).mode = { type: 'around', targetMessageId };
    },

    insertBeforeAnchor(
      state,
      action: {
        payload: { chatId: string; anchorMessageId: string; messages: MessageResponse[]; nextCursor: string | null };
      },
    ) {
      const { chatId, anchorMessageId, messages, nextCursor } = action.payload;
      const segment = makeSegment(
        messages.filter((message) => compareMessageOrder(message, { id: anchorMessageId }) < 0),
        nextCursor,
        anchorMessageId,
      );
      const chat = getChat(state, chatId);
      if (segment) {
        const anchorSegment = takeSegmentContaining(chat, anchorMessageId);
        mergeSegment(
          chat,
          anchorSegment
            ? {
                messages: [...segment.messages, ...anchorSegment.messages],
                nextCursor: segment.nextCursor,
                prevCursor: anchorSegment.prevCursor,
              }
            : segment,
        );
      }
      chat.hasReachedOldest = nextCursor === null || chat.hasReachedOldest;
      chat.generation++;
    },

    insertAfterAnchor(
      state,
      action: {
        payload: { chatId: string; anchorMessageId: string; messages: MessageResponse[]; prevCursor: string | null };
      },
    ) {
      const { chatId, anchorMessageId, messages, prevCursor } = action.payload;
      const segment = makeSegment(
        messages.filter((message) => compareMessageOrder(message, { id: anchorMessageId }) > 0),
        anchorMessageId,
        prevCursor,
      );
      const chat = getChat(state, chatId);
      if (segment) {
        const anchorSegment = takeSegmentContaining(chat, anchorMessageId);
        mergeSegment(
          chat,
          anchorSegment
            ? {
                messages: [...anchorSegment.messages, ...segment.messages],
                nextCursor: anchorSegment.nextCursor,
                prevCursor: segment.prevCursor,
              }
            : segment,
        );
      }
      chat.hasReachedLatest = prevCursor === null || chat.hasReachedLatest;
      chat.generation++;
    },

    applyRealtimeMessage(state, action: { payload: { chatId: string; message: MessageResponse } }) {
      const { chatId, message } = action.payload;
      const chat = getChat(state, chatId);
      const view = getView(state, chatId);
      const matchingOptimistic = chat.optimisticMessages.some((current) => isSameLogicalMessage(current, message));
      if (matchingOptimistic) {
        removeLogicalMessage(chat, message);
        insertServerMessage(chat, message);
        chat.hasReachedLatest = true;
        chat.generation++;
        return;
      }

      const exists = allLoadedMessages(chat).some((current) => isSameLogicalMessage(current, message));
      if (exists) {
        insertServerMessage(chat, message);
        chat.generation++;
        return;
      }

      if (chat.hasReachedLatest && view.mode.type === 'latest') {
        insertServerMessage(chat, message);
        chat.generation++;
        return;
      }

      if (!view.pendingLiveMessageIds.includes(message.id)) {
        view.pendingLiveMessageIds.push(message.id);
      }
    },

    confirmOptimistic(
      state,
      action: { payload: { chatId: string; clientGeneratedId: string; message: MessageResponse } },
    ) {
      const { chatId, clientGeneratedId, message } = action.payload;
      const chat = getChat(state, chatId);
      const resolvedMessage = { ...message, clientGeneratedId: message.clientGeneratedId || clientGeneratedId };
      removeLogicalMessage(chat, resolvedMessage);
      insertServerMessage(chat, resolvedMessage);
      chat.hasReachedLatest = true;
      chat.generation++;
    },

    markOptimisticFailed(state, action: { payload: { chatId: string; clientGeneratedId: string } }) {
      const chat = getChat(state, action.payload.chatId);
      const failed = chat.optimisticMessages.find(
        (message) =>
          message.clientGeneratedId === action.payload.clientGeneratedId ||
          message.id === action.payload.clientGeneratedId,
      );
      if (!failed) return;
      failed.isDeleted = true;
      chat.generation++;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(messageAdded, (state, action) => {
        const { storeChatId, message, origin } = action.payload;
        const chat = getChat(state, storeChatId);
        if (origin === 'optimistic' || isOptimisticMessage(message)) {
          upsertOptimisticMessage(chat, message);
          getView(state, storeChatId).mode = DEFAULT_MODE;
          chat.hasReachedLatest = true;
          chat.generation++;
          return;
        }
        if (origin !== 'ws') {
          insertServerMessage(chat, message);
          chat.hasReachedLatest = true;
          chat.generation++;
          return;
        }
        messagesSlice.caseReducers.applyRealtimeMessage(state, {
          payload: { chatId: storeChatId, message },
        });
      })
      .addCase(messageConfirmed, (state, action) => {
        messagesSlice.caseReducers.confirmOptimistic(state, {
          payload: {
            chatId: action.payload.storeChatId,
            clientGeneratedId: action.payload.clientGeneratedId,
            message: action.payload.message,
          },
        });
      })
      .addCase(messagePatched, (state, action) => {
        const { chatId: baseChatId, messageId, message } = action.payload;
        for (const [storeKey, chat] of Object.entries(state.chats)) {
          if (storeKey !== baseChatId && !storeKey.startsWith(`${baseChatId}_thread_`)) continue;
          if (message.isDeleted) {
            chat.optimisticMessages = chat.optimisticMessages.filter((m) => m.id !== messageId);
          }
          for (const segment of chat.segments) {
            if (message.isDeleted) {
              segment.messages = segment.messages.filter((m) => m.id !== messageId);
            }
            for (let i = 0; i < segment.messages.length; i++) {
              const current = segment.messages[i];
              if (!message.isDeleted && current.id === messageId) {
                segment.messages[i] = {
                  ...current,
                  ...message,
                  replyToMessage: message.replyToMessage ?? current.replyToMessage,
                  reactions: message.reactions ?? current.reactions,
                  threadInfo: message.threadInfo ?? current.threadInfo,
                };
              } else if (current.replyToMessage?.id === messageId) {
                current.replyToMessage.message = message.message;
                current.replyToMessage.messageType = message.messageType;
                current.replyToMessage.sticker = message.sticker;
                current.replyToMessage.isDeleted = message.isDeleted;
                current.replyToMessage.attachments = message.attachments;
                current.replyToMessage.firstAttachmentKind = message.attachments?.[0]?.kind;
                current.replyToMessage.mentions = message.mentions;
              }
            }
          }
          chat.segments = chat.segments.filter((segment) => segment.messages.length > 0);
          chat.generation++;
        }
      })
      .addCase(messagesBulkDeleted, (state, action) => {
        const { chatId, messageIds } = action.payload;
        const idSet = new Set(messageIds);
        for (const [storeKey, chat] of Object.entries(state.chats)) {
          if (storeKey !== chatId && !storeKey.startsWith(`${chatId}_thread_`)) continue;
          chat.optimisticMessages = chat.optimisticMessages.filter((message) => !idSet.has(message.id));
          for (const segment of chat.segments) {
            segment.messages = segment.messages.filter((message) => !idSet.has(message.id));
            for (const message of segment.messages) {
              if (message.replyToMessage && idSet.has(message.replyToMessage.id)) {
                message.replyToMessage.isDeleted = true;
                message.replyToMessage.message = null;
                message.replyToMessage.attachments = [];
              }
            }
          }
          chat.segments = chat.segments.filter((segment) => segment.messages.length > 0);
          chat.generation++;
        }
      })
      .addCase(reactionsUpdated, (state, action) => {
        const { chatId, messageId, reactions } = action.payload;
        for (const [storeKey, chat] of Object.entries(state.chats)) {
          if (storeKey !== chatId && !storeKey.startsWith(`${chatId}_thread_`)) continue;
          for (const segment of chat.segments) {
            for (let i = 0; i < segment.messages.length; i++) {
              if (segment.messages[i].id === messageId) {
                const existing = segment.messages[i].reactions ?? [];
                const merged = reactions.map((reaction) => {
                  const prev = existing.find((item) => item.emoji === reaction.emoji);
                  return { ...reaction, reactedByMe: reaction.reactedByMe ?? prev?.reactedByMe };
                });
                segment.messages[i] = { ...segment.messages[i], reactions: merged };
              }
            }
          }
        }
      });
  },
});

export const {
  resetChat,
  setTimelineMode,
  clearPendingLiveMessages,
  refreshLatest,
  insertAround,
  insertBeforeAnchor,
  insertAfterAnchor,
  applyRealtimeMessage,
  confirmOptimistic,
  markOptimisticFailed,
} = messagesSlice.actions;

const selectMessagesChats = (state: { messages: MessagesState }) => state.messages.chats;
const selectMessagesViews = (state: { messages: MessagesState }) => state.messages.views;

export const selectTimelineMode = createSelector(
  [selectMessagesViews, (_state: { messages: MessagesState }, chatId: string) => chatId],
  (views, chatId): TimelineMode => views[chatId]?.mode ?? DEFAULT_MODE,
);

export const selectActiveTimelineMessages = createSelector(
  [selectMessagesChats, selectMessagesViews, (_state: { messages: MessagesState }, chatId: string) => chatId],
  (chats, views, chatId): MessageResponse[] => {
    const chat = chats[chatId];
    const segment = activeSegment(chat, views[chatId]);
    if (!chat || !segment) return chat?.optimisticMessages ?? EMPTY_ARRAY;
    if ((views[chatId]?.mode ?? DEFAULT_MODE).type === 'latest') {
      return [...segment.messages, ...chat.optimisticMessages];
    }
    return segment.messages;
  },
);

export function selectCanLoadOlder(state: { messages: MessagesState }, chatId: string): boolean {
  const chat = state.messages.chats[chatId];
  const segment = activeSegment(chat, state.messages.views[chatId]);
  if (!chat || !segment) return false;
  return segment.nextCursor !== null || segment !== chat.segments[0] || !chat.hasReachedOldest;
}

export function selectCanLoadNewer(state: { messages: MessagesState }, chatId: string): boolean {
  const chat = state.messages.chats[chatId];
  const segment = activeSegment(chat, state.messages.views[chatId]);
  if (!chat || !segment) return false;
  return segment.prevCursor !== null || segment !== latestSegment(chat) || !chat.hasReachedLatest;
}

export function selectOlderAnchor(state: { messages: MessagesState }, chatId: string): string | null {
  const chat = state.messages.chats[chatId];
  const segment = activeSegment(chat, state.messages.views[chatId]);
  return segment?.nextCursor ?? segment?.messages[0]?.id ?? null;
}

export function selectNewerAnchor(state: { messages: MessagesState }, chatId: string): string | null {
  const chat = state.messages.chats[chatId];
  const segment = activeSegment(chat, state.messages.views[chatId]);
  return segment?.prevCursor ?? segment?.messages[segment.messages.length - 1]?.id ?? null;
}

export function selectPendingLiveCount(state: { messages: MessagesState }, chatId: string): number {
  return state.messages.views[chatId]?.pendingLiveMessageIds.length ?? 0;
}

export function selectChatGeneration(state: { messages: MessagesState }, chatId: string): number {
  return state.messages.chats[chatId]?.generation ?? 0;
}

export function selectHasLoadedTimeline(state: { messages: MessagesState }, chatId: string): boolean {
  const chat = state.messages.chats[chatId];
  return !!chat && (chat.segments.length > 0 || chat.optimisticMessages.length > 0);
}

export function selectLatestServerMessage(state: { messages: MessagesState }, chatId: string): MessageResponse | null {
  const chat = state.messages.chats[chatId];
  const segment = latestSegment(chat);
  return segment?.messages[segment.messages.length - 1] ?? null;
}

export function selectAllTimelineMessages(state: { messages: MessagesState }, chatId: string): MessageResponse[] {
  const chat = state.messages.chats[chatId];
  if (!chat) return EMPTY_ARRAY;
  return [...allLoadedMessages(chat), ...chat.optimisticMessages];
}

export function selectLatestThreadReplyMessage(
  state: { messages: MessagesState },
  chatId: string,
  threadRootId: string,
): MessageResponse | null {
  const storeKey = `${chatId}_thread_${threadRootId}`;
  const messages = selectAllTimelineMessages(state, storeKey);
  let latest: MessageResponse | null = null;
  for (const message of messages) {
    if (message.isDeleted) continue;
    if (!latest || compareMessageOrder(message, latest) > 0) {
      latest = message;
    }
  }
  return latest;
}

export default messagesSlice.reducer;
