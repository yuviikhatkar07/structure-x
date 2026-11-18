export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const pad = (n: number) => String(n).padStart(2, '0');

export const fmtClock = (ts: number | Date) => {
  const d = ts instanceof Date ? ts : new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
export const fmtDate = (ts: number | Date) => {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const fmtDateTime = (ts: number | null | undefined) => (ts ? `${fmtDate(ts)} ${fmtClock(ts)}` : '—');

export const fmtDuration = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${pad(m)}m ${pad(s % 60)}s` : `${pad(m)}:${pad(s % 60)}`;
};

export const ago = (ts: number | null | undefined, now = Date.now()) => {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 2) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const num = (v: number | null | undefined, digits = 1, unit = '') => (v === null || v === undefined ? '—' : `${v.toFixed(digits)}${unit}`);

export const speedPercent = (v: number) => Math.round((v / 255) * 100);

export const bytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const DIR_LABEL: Record<string, string> = { F: 'Forward', B: 'Backward', L: 'Left', R: 'Right', S: 'Stopped' };
