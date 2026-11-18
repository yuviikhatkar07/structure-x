import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, allDynamic, get, run } from '../database/index.js';
import { HttpError, live } from '../bus.js';
import { SNAPSHOT_DIR } from '../config.js';
import { getSettings } from './settings.js';
import { getCurrentRisk } from './risk.js';
import { logEvent } from './events.js';

const isJpeg = (b) => b && b.length > 4 && b[0] === 0xff && b[1] === 0xd8;

export function saveSnapshot(buffer, { note = '', source = 'camera', missionId } = {}) {
  if (!isJpeg(buffer)) throw new HttpError(400, 'Image must be a JPEG');
  const ts = Date.now();
  const filename = `snap_${ts}_${crypto.randomBytes(3).toString('hex')}.jpg`;
  fs.writeFileSync(path.join(SNAPSHOT_DIR, filename), buffer); // image on disk; metadata in SQLite
  const mission = missionId === undefined ? live.activeMissionId : missionId;
  const r = run(
    `INSERT INTO snapshots(ts,mission_id,operator,note,risk_level,filename,size_bytes,source) VALUES(?,?,?,?,?,?,?,?)`,
    ts,
    mission,
    getSettings().mission.operatorName,
    String(note || '').slice(0, 1000),
    getCurrentRisk().level,
    filename,
    buffer.length,
    source,
  );
  const snap = getSnapshot(Number(r.lastInsertRowid));
  logEvent({
    type: 'snapshot',
    severity: 'info',
    description: `Snapshot #${snap.id} captured${source !== 'camera' ? ` (${source})` : ''}`,
    meta: { snapshotId: snap.id },
  });
  return snap;
}

export function getSnapshot(id) {
  const s = get('SELECT * FROM snapshots WHERE id = ?', Number(id));
  if (!s) throw new HttpError(404, 'Snapshot not found');
  return s;
}

export const snapshotPath = (s) => path.join(SNAPSHOT_DIR, path.basename(s.filename));

export function listSnapshots({ missionId, from, to, limit = 60, offset = 0, unassigned } = {}) {
  const where = [];
  const p = [];
  if (missionId) {
    where.push('s.mission_id = ?');
    p.push(Number(missionId));
  }
  if (unassigned) where.push('s.mission_id IS NULL');
  if (from) {
    where.push('s.ts >= ?');
    p.push(Number(from));
  }
  if (to) {
    where.push('s.ts <= ?');
    p.push(Number(to));
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = allDynamic(
    `SELECT s.*, m.name AS mission_name FROM snapshots s LEFT JOIN missions m ON m.id = s.mission_id ${w} ORDER BY s.ts DESC LIMIT ? OFFSET ?`,
    [...p, Math.min(Number(limit) || 60, 300), Number(offset) || 0],
  );
  const total = allDynamic(`SELECT COUNT(*) AS c FROM snapshots s ${w}`, p)[0].c;
  return { total, snapshots: rows };
}

export function updateSnapshot(id, patch) {
  const s = getSnapshot(id);
  const note = patch.note !== undefined ? String(patch.note).slice(0, 1000) : s.note;
  let mission = s.mission_id;
  if (patch.missionId !== undefined) {
    mission = patch.missionId === null ? null : Number(patch.missionId);
    if (mission !== null && !get('SELECT id FROM missions WHERE id=?', mission)) throw new HttpError(404, 'Mission not found');
  }
  run('UPDATE snapshots SET note=?, mission_id=? WHERE id=?', note, mission, s.id);
  return getSnapshot(id);
}

export function deleteSnapshot(id) {
  const s = getSnapshot(id);
  try {
    fs.unlinkSync(snapshotPath(s));
  } catch {
    /* file already gone */
  }
  run('DELETE FROM snapshots WHERE id = ?', s.id);
  logEvent({ type: 'snapshot_deleted', severity: 'warning', description: `Snapshot #${s.id} deleted` });
}

export const missionSnapshots = (missionId) => all('SELECT * FROM snapshots WHERE mission_id=? ORDER BY ts ASC', Number(missionId));
