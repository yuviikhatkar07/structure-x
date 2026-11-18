import { all, get, run } from '../database/index.js';
import { bus, live } from '../bus.js';
import { getSettings } from './settings.js';
import { logEvent } from './events.js';

/**
 * PRELIMINARY ENVIRONMENTAL WARNING LOGIC.
 * These rules compare raw hobby-grade sensor values with operator-configured thresholds.
 * They do not identify specific gases, do not assess structural integrity and never establish
 * that a site is safe. SAFE only means "no configured threshold exceeded right now".
 */
export function evaluateRisk(reading, sensorStatus, sensors) {
  const reasons = [];
  const warnings = new Set();
  let danger = false;
  let caution = false;
  let usable = 0;

  const t = reading.temperature;
  if (t != null) {
    usable++;
    if (t >= sensors.tempCritical) {
      danger = true;
      warnings.add('temp_critical');
      reasons.push({ code: 'temp_critical', severity: 'danger', text: `Temperature ${t.toFixed(1)} °C ≥ critical threshold ${sensors.tempCritical} °C` });
    } else if (t >= sensors.tempWarning) {
      caution = true;
      warnings.add('temp_warning');
      reasons.push({ code: 'temp_warning', severity: 'caution', text: `Temperature ${t.toFixed(1)} °C ≥ warning threshold ${sensors.tempWarning} °C` });
    }
  }

  const g = reading.gas;
  if (g != null && sensorStatus.mq2 === 'ok') {
    usable++;
    if (g >= sensors.gasCritical) {
      danger = true;
      warnings.add('gas_critical');
      reasons.push({ code: 'gas_critical', severity: 'danger', text: `MQ-2 raw ${g} ≥ critical threshold ${sensors.gasCritical} (possible smoke/combustible gas)` });
    } else if (g >= sensors.gasWarning) {
      caution = true;
      warnings.add('gas_warning');
      reasons.push({ code: 'gas_warning', severity: 'caution', text: `MQ-2 raw ${g} ≥ warning threshold ${sensors.gasWarning} (possible smoke/combustible gas)` });
    }
  } else if (sensorStatus.mq2 === 'warming') {
    reasons.push({ code: 'gas_warming', severity: 'info', text: 'MQ-2 is warming up; gas reading excluded from risk assessment' });
  }

  if (reading.motion === true) {
    usable++;
    if (sensors.motionRaisesCaution) {
      caution = true;
      warnings.add('motion');
      reasons.push({ code: 'motion', severity: 'caution', text: 'PIR motion detected (may be a person, animal, debris movement, or the rover itself)' });
    }
  } else if (reading.motion === false) usable++;

  // Multiple independent hazard warnings escalate to DANGER.
  const hazardWarnings = [...warnings].filter((w) => w.startsWith('gas_') || w.startsWith('temp_'));
  if (!danger && new Set(hazardWarnings.map((w) => w.split('_')[0])).size >= 2) {
    danger = true;
    reasons.push({ code: 'multiple', severity: 'danger', text: 'Multiple hazard warnings active at the same time (temperature and gas)' });
  }

  let level = 'SAFE';
  if (usable === 0) level = 'UNKNOWN';
  else if (danger) level = 'DANGER';
  else if (caution) level = 'CAUTION';

  if (level === 'SAFE') {
    reasons.push({ code: 'none', severity: 'info', text: 'No configured hazard threshold exceeded. This is not a safety clearance.' });
  }
  if (level === 'UNKNOWN') {
    reasons.length = 0;
    reasons.push({ code: 'nodata', severity: 'info', text: 'No valid sensor data available' });
  }
  return { level, reasons, warnings: [...warnings] };
}

let current = {
  level: 'UNKNOWN',
  since: Date.now(),
  ts: Date.now(),
  reasons: [{ code: 'nodata', severity: 'info', text: 'Waiting for sensor data' }],
  warnings: [],
  eventId: null,
  acknowledged: true,
};
let activeWarnings = new Set();

export const getCurrentRisk = () => current;

