import { bus, HttpError, sleep } from '../bus.js';
import { getSettings } from './settings.js';
import { getDevice } from './device.js';
import { espFailure, espSuccess, isEspConnected } from './connections.js';
import { logEvent } from './events.js';

/**
 * Robot control with layered safety:
 *  1. Browser sends a heartbeat (move command) every ~200 ms while a control is held.
 *  2. This watchdog stops the robot if heartbeats stop for WATCHDOG_MS (tab closed, Wi-Fi drop, crash).
 *  3. The ESP32 firmware has its own independent timeout (see hardware/main_esp32).
 *  4. A physical motor-power switch is still required – software stops are never a substitute.
 */
const WATCHDOG_MS = 600;
const DRIVER_LEASE_MS = 1200;
const DIRS = { F: 'forward', B: 'backward', L: 'left', R: 'right', S: 'stop' };

const robot = {
  direction: 'S', // last direction CONFIRMED by the ESP32
  speed: null,
  estop: false,
  servos: { L: null, R: null }, // logical angles last commanded
  driver: null, // clientId currently holding the drive lease
  driverSeen: 0,
  lastCommandAt: null,
  lastError: null,
};

let busy = false;
let queued = null;
let watchdog = null;
let desired = 'S';

export function getRobotState() {
  const s = getSettings();
  let status = 'IDLE';
  if (s.demoMode) status = 'DEMO';
  if (!isEspConnected()) status = 'OFFLINE';
  else if (robot.estop) status = 'E-STOP';
  else if (robot.direction !== 'S') status = `MOVING ${DIRS[robot.direction].toUpperCase()}`;
  else if (s.demoMode) status = 'IDLE (DEMO)';
  return {
    ...robot,
    speed: robot.speed ?? s.robot.defaultSpeed,
    status,
    driverActive: !!robot.driver && Date.now() - robot.driverSeen < DRIVER_LEASE_MS,
    mode: getDevice().kind,
  };
}

function publish() {
  bus.emit('robot', getRobotState());
}

function setDirection(dir) {
  if (robot.direction === dir) return;
  robot.direction = dir;
  publish();
}

function armWatchdog() {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    if (desired !== 'S') {
      logEvent({ type: 'control_timeout', severity: 'warning', description: 'Control heartbeat lost – robot stopped by watchdog' });
      stop('watchdog');
    }
  }, WATCHDOG_MS);
}

/** Resolve the drive lease so two operators can't fight over the robot. */
function claimDriver(clientId) {
  const now = Date.now();
  const active = robot.driver && now - robot.driverSeen < DRIVER_LEASE_MS;
  if (active && clientId && robot.driver !== clientId) {
    throw new HttpError(409, 'Another operator device is driving the robot', 'control_busy');
  }
  robot.driver = clientId || 'anonymous';
  robot.driverSeen = now;
}

