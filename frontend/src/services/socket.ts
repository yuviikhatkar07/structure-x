import { CLIENT_ID } from './api';

export type SocketStatus = 'connecting' | 'open' | 'closed';
type Handler = (data: any) => void;

/**
 * WebSocket client with automatic reconnect (exponential back-off up to 3 s).
 * Used for real-time telemetry AND the low-latency drive heartbeat.
 */
export class RobotSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private statusHandlers = new Set<(s: SocketStatus) => void>();
  private retry = 0;
  private timer: number | undefined;
  private closedByUser = false;
  status: SocketStatus = 'connecting';
  lastMessageAt = 0;
  latencyMs: number | null = null;
  private pingTimer: number | undefined;

  connect() {
    this.closedByUser = false;
    this.setStatus('connecting');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? `${proto}://${location.host}/ws`
    : 'wss://structure-x.onrender.com/ws';

const ws = new WebSocket(wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.setStatus('open');
      this.send({ t: 'hello', clientId: CLIENT_ID });
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', ts: Date.now() }), 2000);
    };
    ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      try {
        const { t, data } = JSON.parse(ev.data as string);
        if (t === 'pong') this.latencyMs = Date.now() - data.ts;
        this.handlers.get(t)?.forEach((h) => h(data));
      } catch {
        /* ignore malformed frame */
      }
    };
    ws.onclose = () => {
      window.clearInterval(this.pingTimer);
      this.setStatus('closed');
      if (this.closedByUser) return;
      const delay = Math.min(3000, 400 * 2 ** this.retry++);
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  close() {
    this.closedByUser = true;
    window.clearTimeout(this.timer);
    window.clearInterval(this.pingTimer);
    this.ws?.close();
  }

  reconnectNow() {
    window.clearTimeout(this.timer);
    this.retry = 0;
    if (this.ws && this.ws.readyState <= 1) this.ws.close();
    else this.connect();
  }

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: Record<string, unknown>): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  on(type: string, h: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(h);
    return () => this.handlers.get(type)?.delete(h);
  }

  onStatus(h: (s: SocketStatus) => void) {
    this.statusHandlers.add(h);
    return () => this.statusHandlers.delete(h);
  }

  private setStatus(s: SocketStatus) {
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }
}
