import { Router, raw } from 'express';
import fs from 'node:fs';
import { ah } from '../middleware/index.js';
import { HttpError } from '../bus.js';
import { camera } from '../services/camera.js';
import { getSettings } from '../services/settings.js';
import { getConnections } from '../services/connections.js';
import * as snaps from '../services/snapshots.js';
import * as reports from '../services/reports.js';

export const cameraRouter = Router();
export const snapshotsRouter = Router();
export const reportsRouter = Router();

/* ------------------------------ camera ------------------------------ */
cameraRouter.get('/stream', (req, res) => {
  if (getSettings().demoMode) return res.status(409).json({ error: 'demo_no_camera', message: 'Demo mode has no physical camera' });
  camera.subscribe(res);
});
cameraRouter.get('/status', (req, res) => res.json(getConnections().camera));
cameraRouter.post('/reconnect', (req, res) => {
  camera.reconnect();
  res.json(getConnections().camera);
});

/* ------------------------------ snapshots ------------------------------ */
snapshotsRouter.get('/', (req, res) => {
  const q = req.query;
  res.json(snaps.listSnapshots({ missionId: q.mission, from: q.from, to: q.to, limit: q.limit, offset: q.offset, unassigned: q.unassigned === '1' }));
});

snapshotsRouter.post('/capture', ah(async (req, res) => {
  let frame;
  try {
    frame = await camera.capture();
  } catch (e) {
    throw new HttpError(e.code === 'demo_no_camera' ? 409 : 503, e.message, e.code || 'camera_unavailable');
  }
  res.status(201).json(snaps.saveSnapshot(frame.buffer, { note: req.body?.note, source: 'camera' }));
}));

/** Used only in demo mode, where the browser renders a clearly-labelled synthetic frame. */
snapshotsRouter.post('/upload', raw({ type: 'image/jpeg', limit: '8mb' }), ah(async (req, res) => {
  if (!getSettings().demoMode) throw new HttpError(403, 'Uploads are only accepted in demo mode; real snapshots come from the ESP32-CAM', 'not_demo');
  const note = String(req.get('x-note') || '');
  res.status(201).json(snaps.saveSnapshot(req.body, { note: note ? decodeURIComponent(note) : 'DEMO synthetic frame', source: 'demo' }));
}));

snapshotsRouter.get('/:id/image', (req, res) => {
  const s = snaps.getSnapshot(req.params.id);
  const p = snaps.snapshotPath(s);
  if (!fs.existsSync(p)) throw new HttpError(404, 'Image file missing');
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="structurex_snapshot_${s.id}_${new Date(s.ts).toISOString().replace(/[:.]/g, '-')}.jpg"`);
  fs.createReadStream(p).pipe(res);
});
snapshotsRouter.patch('/:id', ah(async (req, res) => res.json(snaps.updateSnapshot(req.params.id, req.body || {}))));
snapshotsRouter.delete('/:id', ah(async (req, res) => {
  snaps.deleteSnapshot(req.params.id);
  res.json({ ok: true });
}));

/* ------------------------------ reports ------------------------------ */
reportsRouter.get('/', (req, res) => res.json(reports.listReports({ missionId: req.query.mission })));
reportsRouter.get('/:id/download', (req, res) => {
  const r = reports.getReport(req.params.id);
  const p = reports.reportPath(r);
  if (!fs.existsSync(p)) throw new HttpError(404, 'Report file missing');
  res.setHeader('Content-Type', 'application/pdf');
  // ?inline=1 opens in the browser's PDF viewer (printable); default forces a download.
  res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="STRUCTURE-X_Report_M${r.mission_id}_${r.id}.pdf"`);
  fs.createReadStream(p).pipe(res);
});
reportsRouter.delete('/:id', ah(async (req, res) => {
  reports.deleteReport(req.params.id);
  res.json({ ok: true });
}));
