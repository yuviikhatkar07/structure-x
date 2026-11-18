import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated data dir + demo device, set BEFORE the app modules are imported.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'stx-test-'));
process.env.DEMO = '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let m;

before(async () => {
  const db = await import('../database/index.js');
  db.migrate();
  m = {
    db,
    settings: await import('../services/settings.js'),
    risk: await import('../services/risk.js'),
    tel: await import('../services/telemetry.js'),
    conn: await import('../services/connections.js'),
    control: await import('../services/control.js'),
    missions: await import('../services/missions.js'),
    snaps: await import('../services/snapshots.js'),
    events: await import('../services/events.js'),
    bus: await import('../bus.js'),
    device: await import('../services/device.js'),
  };
  m.settings.loadSettings();
  m.conn.espSuccess(5); // pretend link is up (simulated device)
});

const S = () => m.settings.getSettings().sensors;
const OK = { mq2: 'ok' };

/* ------------------------------ risk ------------------------------ */
test('risk: SAFE when nothing exceeds thresholds, with honest wording', () => {
  const r = m.risk.evaluateRisk({ temperature: 24, gas: 400, motion: false }, OK, S());
  assert.equal(r.level, 'SAFE');
  assert.match(r.reasons[0].text, /not a safety clearance/i);
});
test('risk: CAUTION for gas warning, temp warning and motion', () => {
  assert.equal(m.risk.evaluateRisk({ temperature: 24, gas: S().gasWarning, motion: false }, OK, S()).level, 'CAUTION');
  assert.equal(m.risk.evaluateRisk({ temperature: S().tempWarning, gas: 100, motion: false }, OK, S()).level, 'CAUTION');
  assert.equal(m.risk.evaluateRisk({ temperature: 24, gas: 100, motion: true }, OK, S()).level, 'CAUTION');
});
test('risk: DANGER for critical thresholds and for combined gas+temp warnings', () => {
  assert.equal(m.risk.evaluateRisk({ temperature: S().tempCritical, gas: 100, motion: false }, OK, S()).level, 'DANGER');
  assert.equal(m.risk.evaluateRisk({ temperature: 24, gas: S().gasCritical, motion: false }, OK, S()).level, 'DANGER');
  const both = m.risk.evaluateRisk({ temperature: S().tempWarning, gas: S().gasWarning, motion: false }, OK, S());
  assert.equal(both.level, 'DANGER');
  assert.ok(both.reasons.some((x) => x.code === 'multiple'));
});
test('risk: UNKNOWN (not SAFE) when no valid data; warming MQ-2 is excluded', () => {
  assert.equal(m.risk.evaluateRisk({ temperature: null, gas: null, motion: null }, { mq2: 'invalid' }, S()).level, 'UNKNOWN');
  const w = m.risk.evaluateRisk({ temperature: 24, gas: 4000, motion: false }, { mq2: 'warming' }, S());
  assert.equal(w.level, 'SAFE');
  assert.ok(w.reasons.some((x) => x.code === 'gas_warming'));
});

/* ------------------------------ telemetry normalisation ------------------------------ */
test('telemetry: invalid readings become null, never 0', () => {
  const { reading, sensors } = m.tel.normalize({ distance: 0, temperature: 'nan', humidity: 130, gas: -1, motion: 'x', risk: 'safe' });
  assert.equal(reading.distance, null);
  assert.equal(reading.temperature, null);
  assert.equal(reading.humidity, null);
  assert.equal(reading.gas, null);
  assert.equal(sensors.ultrasonic, 'invalid');
  assert.equal(sensors.dht22, 'invalid');
  assert.equal(sensors.mq2, 'invalid');
  assert.equal(reading.deviceRisk, 'SAFE');
});
test('telemetry: valid values pass through; null distance (echo timeout) is invalid', () => {
  const ok = m.tel.normalize({ distance: 42.5, temperature: 27.3, humidity: 55, gas: 312, motion: 1, gasWarmup: 0 });
  assert.equal(ok.reading.distance, 42.5);
  assert.equal(ok.reading.motion, true);
  assert.equal(ok.sensors.mq2, 'ok');
  assert.equal(m.tel.normalize({ distance: null, temperature: 20, gas: 5, motion: 0 }).sensors.ultrasonic, 'invalid');
  assert.equal(m.tel.normalize({ distance: 10, temperature: 20, gas: 5, gasWarmup: 30 }).sensors.mq2, 'warming');
});
test('telemetry: poll via simulated device updates latest reading + risk', async () => {
  await m.tel.reconnectEsp();
  const latest = m.tel.getLatest();
  assert.ok(latest.reading, 'reading present');
  assert.equal(latest.reading.simulated, true);
  assert.ok(['SAFE', 'CAUTION', 'DANGER'].includes(latest.risk.level));
  m.tel.stopTelemetry();
});

