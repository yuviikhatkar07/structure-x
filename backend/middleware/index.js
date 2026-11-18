import { HttpError } from '../bus.js';

export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const clientId = (req) => String(req.get('x-client-id') || '').slice(0, 64) || undefined;

export function notFound(req, res) {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code || 'error', message: err.message });
  }
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'Payload too large' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'bad_json', message: 'Invalid JSON body' });
  console.error('[api] unhandled error', err);
  res.status(500).json({ error: 'internal', message: err?.message || 'Internal error' });
}
