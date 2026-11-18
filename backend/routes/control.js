import { Router } from 'express';
import { ah, clientId } from '../middleware/index.js';
import * as control from '../services/control.js';

export const controlRouter = Router();

controlRouter.post('/move', ah(async (req, res) => res.json(await control.move(String(req.body.dir || '').toUpperCase(), { clientId: clientId(req) }))));
controlRouter.post('/stop', ah(async (req, res) => res.json(await control.stop('stop', { clientId: clientId(req) }))));
controlRouter.post('/estop', ah(async (req, res) => res.json(await control.emergencyStop({ clientId: clientId(req) }))));
controlRouter.post('/rearm', ah(async (req, res) => res.json(control.rearm())));
controlRouter.post('/speed', ah(async (req, res) => res.json(await control.setSpeed(req.body.value))));
controlRouter.post('/servo', ah(async (req, res) => {
  const { servo, angle, action, calibrate } = req.body;
  res.json(await control.setFlipper({ servo: String(servo || '').toUpperCase(), angle, action, calibrate: !!calibrate }));
}));
