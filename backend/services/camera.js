import net from 'node:net';
import { bus, sleep } from '../bus.js';
import { getSettings } from './settings.js';
import { setCamera } from './connections.js';

/**
 * Camera hub.
 * The ESP32-CAM can serve only ONE MJPEG client reliably, but several operator devices (laptop + phone)
 * may want to watch. The hub keeps a single upstream connection and fans frames out to every browser.
 * It also keeps the latest JPEG so snapshots never open a second stream.
 *
 * Upstream is opened on demand (first viewer / snapshot) and closed ~8 s after the last viewer leaves.
 * While idle, a cheap TCP probe reports camera reachability without taking the stream slot.
 */
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

class CameraHub {
  clients = new Set();
  running = false;
  abort = null;
  lastFrame = null;
  lastFrameTs = 0;
  lastActivity = 0;
  keepAliveUntil = 0;
  frameTimes = [];
  frameWaiters = [];

  start() {
    setInterval(() => this.tick(), 1000).unref();
    this.probe();
  }

  wanted() {
    return this.clients.size > 0 || Date.now() < this.keepAliveUntil;
  }

  fps() {
    const cutoff = Date.now() - 3000;
    this.frameTimes = this.frameTimes.filter((t) => t > cutoff);
    return +(this.frameTimes.length / 3).toFixed(1);
  }

  extra() {
    return {
      viewers: this.clients.size,
      fps: this.running ? this.fps() : 0,
      idle: !this.running,
      simulated: false,
      lastFrame: this.lastFrameTs || null,
    };
  }

  subscribe(res) {
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Connection: 'close',
    });
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
    if (this.lastFrame && Date.now() - this.lastFrameTs < 2000) this.send(res, this.lastFrame);
    this.ensureUpstream();
  }

  send(res, frame) {
    if (res.writableNeedDrain || res.destroyed) return; // slow client: drop frame, never buffer video
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
    res.write(frame);
    res.write('\r\n');
  }

  onFrame(frame) {
    this.lastFrame = frame;
    this.lastFrameTs = Date.now();
    this.lastActivity = this.lastFrameTs;
    this.frameTimes.push(this.lastFrameTs);
    for (const c of this.clients) this.send(c, frame);
    const w = this.frameWaiters.splice(0);
    w.forEach((fn) => fn(frame));
    setCamera('connected', null, this.extra());
  }

  ensureUpstream() {
    if (this.running || getSettings().demoMode) return;
    this.running = true;
    this.loop().finally(() => {
      this.running = false;
      setCamera('connecting', null, this.extra());
    });
  }

  async loop() {
    while (this.wanted() && !getSettings().demoMode) {
      try {
        await this.runUpstream();
      } catch (e) {
        if (!this.intentionalAbort) setCamera('disconnected', e.name === 'AbortError' ? 'timeout / no frames' : e.message, this.extra());
      }
      this.intentionalAbort = false;
      if (!this.wanted()) break;
      await sleep(getSettings().network.reconnectIntervalMs);
    }
  }

  async runUpstream() {
    const { network } = getSettings();
    const ac = new AbortController();
    this.abort = ac;
    this.lastActivity = Date.now();
    const connectTimer = setTimeout(() => ac.abort(), network.timeoutMs * 3 + 2000);
    let res;
    try {
      res = await fetch(network.cameraStreamUrl, { signal: ac.signal, cache: 'no-store' });
    } finally {
      clearTimeout(connectTimer);
    }
    if (!res.ok || !res.body) throw new Error(`camera answered HTTP ${res.status}`);
    const reader = res.body.getReader();
    let buf = Buffer.alloc(0);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error('camera stream ended');
      this.lastActivity = Date.now();
      buf = buf.length ? Buffer.concat([buf, value]) : Buffer.from(value);
      for (;;) {
        const s = buf.indexOf(SOI);
        if (s < 0) {
          buf = buf.subarray(Math.max(0, buf.length - 1));
          break;
        }
        const e = buf.indexOf(EOI, s + 2);
        if (e < 0) {
          buf = buf.subarray(s);
          if (buf.length > 3_000_000) buf = Buffer.alloc(0); // corrupt stream guard
          break;
        }
        this.onFrame(Buffer.from(buf.subarray(s, e + 2)));
        buf = buf.subarray(e + 2);
      }
    }
  }

  tick() {
    if (getSettings().demoMode) {
      setCamera('connected', null, { ...this.extra(), simulated: true, idle: true });
      return;
    }
    if (this.running) {
      const stale = Date.now() - this.lastActivity > 5000;
      if (this.abort && (stale || !this.wanted())) {
        this.intentionalAbort = !this.wanted();
        this.abort.abort();
        if (stale) setCamera('disconnected', 'no frames for 5 s', this.extra());
      }
      setCamera(undefined, null, this.extra());
    } else {
      this.probe();
    }
  }

  /** TCP reachability probe for the idle state. Does not request the stream. */
  probe() {
    if (this.probing || this.running) return;
    const { network, demoMode } = getSettings();
    if (demoMode) return;
    let host;
    let port;
    try {
      const u = new URL(network.cameraStreamUrl);
      host = u.hostname;
      port = Number(u.port || 80);
    } catch {
      return;
    }
    this.probing = true;
    const sock = net.connect({ host, port, timeout: Math.min(network.timeoutMs, 2000) });
    const done = (ok, err) => {
      this.probing = false;
      sock.destroy();
      if (this.running) return;
      setCamera(ok ? 'connected' : 'disconnected', ok ? null : err, this.extra());
    };
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false, 'timeout'));
    sock.once('error', (e) => done(false, e.code || e.message));
  }

  reconnect() {
    setCamera('connecting', null, this.extra());
    if (this.abort) {
      this.intentionalAbort = true;
      this.abort.abort();
    }
    this.probing = false;
    this.probe();
    if (this.wanted()) this.ensureUpstream();
  }

  /** Latest JPEG, opening the upstream briefly if nobody is watching. */
  async capture() {
    const { network, demoMode } = getSettings();
    if (demoMode) {
      const err = new Error('Demo mode has no physical camera');
      err.code = 'demo_no_camera';
      throw err;
    }
    if (this.lastFrame && Date.now() - this.lastFrameTs < 1500) return { buffer: this.lastFrame, ts: this.lastFrameTs };

    this.keepAliveUntil = Date.now() + 8000;
    this.ensureUpstream();
    const frame = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 4000);
      this.frameWaiters.push((f) => {
        clearTimeout(t);
        resolve(f);
      });
    });
    if (frame) return { buffer: frame, ts: this.lastFrameTs };

    if (network.cameraCaptureUrl) {
      const res = await fetch(network.cameraCaptureUrl, { signal: AbortSignal.timeout(network.timeoutMs * 2), cache: 'no-store' });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.subarray(0, 2).equals(SOI)) return { buffer, ts: Date.now() };
      }
    }
    const err = new Error('Camera did not deliver a frame. Check the ESP32-CAM connection.');
    err.code = 'camera_unavailable';
    throw err;
  }
}

export const camera = new CameraHub();

bus.on('settings', ({ prev, next }) => {
  if (prev && (prev.network.cameraStreamUrl !== next.network.cameraStreamUrl || prev.demoMode !== next.demoMode)) {
    camera.lastFrame = null;
    camera.reconnect();
  }
});