export async function move(dir, { clientId, source = 'ui' } = {}) {
  if (!DIRS[dir]) throw new HttpError(400, 'Direction must be one of F, B, L, R, S', 'bad_direction');
  if (dir === 'S') return stop('release', { clientId });

  if (robot.estop) throw new HttpError(423, 'Emergency stop is engaged. Re-arm to drive.', 'estop_engaged');
  if (!isEspConnected()) {
    desired = 'S';
    throw new HttpError(503, 'Robot unreachable – control unavailable', 'robot_offline');
  }
  claimDriver(clientId);
  desired = dir;
  armWatchdog();

  // Heartbeat for the direction already in flight / confirmed: nothing new to confirm.
  if (busy) {
    if (queued !== dir) queued = dir;
    return { ok: true, confirmed: false, dir, queued: true };
  }

  busy = true;
  try {
    const t0 = Date.now();
    await getDevice().move(dir);
    espSuccess(Date.now() - t0);
    robot.lastCommandAt = Date.now();
    robot.lastError = null;
    // If a stop/E-stop arrived while we waited, do not mark movement as active.
    if (desired === 'S') {
      getDevice().move('S').catch(() => {});
      return { ok: false, confirmed: false, dir: 'S', cancelled: true };
    }
    const changed = robot.direction !== dir;
    setDirection(dir);
    if (changed) logEvent({ type: `move_${DIRS[dir]}`, severity: 'info', description: `Move ${DIRS[dir]} (${source})`, meta: { speed: robot.speed } });
    return { ok: true, confirmed: true, dir, ms: Date.now() - t0 };
  } catch (e) {
    robot.lastError = e.message;
    espFailure(e.name === 'TimeoutError' ? 'timeout' : e.message);
    desired = 'S';
    setDirection('S');
    logEvent({ type: 'system_error', severity: 'error', description: `Move ${DIRS[dir]} failed: ${e.message}` });
    throw new HttpError(502, `ESP32 did not acknowledge the command: ${e.message}`, 'device_error');
  } finally {
    busy = false;
    if (queued) {
      const next = queued;
      queued = null;
      if (desired !== 'S' && next !== dir) move(next, { clientId: robot.driver, source }).catch(() => {});
    }
  }
}

/** STOP always wins: bypasses the drive lease and the command queue, retries, and sends a redundant second stop. */
export async function stop(reason = 'stop', { clientId, severity } = {}) {
  desired = 'S';
  queued = null;
  clearTimeout(watchdog);
  const wasMoving = robot.direction !== 'S';

  let confirmed = false;
  let lastErr = null;
  for (let attempt = 0; attempt < 3 && !confirmed; attempt++) {
    try {
      await getDevice().move('S', { timeoutMs: Math.min(getSettings().network.timeoutMs, 1000) });
      espSuccess(0);
      confirmed = true;
    } catch (e) {
      lastErr = e;
      await sleep(60);
    }
  }
  // Software state must never claim "moving" after a stop request.
  robot.direction = 'S';
  robot.driver = null;
  robot.lastCommandAt = Date.now();
  if (!confirmed) {
    espFailure(lastErr?.message ?? 'stop failed');
    robot.lastError = lastErr?.message;
    logEvent({ type: 'system_error', severity: 'critical', description: `STOP (${reason}) could not be confirmed by the ESP32: ${lastErr?.message}` });
  } else {
    sleep(120).then(() => getDevice().move('S').catch(() => {})); // redundant stop
  }
  if (wasMoving || reason === 'emergency') {
    if (reason !== 'emergency')
      logEvent({ type: 'move_stop', severity: severity ?? 'info', description: `Stop (${reason})` });
  }
  publish();
  return { ok: true, confirmed, dir: 'S', reason };
}

export async function emergencyStop({ clientId } = {}) {
  robot.estop = true;
  const r = await stop('emergency', { clientId });
  logEvent({ type: 'estop', severity: 'critical', description: `EMERGENCY STOP engaged${r.confirmed ? '' : ' (ESP32 did not confirm)'}` });
  publish();
  return { ...r, estop: true };
}

export function rearm() {
  if (!robot.estop) return { ok: true, estop: false };
  robot.estop = false;
  logEvent({ type: 'estop_rearm', severity: 'warning', description: 'Emergency stop released – controls re-armed' });
  publish();
  return { ok: true, estop: false };
}

/** Link lost: we can't reach the robot, but we must not show it as moving. Firmware watchdog stops it. */
export function forceStopLocal(reason) {
  desired = 'S';
  queued = null;
  clearTimeout(watchdog);
  robot.direction = 'S';
  robot.driver = null;
  publish();
  getDevice().move('S', { timeoutMs: 500 }).catch(() => {});
  logEvent({ type: 'move_stop', severity: 'warning', description: `Stop (${reason})` });
}

