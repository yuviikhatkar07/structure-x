import mqtt from 'mqtt';

/**
 * MQTT transport for the main ESP32. Same interface as HardwareDevice (move / speed / servo / data),
 * so control.js and telemetry.js work unchanged.
 *
 * Env (set on Render):  MQTT_HOST  MQTT_PORT (default 8883)  MQTT_USERNAME  MQTT_PASSWORD
 * Topics: structure-x/rover/{command,telemetry,ack,status}
 */
const T = {
  command: 'structure-x/rover/command',
  telemetry: 'structure-x/rover/telemetry',
  ack: 'structure-x/rover/ack',
  status: 'structure-x/rover/status',
};
const TELEMETRY_MAX_AGE_MS = 5000;

export class MqttDevice {
  kind = 'hardware';
  latest = null;
  latestAt = 0;
  online = false;
  waiters = new Map(); // cmd -> Set<{resolve, reject, timer}>

  constructor() {
    const host = process.env.MQTT_HOST;
    const port = Number(process.env.MQTT_PORT || 8883);
    this.client = mqtt.connect(`mqtts://${host}:${port}`, {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clientId: `structure-x-backend-${Math.random().toString(16).slice(2, 8)}`,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
    });
    this.client.on('connect', () => {
      console.log('[mqtt] backend connected to broker');
      this.client.subscribe([T.telemetry, T.ack, T.status]);
    });
    this.client.on('error', (e) => console.error('[mqtt] error:', e.message));
    this.client.on('message', (topic, buf) => this.onMessage(topic, buf.toString()));
  }

  onMessage(topic, text) {
    if (topic === T.telemetry) {
      try {
        this.latest = JSON.parse(text);
        this.latestAt = Date.now();
      } catch {
        /* ignore malformed */
      }
    } else if (topic === T.status) {
      this.online = text.trim().toUpperCase() === 'ONLINE';
      if (!this.online) this.latest = null;
    } else if (topic === T.ack) {
      try {
        const a = JSON.parse(text);
        const set = this.waiters.get(String(a.cmd).toUpperCase());
        if (!set) return;
        for (const w of set) {
          clearTimeout(w.timer);
          a.ok ? w.resolve(a) : w.reject(new Error(a.error || 'ESP32 rejected command'));
        }
        this.waiters.delete(String(a.cmd).toUpperCase());
      } catch {
        /* ignore malformed */
      }
    }
  }

  send(cmd, { timeoutMs = 1500 } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.client.connected) return reject(new Error('MQTT broker not connected'));
      const key = cmd.toUpperCase();
      const w = {
        resolve: (a) => resolve({ ok: true, status: 200, json: a, text: 'OK', ms: Date.now() - t0 }),
        reject,
        timer: setTimeout(() => {
          this.waiters.get(key)?.delete(w);
          const err = new Error('no ack from ESP32 (timeout)');
          err.name = 'TimeoutError';
          reject(err);
        }, timeoutMs),
      };
      const t0 = Date.now();
      if (!this.waiters.has(key)) this.waiters.set(key, new Set());
      this.waiters.get(key).add(w);
      this.client.publish(T.command, cmd, { qos: 0 }, (err) => {
        if (err) {
          clearTimeout(w.timer);
          this.waiters.get(key)?.delete(w);
          reject(err);
        }
      });
    });
  }

  move(dir, opts) {
    return this.send(String(dir).toUpperCase(), opts);
  }
  speed(value, opts) {
    return this.send(`SPEED:${Math.round(value)}`, opts);
  }
  servo(servo, angle, opts) {
    return this.send(`SERVO:${servo}:${Math.round(angle)}`, opts);
  }
  async data() {
    if (!this.latest || Date.now() - this.latestAt > TELEMETRY_MAX_AGE_MS) {
      const err = new Error('no recent telemetry from ESP32 over MQTT');
      err.name = 'TimeoutError';
      throw err;
    }
    return { raw: this.latest, ms: Date.now() - this.latestAt };
  }
}