const WARN_LABEL = {
  temp_warning: 'Temperature warning',
  temp_critical: 'Temperature CRITICAL',
  gas_warning: 'Gas/smoke warning',
  gas_critical: 'Gas/smoke CRITICAL',
  motion: 'Motion detected',
};

/** Feed a fresh reading; records transitions, raises events and notifies clients. */
export function updateRisk(reading, sensorStatus) {
  const sensors = getSettings().sensors;
  const result = evaluateRisk(reading, sensorStatus, sensors);
  const now = Date.now();
  const prev = current.level;
  const levelChanged = result.level !== prev;

  // Per-warning events (rising / falling edges) – excluding motion, which has its own log.
  for (const w of result.warnings) {
    if (!activeWarnings.has(w) && w !== 'motion') {
      logEvent({
        type: 'sensor_warning',
        severity: w.endsWith('critical') ? 'critical' : 'warning',
        description: `${WARN_LABEL[w] ?? w}: ${result.reasons.find((r) => r.code === w)?.text ?? ''}`,
        meta: { code: w, reading },
      });
    }
  }
  for (const w of activeWarnings) {
    if (!result.warnings.includes(w) && w !== 'motion') {
      logEvent({ type: 'sensor_cleared', severity: 'info', description: `${WARN_LABEL[w] ?? w} cleared`, meta: { code: w } });
    }
  }
  activeWarnings = new Set(result.warnings);

  let eventId = current.eventId;
  let acknowledged = current.acknowledged;
  if (levelChanged && result.level !== 'UNKNOWN') {
    const r = run(
      `INSERT INTO risk_events(ts,mission_id,level,prev_level,reasons,readings,acknowledged) VALUES(?,?,?,?,?,?,?)`,
      now,
      live.activeMissionId,
      result.level,
      prev === 'UNKNOWN' ? null : prev,
      JSON.stringify(result.reasons),
      JSON.stringify(reading),
      result.level === 'SAFE' ? 1 : 0,
    );
    eventId = Number(r.lastInsertRowid);
    acknowledged = result.level === 'SAFE';
    if (prev !== 'UNKNOWN') {
      logEvent({
        type: 'risk_change',
        severity: result.level === 'DANGER' ? 'critical' : result.level === 'CAUTION' ? 'warning' : 'info',
        description: `Risk level ${prev} → ${result.level}: ${result.reasons[0]?.text ?? ''}`,
        meta: { level: result.level, reasons: result.reasons },
      });
    }
  }

  current = {
    level: result.level,
    since: levelChanged ? now : current.since,
    ts: now,
    reasons: result.reasons,
    warnings: result.warnings,
    eventId,
    acknowledged,
  };
  if (levelChanged) bus.emit('risk', current);
  return current;
}

export function acknowledgeRisk(id, by) {
  const row = get('SELECT * FROM risk_events WHERE id = ?', id);
  if (!row) return null;
  run('UPDATE risk_events SET acknowledged=1, ack_ts=?, ack_by=? WHERE id=?', Date.now(), by, id);
  if (current.eventId === id) {
    current = { ...current, acknowledged: true };
    bus.emit('risk', current);
  }
  logEvent({ type: 'risk_ack', severity: 'info', description: `Operator acknowledged ${row.level} risk event #${id}` });
  return get('SELECT * FROM risk_events WHERE id = ?', id);
}

const fmtRisk = (r) => ({
  ...r,
  acknowledged: !!r.acknowledged,
  reasons: r.reasons ? JSON.parse(r.reasons) : [],
  readings: r.readings ? JSON.parse(r.readings) : null,
});

export function listRiskEvents({ missionId, limit = 100 } = {}) {
  const lim = Math.min(Number(limit) || 100, 500);
  const rows = missionId
    ? all('SELECT * FROM risk_events WHERE mission_id=? ORDER BY ts DESC LIMIT ?', Number(missionId), lim)
    : all('SELECT * FROM risk_events ORDER BY ts DESC LIMIT ?', lim);
  return rows.map(fmtRisk);
}
