import type { Dir } from '../types';
import { api } from './api';
import type { RobotSocket } from './socket';

const HEARTBEAT_MS = 200; // backend watchdog = 600 ms, firmware watchdog ≈ 900 ms

const OPPOSITE: Record<Dir, Dir | null> = { F: 'B', B: 'F', L: 'R', R: 'L', S: null };

export interface DriveSnapshot {
  intent: Dir; // what the operator is currently asking for
  pending: boolean; // intent sent, no confirmation from the robot yet
  error: string | null;
}

/**
 * Frontend drive controller.
 *  - Multiple input sources (pointer buttons, keyboard keys, joystick) register presses by id.
 *  - Contradictory inputs (F+B, L+R) resolve to STOP; otherwise the most recent press wins.
 *  - While a direction is held a heartbeat is sent every 200 ms. Release => immediate STOP.
 *  - Success is only reported once the backend relays the ESP32's acknowledgement.
 */
export class DriveController {
  private presses: { src: string; dir: Dir; t: number }[] = [];
  private intent: Dir = 'S';
  private timer: number | undefined;
  private seq = 0;
  private confirmedSeq = -1;
  private pending = false;
  private error: string | null = null;
  private listeners = new Set<(s: DriveSnapshot) => void>();
  private offAck: () => void;

  constructor(
    private socket: RobotSocket,
    private allowed: () => boolean,
  ) {
    this.offAck = socket.on('ack', (a) => this.onAck(a));
  }

  dispose() {
    this.offAck();
    window.clearInterval(this.timer);
  }

  subscribe(fn: (s: DriveSnapshot) => void) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  snapshot(): DriveSnapshot {
    return { intent: this.intent, pending: this.pending, error: this.error };
  }

  private emit() {
    const s = this.snapshot();
    this.listeners.forEach((l) => l(s));
  }

  press(src: string, dir: Dir) {
    if (dir === 'S') return this.stopAll();
    if (!this.allowed()) return;
    this.presses = this.presses.filter((p) => p.src !== src);
    this.presses.push({ src, dir, t: Date.now() });
    this.error = null;
    this.apply();
  }

  release(src: string) {
    const before = this.presses.length;
    this.presses = this.presses.filter((p) => p.src !== src);
    if (this.presses.length !== before) this.apply();
  }

  /** Drop every held control and STOP (visibility loss, disconnect, E-stop, Space). */
  stopAll() {
    this.presses = [];
    this.apply(true);
  }

  private resolve(): Dir {
    if (!this.presses.length) return 'S';
    const dirs = new Set(this.presses.map((p) => p.dir));
    for (const d of dirs) {
      const o = OPPOSITE[d];
      if (o && dirs.has(o)) return 'S'; // contradictory inputs: never move
    }
    return this.presses[this.presses.length - 1].dir;
  }

  private apply(force = false) {
    const next = this.resolve();
    const changed = next !== this.intent;
    this.intent = next;
    window.clearInterval(this.timer);
    if (next === 'S') {
      if (changed || force) this.sendStop();
      this.pending = false;
      this.emit();
      return;
    }
    this.pending = true;
    this.sendMove(next);
    this.timer = window.setInterval(() => {
      if (!this.allowed()) return this.stopAll();
      this.sendMove(this.intent);
    }, HEARTBEAT_MS);
    this.emit();
  }

  private sendMove(dir: Dir) {
    const seq = ++this.seq;
    if (!this.socket.send({ t: 'move', dir, seq })) {
      // WebSocket down: fall back to HTTP so the operator isn't stranded, but never keep driving blind.
      api.move(dir).then(
        () => this.onAck({ seq, ok: true, confirmed: true }),
        (e: Error) => this.onAck({ seq, ok: false, confirmed: false, message: e.message }),
      );
    }
  }

  private sendStop() {
    const seq = ++this.seq;
    const viaWs = this.socket.send({ t: 'stop', seq });
    if (!viaWs) api.stop().catch(() => {});
    // belt and braces: a second stop shortly after covers a dropped packet on a flaky link
    window.setTimeout(() => {
      if (this.intent === 'S') this.socket.send({ t: 'stop', seq: ++this.seq });
    }, 180);
  }

  private onAck(a: { seq?: number; ok?: boolean; confirmed?: boolean; message?: string; error?: string }) {
    if (a.seq !== undefined && a.seq < this.confirmedSeq) return;
    if (a.ok === false && a.error && this.intent !== 'S') {
      this.error = a.message || a.error;
      // A rejected move (E-stop, busy, offline) ends the press so the UI doesn't look like it is driving.
      this.presses = [];
      this.apply(true);
      return;
    }
    if (a.confirmed && a.seq !== undefined) {
      this.confirmedSeq = a.seq;
      if (this.pending) {
        this.pending = false;
        this.emit();
      }
    }
  }
}
