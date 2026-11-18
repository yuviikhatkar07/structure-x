import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import cors from 'cors';
import { PORT, HOST, FRONTEND_DIST, DATA_DIR } from './config.js';
import { migrate } from './database/index.js';
import { loadSettings, getSettings } from './services/settings.js';
import { errorHandler, notFound } from './middleware/index.js';
import { attachWebSocket } from './websocket/index.js';
import { controlRouter } from './routes/control.js';
import { systemRouter } from './routes/system.js';
import { missionsRouter } from './routes/missions.js';
import { cameraRouter, snapshotsRouter, reportsRouter } from './routes/media.js';
import { startTelemetry, stopTelemetry } from './services/telemetry.js';
import { startDbWatch } from './services/connections.js';
import { camera } from './services/camera.js';
import { recoverMissionsOnStartup } from './services/missions.js';
import { startRetention } from './services/retention.js';
import { logEvent } from './services/events.js';
import * as control from './services/control.js';

migrate();
loadSettings();
recoverMissionsOnStartup();

const app = express();
app.disable('x-powered-by');
app.use(cors()); // LAN tool: any operator device on the robot network may call the API
app.use(express.json({ limit: '1mb' }));

app.use('/api/control', controlRouter);
app.use('/api/missions', missionsRouter);
app.use('/api/camera', cameraRouter);
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api', systemRouter);
app.use('/api', notFound);

// Production: serve the built frontend from the same origin (no CORS / mixed-content problems).
if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST, { index: 'index.html', maxAge: '1h' }));
  app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
} else {
  app.get('/', (req, res) =>
    res.type('text/plain').send('STRUCTURE X API is running. Frontend not built: run "npm run build" or use "npm run dev" (http://localhost:5173).'),
  );
}
app.use(errorHandler);

const server = http.createServer(app);
attachWebSocket(server);

server.listen(PORT, HOST, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n  STRUCTURE X — Advanced Disaster Inspection System');
  console.log(`  Mode      : ${getSettings().demoMode ? 'DEMO (simulated robot — no hardware)' : 'HARDWARE'}`);
  console.log(`  Robot API : ${getSettings().network.apiBaseUrl}`);
  console.log(`  Camera    : ${getSettings().network.cameraStreamUrl}`);
  console.log(`  Data dir  : ${DATA_DIR}`);
  console.log(`  Local     : http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`  Network   : http://${ip}:${PORT}   (open this on your phone/tablet)`));
  console.log('');
  logEvent({ type: 'system', severity: 'info', description: `Backend started (${getSettings().demoMode ? 'demo' : 'hardware'} mode)`, missionId: null });
  startTelemetry();
  camera.start();
  startDbWatch();
  startRetention();
});

let closing = false;
async function shutdown(sig) {
  if (closing) return;
  closing = true;
  console.log(`\n[server] ${sig} received – stopping robot and shutting down`);
  stopTelemetry();
  try {
    await Promise.race([control.stop('server shutdown'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* best effort */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => {
  console.error('[fatal] uncaught exception', e);
  control.stop('server error').finally(() => process.exit(1));
});
process.on('unhandledRejection', (e) => console.error('[warn] unhandled rejection', e));
