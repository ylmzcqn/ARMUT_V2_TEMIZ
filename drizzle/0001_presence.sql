-- Prepared schema only. Apply once through the approved hosted migration flow.
CREATE TABLE presence_state (
 device_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK (revision >= 1),
 state_json TEXT NOT NULL
);