export async function setSpeed(value, { clientId } = {}) {
  const { robot: cfg } = getSettings();
  const v = Math.round(Math.min(Math.max(Number(value), cfg.minSpeed), cfg.maxSpeed));
  if (!Number.isFinite(v)) throw new HttpError(400, 'Speed must be a number');
  if (!isEspConnected()) throw new HttpError(503, 'Robot unreachable', 'robot_offline');
  try {
    await getDevice().speed(v);
    espSuccess(0);
  } catch (e) {
    espFailure(e.message);
    throw new HttpError(502, `ESP32 did not acknowledge speed change: ${e.message}`, 'device_error');
  }
  const changed = robot.speed !== v;
  robot.speed = v;
  if (changed) logEvent({ type: 'speed_change', severity: 'info', description: `Speed set to ${v} (${Math.round((v / 255) * 100)}%)`, meta: { speed: v } });
  publish();
  return { ok: true, speed: v, percent: Math.round((v / 255) * 100) };
}

/* ------------------------------ flippers ------------------------------ */

const toDevice = (cfg, logical) => {
  const a = cfg.invert ? 180 - logical : logical;
  return Math.min(180, Math.max(0, Math.round(a)));
};
export const toLogical = (cfg, deviceAngle) => (cfg.invert ? 180 - deviceAngle : deviceAngle);

/**
 * Move flipper(s). `angle` is a LOGICAL angle, clamped to the calibrated safe range unless `calibrate` is set
 * (calibration mode only enforces the servo's hard 0–180° range).
 */
export async function setFlipper({ servo, angle, action, calibrate = false }) {
  if (!['L', 'R', 'BOTH'].includes(servo)) throw new HttpError(400, 'servo must be L, R or BOTH');
  if (!isEspConnected()) throw new HttpError(503, 'Robot unreachable', 'robot_offline');
  if (robot.estop) throw new HttpError(423, 'Emergency stop is engaged. Re-arm first.', 'estop_engaged');
  const cfgAll = getSettings().robot.servo;
  const sides = servo === 'BOTH' ? ['L', 'R'] : [servo];
  const applied = {};

  for (const side of sides) {
    const cfg = cfgAll[side];
    let logical;
    if (action) {
      if (!['up', 'down', 'home'].includes(action)) throw new HttpError(400, 'action must be up, down or home');
      logical = cfg[action];
    } else {
      logical = Number(angle);
      if (!Number.isFinite(logical)) throw new HttpError(400, 'angle must be a number');
    }
    logical = Math.round(calibrate ? Math.min(180, Math.max(0, logical)) : Math.min(cfg.max, Math.max(cfg.min, logical)));
    const deviceAngle = toDevice(cfg, logical);
    try {
      await getDevice().servo(side, deviceAngle);
      espSuccess(0);
    } catch (e) {
      espFailure(e.message);
      throw new HttpError(502, `ESP32 did not acknowledge ${side} flipper command: ${e.message}`, 'device_error');
    }
    robot.servos[side] = logical;
    applied[side] = { logical, device: deviceAngle };
  }
  logEvent({
    type: 'flipper',
    severity: 'info',
    description: `Flipper ${servo}${action ? ` ${action.toUpperCase()}` : ''}: ${Object.entries(applied).map(([s, a]) => `${s}=${a.logical}°`).join(' ')}${calibrate ? ' (calibration)' : ''}`,
    meta: applied,
  });
  publish();
  return { ok: true, applied };
}

/* ------------------------------ lifecycle hooks ------------------------------ */

bus.on('esp32:lost', () => forceStopLocal('connection lost'));

bus.on('esp32:up', async () => {
  // Firmware may have rebooted with its own default speed – push ours so UI and robot agree.
  try {
    const v = robot.speed ?? getSettings().robot.defaultSpeed;
    await getDevice().speed(v);
    robot.speed = v;
    publish();
  } catch {
    /* retried on next user action */
  }
});

bus.on('settings', ({ prev, next }) => {
  if (prev && prev.demoMode !== next.demoMode) {
    robot.speed = null;
    robot.direction = 'S';
    publish();
  }
});