/* ------------------------------ settings ------------------------------ */
test('settings: validation rejects inconsistent thresholds and bad URLs', () => {
  assert.throws(() => m.settings.updateSettings({ sensors: { gasWarning: 3000, gasCritical: 2000 } }), /above the warning/);
  assert.throws(() => m.settings.updateSettings({ network: { apiBaseUrl: 'not a url' } }), /http/);
  assert.throws(() => m.settings.updateSettings({ robot: { servo: { L: { min: 100, max: 50 } } } }), /min angle/);
});
test('settings: values persist to the database and reload', () => {
  m.settings.updateSettings({ sensors: { gasWarning: 1234 }, mission: { operatorName: 'Test Op' } });
  m.settings.loadSettings(); // simulate restart: re-read from SQLite
  assert.equal(m.settings.getSettings().sensors.gasWarning, 1234);
  assert.equal(m.settings.getSettings().mission.operatorName, 'Test Op');
  m.settings.updateSettings({ sensors: { gasWarning: 1800 } });
});

/* ------------------------------ missions ------------------------------ */
test('missions: lifecycle, single-active rule, event association, notes', () => {
  const a = m.missions.createMission({ name: 'Building A', location: 'Block 7', description: 'test' });
  assert.equal(a.status, 'planned');
  assert.equal(m.missions.transition(a.id, 'start').status, 'active');
  const b = m.missions.createMission({ name: 'Building B' });
  assert.throws(() => m.missions.transition(b.id, 'start'), /already active/);
  m.events.logEvent({ type: 'test_event', description: 'during mission A' });
  assert.equal(m.events.queryEvents({ missionId: a.id, type: 'test_event' }).total, 1);
  m.missions.addNote(a.id, 'Crack visible on north wall');
  assert.equal(m.missions.listNotes(a.id).length, 1);
  assert.equal(m.missions.transition(a.id, 'pause').status, 'paused');
  assert.equal(m.bus.live.activeMissionId, null);
  assert.equal(m.missions.transition(a.id, 'resume').status, 'active');
  assert.throws(() => m.missions.transition(a.id, 'start'), /Cannot start/);
  const done = m.missions.transition(a.id, 'complete');
  assert.equal(done.status, 'completed');
  assert.ok(done.started_at && done.ended_at);
  assert.equal(m.missions.listMissions({ search: 'Building A' }).total, 1);
  assert.equal(m.missions.listMissions({ status: 'completed' }).missions.length >= 1, true);
  assert.equal(m.missions.transition(b.id, 'abort').status, 'aborted');
});
test('missions: active mission is paused after a simulated restart (never silently recording)', () => {
  const c = m.missions.createMission({ name: 'Crash test', startNow: true });
  assert.equal(c.status, 'active');
  m.missions.recoverMissionsOnStartup();
  assert.equal(m.missions.getMission(c.id).status, 'paused');
  assert.equal(m.bus.live.activeMissionId, null);
});
test('missions: sensor readings and risk events are stored against the active mission', async () => {
  const mis = m.missions.createMission({ name: 'Telemetry mission', startNow: true });
  await m.tel.reconnectEsp();
  m.tel.stopTelemetry();
  const rows = m.db.all('SELECT * FROM sensor_readings WHERE mission_id=?', mis.id);
  assert.ok(rows.length >= 1, 'reading stored with mission id');
  m.missions.transition(mis.id, 'complete');
});

