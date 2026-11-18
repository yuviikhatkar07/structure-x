import { all, run } from '../database/index.js';
import { bus, live } from '../bus.js';
import { getSettings } from './settings.js';
import { getDevice } from './device.js';
import { espSuccess, espFailure, espConnecting, getConnections, isEspConnected } from './connections.js';
import { updateRisk, getCurrentRisk } from './risk.js';
import { logEvent } from './events.js';

/** Convert whatever the firmware sent into validated values. Invalid readings become null – never 0. */
export function normalize(raw, now = Date.now()) {
  const num = (v) => {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const bool = (v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return ['1', 'true', 'yes', 'detected'].includes(v.toLowerCase());
    return !!v;
  };

  let distance = num(raw.distance);
  const distanceValid = distance !== null && distance > 0 && distance <= 400;
  if (!distanceValid) distance = null;

  let temperature = num(raw.temperature ?? raw.temp);
  if (temperature !== null && (temperature < -40 || temperature > 80)) temperature = null;

  const humidityReported = raw.humidity !== undefined || raw.hum !== undefined;
  let humidity = num(raw.humidity ?? raw.hum);
  if (humidity !== null && (humidity < 0 || humidity > 100)) humidity = null;

  let gas = num(raw.gas);
  if (gas !== null && (gas < 0 || gas > 4095)) gas = null;
  const warmup = num(raw.gasWarmup);

  const reading = {
    ts: now,
    distance,
    temperature,
    humidity,
    gas,
    motion: bool(raw.motion),
    movement: typeof raw.movement === 'string' ? raw.movement : null,
    deviceRisk: typeof raw.risk === 'string' ? raw.risk.toUpperCase() : null,
    battery: num(raw.battery),
    servoL: num(raw.servoL),
    servoR: num(raw.servoR),
    speed: num(raw.speed),
    uptime: num(raw.uptime),
    simulated: !!raw.simulated,
  };

  const sensors = {
    ultrasonic: distanceValid ? 'ok' : 'invalid',
    mq2: gas === null ? 'invalid' : warmup && warmup > 0 ? 'warming' : 'ok',
    dht22: temperature === null && humidity === null ? 'invalid' : temperature === null || (humidityReported && humidity === null) ? 'partial' : 'ok',
    pir: reading.motion === null ? 'unknown' : 'ok',
    gasWarmupSec: warmup && warmup > 0 ? warmup : 0,
    humidityReported,
  };
  return { reading, sensors };
}

let latest = { reading: null, sensors: null, ts: 0 };
export const getLatest = () => ({ ...latest, risk: getCurrentRisk() });

let lastStoredAt = 0;
let lastStoredMotion = null;
let lastStoredLevel = null;
let lastStoredMission = null;
let lastMotionEventAt = 0;
let prevMotion = null;

function maybeStore(reading, level) {
  const { storage } = getSettings();
  const interval = (live.activeMissionId ? storage.readingIntervalActiveSec : storage.readingIntervalIdleSec) * 1000;
  // A mission start/stop or a motion/risk change is stored immediately; otherwise honour the sampling interval.
  const changed = reading.motion !== lastStoredMotion || level !== lastStoredLevel || live.activeMissionId !== lastStoredMission;
  if (!changed && reading.ts - lastStoredAt < interval) return;
  lastStoredAt = reading.ts;
  lastStoredMotion = reading.motion;
  lastStoredLevel = level;
  lastStoredMission = live.activeMissionId;
  try {
    run(
      `INSERT INTO sensor_readings(ts,mission_id,distance,temperature,humidity,gas,motion,movement,device_risk,risk_level,battery)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      reading.ts,
      live.activeMissionId,
      reading.distance,
      reading.temperature,
      reading.humidity,
      reading.gas,
      reading.motion === null ? null : reading.motion ? 1 : 0,
      reading.movement,
      reading.deviceRisk,
      level,
      reading.battery,
    );
  } catch (e) {
    logEvent({ type: 'system_error', severity: 'error', description: `Failed to store sensor reading: ${e.message}` });
  }
}

let timer = null;
let running = false;

async function pollOnce() {
  const device = getDevice();
  try {
    const { raw, ms } = await device.data();
    espSuccess(ms);
    const { reading, sensors } = normalize(raw);
    latest = { reading, sensors, ts: reading.ts };
    const risk = updateRisk(reading, sensors);
    maybeStore(reading, risk.level);

    if (reading.motion === true && prevMotion !== true && reading.ts - lastMotionEventAt > 5000) {
      lastMotionEventAt = reading.ts;
      logEvent({ type: 'motion', severity: 'info', description: 'PIR motion detected' });
    }
    prevMotion = reading.motion;

    bus.emit('telemetry', { reading, sensors, risk, connections: getConnections() });
  } catch (e) {
    espFailure(e.name === 'TimeoutError' ? 'timeout' : e.message);
    // Stale telemetry must not look valid: once the link is declared lost, clear it.
    if (!isEspConnected()) {
      latest = { reading: null, sensors: null, ts: 0 };
      updateRisk({ temperature: null, gas: null, motion: null }, { mq2: 'invalid' });
    }
    bus.emit('telemetry', {
      reading: latest.reading,
      sensors: latest.sensors,
      risk: getCurrentRisk(),
      connections: getConnections(),
      stale: !!latest.reading,
      error: e.message,
    });
  }
}

function schedule() {
  if (!running) return;
  const { sensors, network } = getSettings();
  const delay = isEspConnected() ? sensors.refreshMs : network.reconnectIntervalMs;
  timer = setTimeout(async () => {
    await pollOnce();
    schedule();
  }, delay);
}

export function startTelemetry() {
  if (running) return;
  running = true;
  pollOnce().finally(schedule);
}
export function stopTelemetry() {
  running = false;
  clearTimeout(timer);
}

/** Manual "Reconnect" button: poll immediately. */
export async function reconnectEsp() {
  espConnecting();
  clearTimeout(timer);
  await pollOnce();
  schedule();
  return getConnections().esp32;
}

bus.on('settings', ({ prev, next }) => {
  if (prev && (prev.demoMode !== next.demoMode || prev.network.apiBaseUrl !== next.network.apiBaseUrl)) {
    latest = { reading: null, sensors: null, ts: 0 };
    espConnecting();
    if (running) {
      clearTimeout(timer);
      pollOnce().finally(schedule);
    }
  }
});

/* ------------------------------ history ------------------------------ */

/** Returns downsampled sensor history. */
export function getHistory({ minutes = 15, missionId, from, to, maxPoints = 300 } = {}) {
  const end = to ? Number(to) : Date.now();
  const start = from ? Number(from) : end - Number(minutes) * 60000;
  const rows = missionId
    ? all('SELECT * FROM sensor_readings WHERE mission_id=? ORDER BY ts ASC', Number(missionId))
    : all('SELECT * FROM sensor_readings WHERE ts BETWEEN ? AND ? ORDER BY ts ASC', start, end);
  const stride = Math.max(1, Math.ceil(rows.length / maxPoints));
  if (stride === 1) return rows;
  const out = [];
  for (let i = 0; i < rows.length; i += stride) {
    const chunk = rows.slice(i, i + stride);
    const avg = (k) => {
      const v = chunk.map((r) => r[k]).filter((x) => x !== null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    out.push({
      ...chunk[chunk.length - 1],
      distance: avg('distance'),
      temperature: avg('temperature'),
      humidity: avg('humidity'),
      gas: avg('gas'),
      motion: chunk.some((r) => r.motion === 1) ? 1 : 0,
    });
  }
  return out;
}
