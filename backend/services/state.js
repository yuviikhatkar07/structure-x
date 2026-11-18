import { getSettings } from './settings.js';
import { getConnections } from './connections.js';
import { getRobotState } from './control.js';
import { getLatest } from './telemetry.js';
import { getActiveMission, getPausedMissions } from './missions.js';

/** Complete snapshot sent to every client on connect and on GET /api/state. */
export function getFullState() {
  const latest = getLatest();
  return {
    serverTime: Date.now(),
    demo: getSettings().demoMode,
    connections: getConnections(),
    robot: getRobotState(),
    telemetry: { reading: latest.reading, sensors: latest.sensors, risk: latest.risk },
    mission: getActiveMission(),
    pausedMissions: getPausedMissions().map((m) => ({ id: m.id, name: m.name })),
    settings: getSettings(),
  };
}
