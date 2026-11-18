import { bus } from '../bus.js';
import { dbState, checkDb } from '../database/index.js';
import { logEvent } from './events.js';

/**
 * Connection manager: single source of truth for link health.
 *  - esp32:   updated by telemetry polling AND by command results
 *  - camera:  updated by the camera hub (stream frames / TCP probe)
 *  - database: updated by DB writes and periodic health check
 */
const FAILURES_BEFORE_DISCONNECT = 3;

const state = {
  esp32: { status: 'connecting', lastOk: null, lastError: null, latencyMs: null, failures: 0, since: Date.now() },
  camera: { status: 'connecting', lastOk: null, lastFrame: null, lastError: null, viewers: 0, fps: 0, idle: true, since: Date.now() },
  database: { status: 'connected', lastOk: null, lastSave: null, lastError: null },
};

export const isEspConnected = () => state.esp32.status === 'connected';

export function espSuccess(latencyMs) {
  const e = state.esp32;
  const was = e.status;
  e.lastOk = Date.now();
  e.latencyMs = latencyMs;
  e.failures = 0;
  e.lastError = null;
  if (was !== 'connected') {
    e.status = 'connected';
    e.since = Date.now();
    logEvent({ type: 'esp32_connected', severity: 'info', description: 'Main ESP32 connected' });
    bus.emit('esp32:up');
    bus.emit('connections', getConnections());
  }
}

export function espFailure(message) {
  const e = state.esp32;
  e.failures += 1;
  e.lastError = message;
  if (e.status === 'connected' && e.failures >= FAILURES_BEFORE_DISCONNECT) {
    e.status = 'disconnected';
    e.since = Date.now();
    logEvent({ type: 'esp32_disconnected', severity: 'error', description: `Main ESP32 disconnected: ${message}` });
    bus.emit('esp32:lost');
    bus.emit('connections', getConnections());
  } else if (e.status === 'connecting' && e.failures >= FAILURES_BEFORE_DISCONNECT) {
    e.status = 'disconnected';
    e.since = Date.now();
    bus.emit('connections', getConnections());
  }
}

export function espConnecting() {
  const e = state.esp32;
  if (e.status !== 'connected') {
    e.status = 'connecting';
    e.failures = 0;
    bus.emit('connections', getConnections());
  }
}

/** Called by the camera hub. `extra` carries viewers / fps / idle / lastFrame. */
export function setCamera(status, error = null, extra = {}) {
  const c = state.camera;
  const was = c.status;
  Object.assign(c, extra);
  if (status === undefined) return; // stats-only update
  if (status === 'connected') {
    c.lastOk = Date.now();
    c.lastError = null;
  } else if (error) c.lastError = error;
  if (status !== was) {
    c.status = status;
    c.since = Date.now();
    if (status === 'connected') logEvent({ type: 'camera_connected', severity: 'info', description: 'ESP32-CAM connected' });
    if (status === 'disconnected' && was !== 'connecting')
      logEvent({ type: 'camera_disconnected', severity: 'warning', description: `ESP32-CAM disconnected${error ? `: ${error}` : ''}` });
    bus.emit('connections', getConnections());
  }
}

export function getConnections() {
  const db = state.database;
  db.status = dbState.ok ? 'connected' : 'disconnected';
  db.lastSave = dbState.lastSave;
  db.lastError = dbState.lastError;
  db.lastOk = dbState.lastSave ?? db.lastOk;
  return {
    esp32: { ...state.esp32 },
    camera: { ...state.camera },
    database: { ...db },
    // The backend only reaches the ESP32 via the robot's Wi-Fi, so link health == ESP32 reachability.
    wifi: { status: state.esp32.status },
  };
}

export function startDbWatch() {
  setInterval(() => {
    const ok = checkDb();
    if (ok) dbState.ok = true;
    bus.emit('connections', getConnections());
  }, 10000).unref();
}
