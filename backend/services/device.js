import { getSettings } from './settings.js';

/**
 * Hardware communication layer.
 * Everything that talks to the main ESP32 goes through `HardwareDevice`. Base URL and endpoint
 * templates come from settings, so addresses/paths can be changed without touching code.
 * `SimulatedDevice` implements the same interface for demo mode and is always labelled `simulated`.
 */

function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(params[k] ?? '')));
}

export class HardwareDevice {
  kind = 'hardware';

  async request(pathTemplate, params = {}, { timeoutMs } = {}) {
    const { network } = getSettings();
    const target = network.apiBaseUrl + fill(pathTemplate, params);
    const started = Date.now();
    const res = await fetch(target, {
      signal: AbortSignal.timeout(timeoutMs ?? network.timeoutMs),
      headers: { Accept: 'application/json, text/plain, */*' },
      cache: 'no-store',
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* firmware may answer plain text */
    }
    if (!res.ok) throw new Error(`ESP32 answered HTTP ${res.status}`);
    return { ok: true, status: res.status, json, text, ms: Date.now() - started };
  }

  move(dir, opts) {
    return this.request(getSettings().network.endpoints.move, { dir }, opts);
  }
  speed(value, opts) {
    return this.request(getSettings().network.endpoints.speed, { value }, opts);
  }
  servo(servo, angle, opts) {
    return this.request(getSettings().network.endpoints.servo, { servo, angle }, opts);
  }
  async data(opts) {
    const r = await this.request(getSettings().network.endpoints.data, {}, opts);
    if (!r.json || typeof r.json !== 'object') throw new Error('ESP32 /data did not return JSON');
    return { raw: r.json, ms: r.ms };
  }
}

/** Synthetic robot used only in demo mode. Every payload is flagged simulated. */
export class SimulatedDevice {
  kind = 'simulated';
  t0 = Date.now();
  dir = 'S';
  lastCmd = 0;
  speedValue = 170;
  servoL = 90;
  servoR = 90;

  async delay() {
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 25));
  }
  async move(dir) {
    await this.delay();
    this.dir = dir;
    this.lastCmd = Date.now();
    return { ok: true, status: 200, json: { ok: true, dir }, text: 'OK', ms: 20 };
  }
  async speed(value) {
    await this.delay();
    this.speedValue = Number(value);
    return { ok: true, status: 200, json: { ok: true, speed: this.speedValue }, text: 'OK', ms: 20 };
  }
  async servo(servo, angle) {
    await this.delay();
    if (servo === 'L' || servo === 'BOTH') this.servoL = Number(angle);
    if (servo === 'R' || servo === 'BOTH') this.servoR = Number(angle);
    return { ok: true, status: 200, json: { ok: true }, text: 'OK', ms: 20 };
  }
  async data() {
    await this.delay();
    if (this.dir !== 'S' && Date.now() - this.lastCmd > 900) this.dir = 'S'; // emulate firmware watchdog
    const t = (Date.now() - this.t0) / 1000;
    const spike = Math.sin(t / 40) > 0.92 ? 1100 * (Math.sin(t / 40) - 0.92) * 12 : 0;
    const raw = {
      simulated: true,
      distance: +(70 + 45 * Math.sin(t / 9) + Math.random() * 2).toFixed(1),
      temperature: +(26 + 4 * Math.sin(t / 70) + Math.random() * 0.2).toFixed(1),
      humidity: +(52 + 6 * Math.sin(t / 55) + Math.random() * 0.4).toFixed(1),
      gas: Math.round(620 + 90 * Math.sin(t / 13) + spike + Math.random() * 15),
      gasWarmup: Math.max(0, Math.round(10 - t)),
      motion: Math.sin(t / 17) > 0.85 ? 1 : 0,
      movement: this.dir,
      risk: 'SAFE',
      speed: this.speedValue,
      servoL: this.servoL,
      servoR: this.servoR,
      uptime: Math.round(t),
    };
    return { raw, ms: 20 };
  }
}

let hardware = null;
let simulated = null;

export function getDevice() {
  if (getSettings().demoMode) return (simulated ??= new SimulatedDevice());
  return (hardware ??= new HardwareDevice());
}
