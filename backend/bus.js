import { EventEmitter } from 'node:events';

/** Process-wide event bus. Services publish here; the WebSocket layer relays to browsers. */
export const bus = new EventEmitter();
bus.setMaxListeners(50);

/** Small shared mutable state that several services need without circular imports. */
export const live = {
  activeMissionId: null,
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