/* ------------------------------ control safety ------------------------------ */
test('control: move is confirmed only after the device answers; release stops', async () => {
  const r = await m.control.move('F', { clientId: 'a' });
  assert.equal(r.confirmed, true);
  assert.equal(m.control.getRobotState().direction, 'F');
  assert.match(m.control.getRobotState().status, /MOVING FORWARD/);
  await m.control.stop('release', { clientId: 'a' });
  assert.equal(m.control.getRobotState().direction, 'S');
});
test('control: watchdog stops the robot when heartbeats cease', async () => {
  await m.control.move('L', { clientId: 'a' });
  assert.equal(m.control.getRobotState().direction, 'L');
  await sleep(1100);
  assert.equal(m.control.getRobotState().direction, 'S');
  assert.equal(m.events.queryEvents({ type: 'control_timeout' }).total >= 1, true);
});
test('control: second device cannot steal the drive lease; STOP from anyone always works', async () => {
  await m.control.move('F', { clientId: 'phone' });
  await assert.rejects(() => m.control.move('B', { clientId: 'laptop' }), /Another operator/);
  await m.control.stop('release', { clientId: 'laptop' });
  assert.equal(m.control.getRobotState().direction, 'S');
});
test('control: emergency stop latches until re-armed', async () => {
  await m.control.move('F', { clientId: 'a' });
  const r = await m.control.emergencyStop({ clientId: 'a' });
  assert.equal(r.estop, true);
  assert.equal(m.control.getRobotState().direction, 'S');
  assert.equal(m.control.getRobotState().status, 'E-STOP');
  await assert.rejects(() => m.control.move('F', { clientId: 'a' }), /Emergency stop/);
  await assert.rejects(() => m.control.setFlipper({ servo: 'L', action: 'up' }), /Emergency stop/);
  m.control.rearm();
  assert.equal((await m.control.move('F', { clientId: 'a' })).confirmed, true);
  await m.control.stop('release');
});
test('control: speed is clamped to configured limits', async () => {
  assert.equal((await m.control.setSpeed(5)).speed, 100);
  assert.equal((await m.control.setSpeed(999)).speed, 255);
  assert.equal((await m.control.setSpeed(170)).speed, 170);
});
test('control: flippers clamp to safe limits, honour inversion; calibration mode only enforces 0-180', async () => {
  m.settings.updateSettings({ robot: { servo: { R: { invert: true } } } });
  const sim = m.device.getDevice();
  const clamped = await m.control.setFlipper({ servo: 'L', angle: 175 });
  assert.equal(clamped.applied.L.logical, 160); // max limit
  const both = await m.control.setFlipper({ servo: 'BOTH', action: 'up' });
  assert.equal(both.applied.L.device, 130);
  assert.equal(both.applied.R.device, 50); // inverted mount: 180-130
  assert.equal(sim.servoR, 50);
  const cal = await m.control.setFlipper({ servo: 'L', angle: 175, calibrate: true });
  assert.equal(cal.applied.L.logical, 175);
  const hard = await m.control.setFlipper({ servo: 'L', angle: 400, calibrate: true });
  assert.equal(hard.applied.L.logical, 180);
  await assert.rejects(() => m.control.setFlipper({ servo: 'X', angle: 1 }), /servo must be/);
  m.settings.updateSettings({ robot: { servo: { R: { invert: false } } } });
});
test('control: direction input is validated; unreachable robot disables control', async () => {
  await assert.rejects(() => m.control.move('X', {}), /Direction/);
  for (let i = 0; i < 3; i++) m.conn.espFailure('test');
  assert.equal(m.conn.getConnections().esp32.status, 'disconnected');
  await assert.rejects(() => m.control.move('F', { clientId: 'a' }), /unreachable/);
  assert.equal(m.control.getRobotState().status, 'OFFLINE');
  assert.equal(m.control.getRobotState().direction, 'S');
  m.conn.espSuccess(3);
  assert.equal(m.conn.getConnections().esp32.status, 'connected');
});

/* ------------------------------ events / snapshots ------------------------------ */
test('events: searchable, filterable, newest first', () => {
  const r = m.events.queryEvents({ search: 'EMERGENCY' });
  assert.ok(r.total >= 1);
  assert.ok(m.events.queryEvents({ severity: 'critical' }).events.every((e) => e.severity === 'critical'));
  const all = m.events.queryEvents({ limit: 5 }).events;
  assert.ok(all[0].ts >= all[all.length - 1].ts);
});
test('snapshots: JPEG stored on disk, metadata in DB, risk + mission captured, delete removes file', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]);
  const mis = m.missions.createMission({ name: 'Snap mission', startNow: true });
  const s = m.snaps.saveSnapshot(jpeg, { note: 'wall crack' });
  assert.equal(s.mission_id, mis.id);
  assert.ok(s.risk_level);
  assert.ok(fs.existsSync(m.snaps.snapshotPath(s)));
  assert.equal(m.snaps.listSnapshots({ missionId: mis.id }).total, 1);
  assert.throws(() => m.snaps.saveSnapshot(Buffer.from('not an image')), /JPEG/);
  m.snaps.deleteSnapshot(s.id);
  assert.equal(fs.existsSync(m.snaps.snapshotPath(s)), false);
  m.missions.transition(mis.id, 'complete');
});

/* ------------------------------ PDF (needs pdfkit) ------------------------------ */
test('reports: PDF generated with valid header and stored metadata', async (t) => {
  let reports;
  try {
    reports = await import('../services/reports.js');
  } catch (e) {
    return t.skip(`pdfkit not installed in this environment (${e.code || e.message})`);
  }
  const mis = m.missions.listMissions({ status: 'completed' }).missions[0];
  const rep = await reports.generateMissionReport(mis.id, 'tester');
  const buf = fs.readFileSync(reports.reportPath(rep));
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 2000);
  assert.equal(reports.listReports({ missionId: mis.id }).length, 1);
});
