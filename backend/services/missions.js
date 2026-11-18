import { all, allDynamic, get, run } from '../database/index.js';
import { bus, HttpError, live } from '../bus.js';
import { getSettings } from './settings.js';
import { logEvent } from './events.js';

const STATUSES = ['planned', 'active', 'paused', 'completed', 'aborted'];

const text = (v, max, label, required = false) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw new HttpError(400, `${label} is required`);
  return s.slice(0, max);
};

export function getMission(id) {
  const m = get('SELECT * FROM missions WHERE id = ?', Number(id));
  if (!m) throw new HttpError(404, 'Mission not found');
  return m;
}

export const getActiveMission = () => (live.activeMissionId ? get('SELECT * FROM missions WHERE id = ?', live.activeMissionId) : null);
export const getPausedMissions = () => all("SELECT * FROM missions WHERE status='paused' ORDER BY created_at DESC");

function publish() {
  bus.emit('mission', getActiveMission());
}

export function listMissions({ search, status, from, to, limit = 100, offset = 0 } = {}) {
  const where = [];
  const p = [];
  if (search) {
    where.push('(name LIKE ? OR location LIKE ? OR operator LIKE ? OR description LIKE ?)');
    p.push(...Array(4).fill(`%${search}%`));
  }
  if (status) {
    const list = String(status).split(',').filter((s) => STATUSES.includes(s));
    if (list.length) {
      where.push(`status IN (${list.map(() => '?').join(',')})`);
      p.push(...list);
    }
  }
  if (from) {
    where.push('COALESCE(started_at, created_at) >= ?');
    p.push(Number(from));
  }
  if (to) {
    where.push('COALESCE(started_at, created_at) <= ?');
    p.push(Number(to));
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const lim = Math.min(Number(limit) || 100, 500);
  const missions = allDynamic(
    `SELECT m.*,
       (SELECT COUNT(*) FROM snapshots s WHERE s.mission_id = m.id) AS snapshot_count,
       (SELECT COUNT(*) FROM risk_events r WHERE r.mission_id = m.id AND r.level != 'SAFE') AS risk_event_count
     FROM missions m ${w} ORDER BY COALESCE(started_at, created_at) DESC, id DESC LIMIT ? OFFSET ?`,
    [...p, lim, Number(offset) || 0],
  );
  const total = allDynamic(`SELECT COUNT(*) AS c FROM missions ${w}`, p)[0].c;
  return { total, missions };
}

export function missionStats(id) {
  const q = (sql) => get(sql, id);
  const readings = q('SELECT COUNT(*) AS n, MIN(temperature) AS tmin, AVG(temperature) AS tavg, MAX(temperature) AS tmax, MIN(humidity) AS hmin, AVG(humidity) AS havg, MAX(humidity) AS hmax, MIN(gas) AS gmin, AVG(gas) AS gavg, MAX(gas) AS gmax, MIN(distance) AS dmin FROM sensor_readings WHERE mission_id = ?');
  return {
    readings,
    snapshots: q('SELECT COUNT(*) AS n FROM snapshots WHERE mission_id = ?').n,
    events: q('SELECT COUNT(*) AS n FROM events WHERE mission_id = ?').n,
    commands: q("SELECT COUNT(*) AS n FROM events WHERE mission_id = ? AND type LIKE 'move_%' AND type != 'move_stop'").n,
    riskEvents: q("SELECT COUNT(*) AS n FROM risk_events WHERE mission_id = ? AND level != 'SAFE'").n,
    dangerEvents: q("SELECT COUNT(*) AS n FROM risk_events WHERE mission_id = ? AND level = 'DANGER'").n,
    motionEvents: q("SELECT COUNT(*) AS n FROM events WHERE mission_id = ? AND type = 'motion'").n,
    notes: q('SELECT COUNT(*) AS n FROM mission_notes WHERE mission_id = ?').n,
  };
}

export function createMission(input) {
  const s = getSettings().mission;
  const now = Date.now();
  const name = text(input.name, 120, 'Mission name', true);
  const plannedStart = input.plannedStart ? Number(input.plannedStart) : null;
  const r = run(
    `INSERT INTO missions(name,location,operator,description,status,planned_start,created_at,notes) VALUES(?,?,?,?,?,?,?,?)`,
    name,
    text(input.location, 200) || s.defaultLocation,
    text(input.operator, 80) || s.operatorName,
    text(input.description, 2000),
    'planned',
    Number.isFinite(plannedStart) ? plannedStart : null,
    now,
    text(input.notes, 5000),
  );
  const id = Number(r.lastInsertRowid);
  logEvent({ type: 'mission_created', severity: 'info', description: `Mission created: ${name}`, missionId: id });
  return input.startNow ? transition(id, 'start') : getMission(id);
}

export function updateMission(id, patch) {
  const m = getMission(id);
  const next = {
    name: patch.name !== undefined ? text(patch.name, 120, 'Mission name', true) : m.name,
    location: patch.location !== undefined ? text(patch.location, 200) : m.location,
    operator: patch.operator !== undefined ? text(patch.operator, 80) : m.operator,
    description: patch.description !== undefined ? text(patch.description, 2000) : m.description,
    notes: patch.notes !== undefined ? text(patch.notes, 5000) : m.notes,
  };
  run('UPDATE missions SET name=?, location=?, operator=?, description=?, notes=? WHERE id=?', next.name, next.location, next.operator, next.description, next.notes, m.id);
  publish();
  return getMission(id);
}

const FLOW = {
  start: { from: ['planned'], to: 'active', type: 'mission_started', label: 'started' },
  pause: { from: ['active'], to: 'paused', type: 'mission_paused', label: 'paused' },
  resume: { from: ['paused'], to: 'active', type: 'mission_resumed', label: 'resumed' },
  complete: { from: ['active', 'paused'], to: 'completed', type: 'mission_completed', label: 'completed' },
  abort: { from: ['planned', 'active', 'paused'], to: 'aborted', type: 'mission_aborted', label: 'aborted' },
};

export function transition(id, action) {
  const rule = FLOW[action];
  if (!rule) throw new HttpError(400, 'Unknown mission action');
  const m = getMission(id);
  if (!rule.from.includes(m.status)) throw new HttpError(409, `Cannot ${action} a mission that is ${m.status}`);
  if (rule.to === 'active' && live.activeMissionId && live.activeMissionId !== m.id)
    throw new HttpError(409, 'Another mission is already active. Pause or complete it first.');

  const now = Date.now();
  if (action === 'start') run('UPDATE missions SET status=?, started_at=? WHERE id=?', rule.to, now, m.id);
  else if (action === 'complete' || action === 'abort') run('UPDATE missions SET status=?, ended_at=? WHERE id=?', rule.to, now, m.id);
  else run('UPDATE missions SET status=? WHERE id=?', rule.to, m.id);

  // Log under this mission regardless of whether it becomes/stops being the active one.
  logEvent({
    type: rule.type,
    severity: action === 'abort' ? 'warning' : 'info',
    description: `Mission "${m.name}" ${rule.label}`,
    missionId: m.id,
  });
  live.activeMissionId = rule.to === 'active' ? m.id : live.activeMissionId === m.id ? null : live.activeMissionId;
  publish();
  return getMission(m.id);
}

export function addNote(id, textValue, operator) {
  const m = getMission(id);
  const t = text(textValue, 3000, 'Note', true);
  const op = operator || getSettings().mission.operatorName;
  const r = run('INSERT INTO mission_notes(mission_id,ts,operator,text) VALUES(?,?,?,?)', m.id, Date.now(), op, t);
  logEvent({ type: 'mission_note', severity: 'info', description: `Note added: ${t.slice(0, 120)}`, missionId: m.id });
  return get('SELECT * FROM mission_notes WHERE id = ?', Number(r.lastInsertRowid));
}

export const listNotes = (id) => all('SELECT * FROM mission_notes WHERE mission_id = ? ORDER BY ts ASC', Number(id));

export function deleteMission(id) {
  const m = getMission(id);
  if (m.status === 'active') throw new HttpError(409, 'Stop the active mission before deleting it');
  run('DELETE FROM missions WHERE id = ?', m.id);
  logEvent({ type: 'mission_deleted', severity: 'warning', description: `Mission deleted: ${m.name}`, missionId: null });
}

/** After a crash/restart a mission may still say "active" although nothing is recording. */
export function recoverMissionsOnStartup() {
  const stale = all("SELECT * FROM missions WHERE status='active'");
  for (const m of stale) {
    run("UPDATE missions SET status='paused' WHERE id=?", m.id);
    logEvent({ type: 'mission_paused', severity: 'warning', description: `Mission "${m.name}" paused automatically after a server restart. Resume it to continue recording.`, missionId: m.id });
  }
  live.activeMissionId = null;
}
