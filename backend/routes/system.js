import { Router } from 'express';
import { ah } from '../middleware/index.js';
import { getSettings, updateSettings, DEFAULTS } from '../services/settings.js';
import { getFullState } from '../services/state.js';
import { reconnectEsp } from '../services/telemetry.js';
import { camera } from '../services/camera.js';
import { getConnections } from '../services/connections.js';
import { logEvent, queryEvents, eventTypes } from '../services/events.js';
import { getHistory } from '../services/telemetry.js';
import { acknowledgeRisk, getCurrentRisk, listRiskEvents } from '../services/risk.js';
import { all, get, run } from '../database/index.js';
import { HttpError } from '../bus.js';

export const systemRouter = Router();

systemRouter.get('/health', (req, res) => res.json({ ok: true, name: 'STRUCTURE X', time: Date.now(), connections: getConnections() }));
systemRouter.get('/state', (req, res) => res.json(getFullState()));

systemRouter.post('/connections/reconnect', ah(async (req, res) => {
  const target = req.body?.target || 'all';
  if (target === 'camera' || target === 'all') camera.reconnect();
  if (target === 'esp32' || target === 'all') await reconnectEsp();
  res.json(getConnections());
}));

/* settings */
systemRouter.get('/settings', (req, res) => res.json(getSettings()));
systemRouter.get('/settings/defaults', (req, res) => res.json(DEFAULTS));
systemRouter.put('/settings', ah(async (req, res) => {
  const next = updateSettings(req.body || {});
  logEvent({ type: 'settings', severity: 'info', description: `Settings updated (${Object.keys(req.body || {}).join(', ')})` });
  res.json(next);
}));
systemRouter.post('/settings/reset', ah(async (req, res) => {
  const next = updateSettings(JSON.parse(JSON.stringify(DEFAULTS)));
  logEvent({ type: 'settings', severity: 'warning', description: 'Settings reset to factory defaults' });
  res.json(next);
}));

/* telemetry + risk */
systemRouter.get('/telemetry/history', (req, res) => res.json(getHistory(req.query)));
systemRouter.get('/risk', (req, res) => res.json({ current: getCurrentRisk(), events: listRiskEvents({ limit: 20 }) }));
systemRouter.get('/risk/events', (req, res) => res.json(listRiskEvents(req.query)));
systemRouter.post('/risk/events/:id/ack', ah(async (req, res) => {
  const r = acknowledgeRisk(Number(req.params.id), req.body?.by || getSettings().mission.operatorName);
  if (!r) throw new HttpError(404, 'Risk event not found');
  res.json(r);
}));
systemRouter.get('/risk/trend', (req, res) => {
  const minutes = Math.min(Number(req.query.minutes) || 60, 1440);
  const rows = all('SELECT ts, risk_level AS level FROM sensor_readings WHERE ts > ? AND risk_level IS NOT NULL ORDER BY ts ASC', Date.now() - minutes * 60000);
  const score = { SAFE: 0, CAUTION: 1, DANGER: 2 };
  const stride = Math.max(1, Math.ceil(rows.length / 300));
  res.json(rows.filter((_, i) => i % stride === 0).map((r) => ({ ts: r.ts, level: r.level, score: score[r.level] ?? null })));
});

/* events */
systemRouter.get('/events', (req, res) => {
  const q = req.query;
  res.json(queryEvents({ search: q.search, severity: q.severity, type: q.type, missionId: q.mission, from: q.from, to: q.to, limit: q.limit, offset: q.offset }));
});
systemRouter.get('/events/types', (req, res) => res.json(eventTypes()));

/* operators */
systemRouter.get('/operators', (req, res) => res.json(all('SELECT * FROM operators ORDER BY last_seen DESC')));
systemRouter.post('/operators', ah(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) throw new HttpError(400, 'Operator name required');
  const now = Date.now();
  run('INSERT INTO operators(name,role,created_at,last_seen) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET role=excluded.role, last_seen=excluded.last_seen', name, String(req.body?.role || '').slice(0, 80), now, now);
  res.json(get('SELECT * FROM operators WHERE name=?', name));
}));
