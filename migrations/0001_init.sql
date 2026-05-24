CREATE TABLE IF NOT EXISTS nodes (
    node_name TEXT PRIMARY KEY,
    updated_at INTEGER DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS device_log (
    node_name TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
