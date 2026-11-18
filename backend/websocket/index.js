import { WebSocketServer } from 'ws';
import { bus } from '../bus.js';
import { getFullState } from '../services/state.js';
import * as control from '../services/control.js';
import { getSettings } from '../services/settings.js';

/**
 * WebSocket hub at /ws.
 *  server -> client:  state | telemetry | robot | connections | risk | mission | event | settings | ack | pong
 *  client -> server:  hello {clientId} | move {dir,seq} | stop {seq} | estop | ping {ts}
 *
 * A dropped socket that was driving triggers an immediate STOP (in addition to the heartbeat watchdog).
 */
export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const send = (ws, t, data) => ws.readyState === 1 && ws.send(JSON.stringify({ t, data }));
  const broadcast = (t, data) => wss.clients.forEach((ws) => send(ws, t, data));

  for (const topic of ['telemetry', 'robot', 'connections', 'risk', 'mission', 'event']) bus.on(topic, (d) => broadcast(topic, d));
  bus.on('settings', ({ next }) => broadcast('settings', next));

  wss.on('connection', (ws) => {
    ws.clientId = `ws-${Math.random().toString(36).slice(2, 10)}`;
    ws.lastDriveAt = 0;
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    send(ws, 'state', getFullState());

    ws.on('message', async (buf) => {
      let msg;
      try {
        msg = JSON.parse(buf.toString());
      } catch {
        return;
      }
      try {
        switch (msg.t) {
          case 'hello':
            if (typeof msg.clientId === 'string') ws.clientId = msg.clientId.slice(0, 64);
            break;
          case 'ping':
            send(ws, 'pong', { ts: msg.ts, server: Date.now() });
            break;
          case 'move': {
            ws.lastDriveAt = Date.now();
            const r = await control.move(String(msg.dir).toUpperCase(), { clientId: ws.clientId, source: 'ws' });
            send(ws, 'ack', { seq: msg.seq, ...r });
            break;
          }
          case 'stop': {
            const r = await control.stop('release', { clientId: ws.clientId });
            send(ws, 'ack', { seq: msg.seq, ...r });
            break;
          }
          case 'estop': {
            const r = await control.emergencyStop({ clientId: ws.clientId });
            send(ws, 'ack', { seq: msg.seq, ...r });
            break;
          }
          default:
            break;
        }
      } catch (e) {
        send(ws, 'ack', { seq: msg.seq, ok: false, confirmed: false, error: e.code || 'error', message: e.message });
      }
    });

    ws.on('close', () => {
      // Operator device vanished while holding a control: stop immediately.
      if (Date.now() - ws.lastDriveAt < 1500) control.stop('operator disconnected').catch(() => {});
    });
  });

  // Ping clients so half-open sockets (phone left Wi-Fi) are detected and cleaned up.
  const hb = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 5000);
  hb.unref();

  // Push the full state periodically so connection ages etc. stay fresh even without events.
  const st = setInterval(() => broadcast('state', getFullState()), 15000);
  st.unref();

  return wss;
}

export const wsDebug = () => getSettings().demoMode;
