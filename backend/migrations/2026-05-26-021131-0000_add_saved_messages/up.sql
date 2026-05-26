CREATE TABLE saved_messages (
    id BIGINT PRIMARY KEY,
    uid INTEGER NOT NULL,
    original_chat_id BIGINT NOT NULL REFERENCES groups(id),
    original_thread_root_id BIGINT NULL REFERENCES messages(id),
    original_message_id BIGINT NOT NULL REFERENCES messages(id),
    original_reply_to_message_id BIGINT NULL REFERENCES messages(id),
    original_sender_uid INTEGER NOT NULL,
    original_created_at TIMESTAMPTZ NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    snapshot_message TEXT NULL,
    snapshot_message_type message_type NOT NULL,
    snapshot_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    snapshot_sticker JSONB NULL,
    snapshot_mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
    snapshot_sender JSONB NOT NULL,
    snapshot_chat JSONB NOT NULL,
    UNIQUE (uid, original_message_id)
);

CREATE INDEX idx_saved_messages_uid_id
    ON saved_messages (uid, id DESC);

CREATE INDEX idx_saved_messages_uid_chat_id
    ON saved_messages (uid, original_chat_id, id DESC);
