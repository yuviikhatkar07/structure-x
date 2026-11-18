import { run } from '../database/index.js';
import { getSettings } from './settings.js';
import { logEvent } from './events.js';

/**
 * Keeps the database small: readings recorded OUTSIDE a mission are purged after `retentionDays`.
 * Mission readings, events, snapshots and reports are kept until the operator deletes them.
 */
export function purgeOldReadings() {
  const { retentionDays } = getSettings().storage;
  const cutoff = Date.now() - retentionDays * 86400000;
  try {
    const r = run('DELETE FROM sensor_readings WHERE mission_id IS NULL AND ts < ?', cutoff);
    if (r.changes > 0)
      logEvent({ type: 'retention', severity: 'info', description: `Retention: removed ${r.changes} idle sensor readings older than ${retentionDays} days`, missionId: null });
  } catch (e) {
    console.error('[retention]', e.message);
  }
}

export function startRetention() {
  purgeOldReadings();
  setInterval(purgeOldReadings, 6 * 3600 * 1000).unref();
}
