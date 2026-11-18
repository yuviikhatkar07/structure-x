import type { AppEvent, Mission, MissionDetail, MissionNote, ReadingRow, ReportRow, RiskEventRow, Settings, Snapshot } from '../types';

/** Stable per-tab id so the backend can tell operator devices apart (drive lease). */
export const CLIENT_ID: string = (() => {
  try {
    let id = sessionStorage.getItem('stx-client');
    if (!id) {
      id = `c-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
      sessionStorage.setItem('stx-client', id);
    }
    return id;
  } catch {
    return `c-${Math.random().toString(36).slice(2, 12)}`;
  }
})();

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Opts = { method?: string; body?: unknown; keepalive?: boolean; raw?: BodyInit; headers?: Record<string, string>; timeoutMs?: number };

async function request<T>(path: string, o: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-client-id': CLIENT_ID, ...(o.headers || {}) };
  let body: BodyInit | undefined;
  if (o.raw !== undefined) body = o.raw;
  else if (o.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(o.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: o.method || 'GET',
      headers,
      body,
      keepalive: o.keepalive,
      signal: AbortSignal.timeout(o.timeoutMs ?? 15000),
    });
  } catch (e) {
    const err = e as Error;
    throw new ApiError(0, 'network', err.name === 'TimeoutError' ? 'Request timed out' : 'Cannot reach the STRUCTURE X backend');
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const j = (json || {}) as { error?: string; message?: string };
    throw new ApiError(res.status, j.error || 'error', j.message || `Request failed (${res.status})`);
  }
  return json as T;
}

const qs = (p: Record<string, string | number | undefined | null | boolean>) => {
  const u = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && v !== false && u.set(k, String(v === true ? 1 : v)));
  const s = u.toString();
  return s ? `?${s}` : '';
};

export const api = {
  /* control */
  move: (dir: string) => request('/control/move', { method: 'POST', body: { dir }, timeoutMs: 3000 }),
  stop: () => request('/control/stop', { method: 'POST', body: {}, keepalive: true, timeoutMs: 4000 }),
  estop: () => request('/control/estop', { method: 'POST', body: {}, keepalive: true, timeoutMs: 4000 }),
  rearm: () => request('/control/rearm', { method: 'POST', body: {} }),
  speed: (value: number) => request<{ speed: number }>('/control/speed', { method: 'POST', body: { value }, timeoutMs: 4000 }),
  servo: (body: { servo: 'L' | 'R' | 'BOTH'; angle?: number; action?: 'up' | 'down' | 'home'; calibrate?: boolean }) =>
    request<{ applied: Record<string, { logical: number; device: number }> }>('/control/servo', { method: 'POST', body, timeoutMs: 5000 }),

  /* system */
  reconnect: (target: 'esp32' | 'camera' | 'all' = 'all') => request('/connections/reconnect', { method: 'POST', body: { target }, timeoutMs: 10000 }),
  getSettings: () => request<Settings>('/settings'),
  saveSettings: (patch: unknown) => request<Settings>('/settings', { method: 'PUT', body: patch }),
  resetSettings: () => request<Settings>('/settings/reset', { method: 'POST', body: {} }),

  /* telemetry / risk */
  history: (p: { minutes?: number; mission?: number }) => request<ReadingRow[]>(`/telemetry/history${qs({ minutes: p.minutes, missionId: p.mission })}`),
  riskEvents: (p: { missionId?: number; limit?: number } = {}) => request<RiskEventRow[]>(`/risk/events${qs(p)}`),
  riskTrend: (minutes: number) => request<{ ts: number; level: string; score: number | null }[]>(`/risk/trend${qs({ minutes })}`),
  ackRisk: (id: number) => request<RiskEventRow>(`/risk/events/${id}/ack`, { method: 'POST', body: {} }),

  /* events */
  events: (p: { search?: string; severity?: string; type?: string; mission?: number; from?: number; to?: number; limit?: number; offset?: number }) =>
    request<{ total: number; events: AppEvent[] }>(`/events${qs(p)}`),
  eventTypes: () => request<string[]>('/events/types'),

  /* missions */
  missions: (p: { search?: string; status?: string; from?: number; to?: number; limit?: number; offset?: number } = {}) =>
    request<{ total: number; missions: Mission[] }>(`/missions${qs(p)}`),
  mission: (id: number) => request<MissionDetail>(`/missions/${id}`),
  createMission: (body: Partial<Mission> & { startNow?: boolean; plannedStart?: number }) => request<Mission>('/missions', { method: 'POST', body }),
  updateMission: (id: number, body: Partial<Mission>) => request<Mission>(`/missions/${id}`, { method: 'PATCH', body }),
  deleteMission: (id: number) => request(`/missions/${id}`, { method: 'DELETE' }),
  missionAction: (id: number, action: 'start' | 'pause' | 'resume' | 'complete' | 'abort') => request<Mission>(`/missions/${id}/${action}`, { method: 'POST', body: {} }),
  addNote: (id: number, text: string) => request<MissionNote>(`/missions/${id}/notes`, { method: 'POST', body: { text } }),
  missionReadings: (id: number) => request<ReadingRow[]>(`/missions/${id}/readings`),
  missionEvents: (id: number) => request<{ total: number; events: AppEvent[] }>(`/missions/${id}/events?limit=300`),
  missionRisk: (id: number) => request<RiskEventRow[]>(`/missions/${id}/risk`),
  missionSnapshots: (id: number) => request<Snapshot[]>(`/missions/${id}/snapshots`),
  generateReport: (id: number) => request<ReportRow>(`/missions/${id}/report`, { method: 'POST', body: {}, timeoutMs: 60000 }),

  /* snapshots */
  snapshots: (p: { mission?: number; limit?: number; offset?: number; unassigned?: boolean } = {}) => request<{ total: number; snapshots: Snapshot[] }>(`/snapshots${qs(p)}`),
  capture: (note?: string) => request<Snapshot>('/snapshots/capture', { method: 'POST', body: { note }, timeoutMs: 15000 }),
  uploadDemoSnapshot: (blob: Blob, note: string) =>
    request<Snapshot>('/snapshots/upload', { method: 'POST', raw: blob, headers: { 'content-type': 'image/jpeg', 'x-note': encodeURIComponent(note) } }),
  updateSnapshot: (id: number, body: { note?: string; missionId?: number | null }) => request<Snapshot>(`/snapshots/${id}`, { method: 'PATCH', body }),
  deleteSnapshot: (id: number) => request(`/snapshots/${id}`, { method: 'DELETE' }),
  snapshotUrl: (id: number, download = false) => `/api/snapshots/${id}/image${download ? '?download=1' : ''}`,

  /* reports */
  reports: () => request<ReportRow[]>('/reports'),
  reportUrl: (id: number, inline = false) => `/api/reports/${id}/download${inline ? '?inline=1' : ''}`,
  deleteReport: (id: number) => request(`/reports/${id}`, { method: 'DELETE' }),
};
