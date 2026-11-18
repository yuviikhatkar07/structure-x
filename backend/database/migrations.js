/**
 * Versioned schema migrations. `PRAGMA user_version` records the last applied version.
 * Append new migrations at the end; never edit an applied one.
 */
export const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE operators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        role TEXT,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );

      CREATE TABLE missions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        location TEXT,
        operator TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'planned'
          CHECK (status IN ('planned','active','paused','completed','aborted')),
        planned_start INTEGER,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        ended_at INTEGER,
        notes TEXT
      );
      CREATE INDEX idx_missions_status ON missions(status);
      CREATE INDEX idx_missions_created ON missions(created_at);

      CREATE TABLE mission_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        ts INTEGER NOT NULL,
        operator TEXT,
        text TEXT NOT NULL
      );
      CREATE INDEX idx_notes_mission ON mission_notes(mission_id);

      CREATE TABLE sensor_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        mission_id INTEGER REFERENCES missions(id) ON DELETE SET NULL,
        distance REAL,
        temperature REAL,
        humidity REAL,
        gas REAL,
        motion INTEGER,
        movement TEXT,
        device_risk TEXT,
        risk_level TEXT,
        battery REAL
      );
      CREATE INDEX idx_readings_ts ON sensor_readings(ts);
      CREATE INDEX idx_readings_mission ON sensor_readings(mission_id, ts);

      CREATE TABLE risk_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        mission_id INTEGER REFERENCES missions(id) ON DELETE SET NULL,
        level TEXT NOT NULL,
        prev_level TEXT,
        reasons TEXT,
        readings TEXT,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        ack_ts INTEGER,
        ack_by TEXT
      );
      CREATE INDEX idx_risk_ts ON risk_events(ts);
      CREATE INDEX idx_risk_mission ON risk_events(mission_id);

      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info'
          CHECK (severity IN ('info','warning','error','critical')),
        description TEXT NOT NULL,
        mission_id INTEGER REFERENCES missions(id) ON DELETE SET NULL,
        operator TEXT,
        meta TEXT
      );
      CREATE INDEX idx_events_ts ON events(ts);
      CREATE INDEX idx_events_type ON events(type);
      CREATE INDEX idx_events_mission ON events(mission_id);

      CREATE TABLE snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        mission_id INTEGER REFERENCES missions(id) ON DELETE SET NULL,
        operator TEXT,
        note TEXT,
        risk_level TEXT,
        filename TEXT NOT NULL,
        size_bytes INTEGER,
        source TEXT NOT NULL DEFAULT 'camera'
      );
      CREATE INDEX idx_snap_ts ON snapshots(ts);
      CREATE INDEX idx_snap_mission ON snapshots(mission_id);

      CREATE TABLE reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        filename TEXT NOT NULL,
        size_bytes INTEGER,
        generated_by TEXT
      );
      CREATE INDEX idx_reports_mission ON reports(mission_id);
    `,
  },
];
