import { all, run } from '../database/index.js';
import { bus, HttpError } from '../bus.js';
import { DEMO_ENV } from '../config.js';

/** Factory defaults. Every value here is editable from System Settings and persisted in SQLite. */
export const DEFAULTS = {
  network: {
    esp32Ip: '192.168.4.1',
    apiBaseUrl: 'http://192.168.4.1',
    cameraIp: '192.168.4.2',
    cameraStreamUrl: 'http://192.168.4.2:81/stream',
    cameraCaptureUrl: 'http://192.168.4.2/capture',
    cameraMode: 'proxy', // 'proxy' = browser pulls video through this backend; 'direct' = browser talks to the camera
    timeoutMs: 1500,
    reconnectIntervalMs: 3000,
    endpoints: {
      move: '/cmd?d={dir}',
      speed: '/speed?v={value}',
      servo: '/servo?s={servo}&a={angle}',
      data: '/data',
    },
  },
  robot: {
    minSpeed: 100,
    defaultSpeed: 170,
    maxSpeed: 255,
    speedPresets: { low: 120, normal: 170, high: 230 },
    // Angles below are LOGICAL angles (what the operator sees). `invert` maps logical -> device angle (180 - a).
    // Defaults are deliberately conservative mid-range values. Run the calibration procedure before use.
    servo: {
      L: { min: 20, max: 160, up: 130, down: 50, home: 90, invert: false },
      R: { min: 20, max: 160, up: 130, down: 50, home: 90, invert: false },
    },
    servoCalibrated: false,
  },
  sensors: {
    refreshMs: 1000,
    gasWarning: 1800, // raw 12-bit ADC counts; calibrate in clean air for your MQ-2 + divider
    gasCritical: 2800,
    tempWarning: 40,
    tempCritical: 55,
    obstacleWarningCm: 25,
    obstacleCriticalCm: 10,
    motionRaisesCaution: true,
  },
  storage: {
    readingIntervalActiveSec: 2,
    readingIntervalIdleSec: 15,
    retentionDays: 30, // applies to readings recorded outside a mission; mission data is kept
  },
  dashboard: {
    theme: 'dark', // 'dark' | 'daylight'
    layout: 'standard', // 'standard' | 'compact'
    cameraSize: 'large', // 'medium' | 'large' | 'xl'
    mobileControl: 'dpad', // 'dpad' | 'joystick'
    chartMinutes: 10,
    showChartGrid: true,
  },
  mission: {
    operatorName: 'Operator',
    defaultLocation: '',
    report: { organization: '', includePhotos: true, maxPhotos: 12, footerNote: '' },
  },
  demoMode: DEMO_ENV,
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = isObj(v) && isObj(base?.[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

function num(v, min, max, label) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new HttpError(400, `${label} must be a number`);
  if (n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}`);
  return n;
}
function str(v, label, max = 300) {
  if (typeof v !== 'string') throw new HttpError(400, `${label} must be text`);
  return v.trim().slice(0, max);
}
function url(v, label, allowEmpty = false) {
  const s = str(v, label, 500);
  if (!s && allowEmpty) return '';
  if (!/^https?:\/\/[^\s]+$/i.test(s)) throw new HttpError(400, `${label} must be an http(s) URL`);
  return s.replace(/\/+$/, '') === s ? s : s; // keep path as typed
}

/** Validates and normalises a full settings object. Throws HttpError(400) on bad input. */
export function sanitize(s) {
  const out = clone(DEFAULTS);

  const n = s.network;
  out.network.esp32Ip = str(n.esp32Ip, 'Main ESP32 IP', 100);
  out.network.apiBaseUrl = url(n.apiBaseUrl, 'API base URL').replace(/\/+$/, '');
  out.network.cameraIp = str(n.cameraIp, 'Camera IP', 100);
  out.network.cameraStreamUrl = url(n.cameraStreamUrl, 'Camera stream URL');
  out.network.cameraCaptureUrl = url(n.cameraCaptureUrl ?? '', 'Camera capture URL', true);
  out.network.cameraMode = ['proxy', 'direct'].includes(n.cameraMode) ? n.cameraMode : 'proxy';
  out.network.timeoutMs = num(n.timeoutMs, 300, 10000, 'Connection timeout');
  out.network.reconnectIntervalMs = num(n.reconnectIntervalMs, 1000, 30000, 'Reconnection interval');
  for (const k of ['move', 'speed', 'servo', 'data']) {
    const ep = str(n.endpoints?.[k] ?? DEFAULTS.network.endpoints[k], `Endpoint ${k}`, 200);
    if (!ep.startsWith('/')) throw new HttpError(400, `Endpoint ${k} must start with "/"`);
    out.network.endpoints[k] = ep;
  }

  const r = s.robot;
  out.robot.minSpeed = num(r.minSpeed, 0, 255, 'Minimum speed');
  out.robot.maxSpeed = num(r.maxSpeed, out.robot.minSpeed, 255, 'Maximum speed');
  out.robot.defaultSpeed = num(r.defaultSpeed, out.robot.minSpeed, out.robot.maxSpeed, 'Default speed');
  for (const k of ['low', 'normal', 'high']) {
    out.robot.speedPresets[k] = Math.round(
      num(r.speedPresets?.[k], out.robot.minSpeed, out.robot.maxSpeed, `${k} speed preset`),
    );
  }
  for (const side of ['L', 'R']) {
    const c = r.servo?.[side] ?? {};
    const min = Math.round(num(c.min, 0, 180, `${side} flipper min angle`));
    const max = Math.round(num(c.max, 0, 180, `${side} flipper max angle`));
    if (min >= max) throw new HttpError(400, `${side} flipper: min angle must be below max angle`);
    out.robot.servo[side] = {
      min,
      max,
      up: Math.round(num(c.up, min, max, `${side} flipper UP angle`)),
      down: Math.round(num(c.down, min, max, `${side} flipper DOWN angle`)),
      home: Math.round(num(c.home, min, max, `${side} flipper home angle`)),
      invert: !!c.invert,
    };
  }
  out.robot.servoCalibrated = !!r.servoCalibrated;

  const se = s.sensors;
  out.sensors.refreshMs = num(se.refreshMs, 500, 10000, 'Sensor refresh interval');
  out.sensors.gasWarning = num(se.gasWarning, 1, 4095, 'Gas warning threshold');
  out.sensors.gasCritical = num(se.gasCritical, 1, 4095, 'Gas critical threshold');
  if (out.sensors.gasCritical <= out.sensors.gasWarning)
    throw new HttpError(400, 'Gas critical threshold must be above the warning threshold');
  out.sensors.tempWarning = num(se.tempWarning, -20, 120, 'Temperature warning threshold');
  out.sensors.tempCritical = num(se.tempCritical, -20, 150, 'Temperature critical threshold');
  if (out.sensors.tempCritical <= out.sensors.tempWarning)
    throw new HttpError(400, 'Temperature critical threshold must be above the warning threshold');
  out.sensors.obstacleWarningCm = num(se.obstacleWarningCm, 2, 400, 'Obstacle warning distance');
  out.sensors.obstacleCriticalCm = num(se.obstacleCriticalCm, 1, 400, 'Obstacle critical distance');
  out.sensors.motionRaisesCaution = !!se.motionRaisesCaution;

  const st = s.storage;
  out.storage.readingIntervalActiveSec = num(st.readingIntervalActiveSec, 1, 600, 'Mission sampling interval');
  out.storage.readingIntervalIdleSec = num(st.readingIntervalIdleSec, 1, 3600, 'Idle sampling interval');
  out.storage.retentionDays = num(st.retentionDays, 1, 3650, 'Retention days');

  const d = s.dashboard;
  out.dashboard.theme = ['dark', 'daylight'].includes(d.theme) ? d.theme : 'dark';
  out.dashboard.layout = ['standard', 'compact'].includes(d.layout) ? d.layout : 'standard';
  out.dashboard.cameraSize = ['medium', 'large', 'xl'].includes(d.cameraSize) ? d.cameraSize : 'large';
  out.dashboard.mobileControl = ['dpad', 'joystick'].includes(d.mobileControl) ? d.mobileControl : 'dpad';
  out.dashboard.chartMinutes = num(d.chartMinutes, 1, 120, 'Chart window');
  out.dashboard.showChartGrid = !!d.showChartGrid;

  const m = s.mission;
  out.mission.operatorName = str(m.operatorName, 'Operator name', 80) || 'Operator';
  out.mission.defaultLocation = str(m.defaultLocation ?? '', 'Default location', 200);
  out.mission.report.organization = str(m.report?.organization ?? '', 'Organisation', 120);
  out.mission.report.includePhotos = !!m.report?.includePhotos;
  out.mission.report.maxPhotos = Math.round(num(m.report?.maxPhotos ?? 12, 0, 40, 'Max report photos'));
  out.mission.report.footerNote = str(m.report?.footerNote ?? '', 'Report footer note', 300);

  out.demoMode = !!s.demoMode;
  return out;
}

let cache = null;

export function loadSettings() {
  let merged = clone(DEFAULTS);
  for (const row of all('SELECT key, value FROM settings')) {
    try {
      merged[row.key] = isObj(DEFAULTS[row.key])
        ? deepMerge(merged[row.key], JSON.parse(row.value))
        : JSON.parse(row.value);
    } catch {
      /* ignore corrupt row, keep default */
    }
  }
  if (DEMO_ENV) merged.demoMode = true;
  try {
    cache = sanitize(merged);
  } catch (e) {
    console.warn('[settings] stored settings invalid, using defaults:', e.message);
    cache = clone(DEFAULTS);
  }
  return cache;
}

export function getSettings() {
  return cache ?? loadSettings();
}

export function updateSettings(patch) {
  const next = sanitize(deepMerge(getSettings(), patch));
  const now = Date.now();
  for (const [k, v] of Object.entries(next)) {
    run(
      `INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      k,
      JSON.stringify(v),
      now,
    );
  }
  const prev = cache;
  cache = next;
  bus.emit('settings', { prev, next });
  return next;
}
