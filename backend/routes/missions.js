import { Router } from 'express';
import { ah } from '../middleware/index.js';
import { all } from '../database/index.js';
import * as missions from '../services/missions.js';
import { getHistory } from '../services/telemetry.js';
import { listRiskEvents } from '../services/risk.js';
import { queryEvents } from '../services/events.js';
import { missionSnapshots } from '../services/snapshots.js';
import { generateMissionReport, listReports } from '../services/reports.js';
import { getSettings } from '../services/settings.js';

export const missionsRouter = Router();

missionsRouter.get('/', (req, res) => res.json(missions.listMissions(req.query)));
missionsRouter.post('/', ah(async (req, res) => res.status(201).json(missions.createMission(req.body || {}))));

missionsRouter.get('/:id', (req, res) => {
  const m = missions.getMission(req.params.id);
  res.json({ ...m, stats: missions.missionStats(m.id), missionNotes: missions.listNotes(m.id) });
});
missionsRouter.patch('/:id', ah(async (req, res) => res.json(missions.updateMission(req.params.id, req.body || {}))));
missionsRouter.delete('/:id', ah(async (req, res) => {
  missions.deleteMission(req.params.id);
  res.json({ ok: true });
}));
missionsRouter.post('/:id/:action(start|pause|resume|complete|abort)', ah(async (req, res) => res.json(missions.transition(req.params.id, req.params.action))));

missionsRouter.get('/:id/notes', (req, res) => res.json(missions.listNotes(req.params.id)));
missionsRouter.post('/:id/notes', ah(async (req, res) => res.status(201).json(missions.addNote(req.params.id, req.body?.text, req.body?.operator))));

missionsRouter.get('/:id/readings', (req, res) => {
  missions.getMission(req.params.id);
  res.json(getHistory({ missionId: req.params.id, maxPoints: Number(req.query.maxPoints) || 400 }));
});
missionsRouter.get('/:id/events', (req, res) => res.json(queryEvents({ missionId: req.params.id, limit: req.query.limit || 300, severity: req.query.severity, type: req.query.type, search: req.query.search })));
missionsRouter.get('/:id/risk', (req, res) => res.json(listRiskEvents({ missionId: req.params.id })));
missionsRouter.get('/:id/snapshots', (req, res) => res.json(missionSnapshots(req.params.id).reverse()));
missionsRouter.get('/:id/reports', (req, res) => res.json(listReports({ missionId: req.params.id })));
missionsRouter.post('/:id/report', ah(async (req, res) => {
  const report = await generateMissionReport(Number(req.params.id), req.body?.by || getSettings().mission.operatorName);
  res.status(201).json(report);
}));
missionsRouter.get('/:id/movements', (req, res) => {
  res.json(all("SELECT ts, type, description FROM events WHERE mission_id=? AND type LIKE 'move_%' ORDER BY ts ASC LIMIT 1000", Number(req.params.id)));
});
