import { all, allDynamic, get, run } from '../database/index.js';
import { bus, live } from '../bus.js';
import { getSettings } from './settings.js';

function format(r) {
  return { ...r, meta: r.meta ? safeJson(r.meta) : null };
}
const safeJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/**
 * Persist an event and broadcast it. Mission id defaults to the currently ACTIVE mission.
 * Never throws: logging must not break control paths.
 */
export function logEvent({ type, severity = 'info', description, meta = null, missionId, operator }) {
  try {
    const row = {
      ts: Date.now(),
      type,
      severity,
      description,
      mission_id: missionId === undefined ? live.activeMissionId : missionId,
      operator: operator ?? getSettings().mission.operatorName,
      meta: meta ? JSON.stringify(meta) : null,
    };
    const r = run(
      `INSERT INTO events(ts,type,severity,description,mission_id,operator,meta) VALUES(?,?,?,?,?,?,?)`,
      row.ts,
      row.type,
      row.severity,
      row.description,
      row.mission_id,
      row.operator,
      row.meta,
    );
    const ev = format({ id: Number(r.lastInsertRowid), ...row });
    bus.emit('event', ev);
    return ev;
  } catch (e) {
    console.error('[events] failed to log event:', e.message);
    return null;
  }
}

export function queryEvents({ search, severity, type, missionId, from, to, limit = 100, offset = 0 } = {}) {
  const where = [];
  const p = [];
  if (search) {
    where.push('(description LIKE ? OR type LIKE ? OR operator LIKE ?)');
    p.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (severity) {
    const list = String(severity).split(',').filter(Boolean);
    where.push(`severity IN (${list.map(() => '?').join(',')})`);
    p.push(...list);
  }
  if (type) {
    const list = String(type).split(',').filter(Boolean);
    where.push(`type IN (${list.map(() => '?').join(',')})`);
    p.push(...list);
  }
  if (missionId) {
    where.push('mission_id = ?');
    p.push(Number(missionId));
  }
  if (from) {
    where.push('ts >= ?');
    p.push(Number(from));
  }
  if (to) {
    where.push('ts <= ?');
    p.push(Number(to));
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 1000);
  const off = Math.max(Number(offset) || 0, 0);
  const rows = allDynamic(`SELECT * FROM events ${w} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`, [...p, lim, off]);
  const total = allDynamic(`SELECT COUNT(*) AS c FROM events ${w}`, p)[0].c;
  return { total, events: rows.map(format) };
}

export const eventTypes = () => all('SELECT DISTINCT type FROM events ORDER BY type').map((r) => r.type);
export const countEvents = () => get('SELECT COUNT(*) AS c FROM events').c;
