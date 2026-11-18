import { useState } from 'react';
import { Pause, Play, Square, StickyNote, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useRobot } from '../state/RobotContext';
import { api, ApiError } from '../services/api';
import { useNow } from '../hooks/useMedia';
import { cn, fmtClock, fmtDuration } from '../utils/format';
import { Badge, Dot } from './ui';
import type { AppEvent } from '../types';

export const sevTone = (s: string) => (s === 'critical' || s === 'error' ? 'bad' : s === 'warning' ? 'warn' : 'mute');

export function EventRow({ e, showDate }: { e: AppEvent; showDate?: boolean }) {
  return (
    <li className="flex items-start gap-2 border-b border-line/60 py-1.5 last:border-0">
      <Dot tone={sevTone(e.severity)} />
      <span className="num mt-px w-[58px] shrink-0 text-[11px] text-mute">{showDate ? new Date(e.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' : ''}{fmtClock(e.ts)}</span>
      <span className="min-w-0 flex-1 break-words text-[13px] leading-snug">{e.description}</span>
    </li>
  );
}

export function RecentEvents({ limit = 8 }: { limit?: number }) {
  const { events } = useRobot();
  if (!events.length) return <p className="py-4 text-center text-sm text-mute">No events yet.</p>;
  return <ul>{events.slice(0, limit).map((e) => <EventRow key={e.id} e={e} />)}</ul>;
}

export function MissionActivity() {
  const { mission, pausedMissions, notify, refreshMission } = useRobot();
  const now = useNow(1000);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (a: 'pause' | 'complete' | 'abort' | 'resume', id: number) => {
    setBusy(true);
    try { await api.missionAction(id, a); await refreshMission(); } catch (e) { notify((e as ApiError).message, 'error'); } finally { setBusy(false); }
  };
  const addNote = async () => {
    if (!mission || !note.trim()) return;
    try { await api.addNote(mission.id, note.trim()); setNote(''); notify('Note added', 'ok'); } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  if (!mission)
    return (
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-mute"><Flag size={15} /> No active mission. Readings, photos and events are still logged but not attached to a mission.</div>
        {pausedMissions.map((m) => <div key={m.id} className="flex items-center justify-between border border-line p-2"><span className="truncate">{m.name} <Badge tone="warn">paused</Badge></span><button className="btn !min-h-[44px]" onClick={() => act('resume', m.id)}><Play size={14} />Resume</button></div>)}
        <Link to="/missions" className="btn btn-accent w-full">Start a mission</Link>
      </div>
    );
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><div className="truncate font-display text-lg font-semibold uppercase tracking-wide">{mission.name}</div><div className="truncate text-[12px] text-mute">{mission.location || 'No location'} · {mission.operator || '—'}</div></div>
        <Badge tone="ok"><Dot tone="ok" pulse />Active</Badge>
      </div>
      <div className="num text-2xl text-accent">{fmtDuration(now - (mission.started_at ?? now))}</div>
      <div className="grid grid-cols-3 gap-1.5">
        <button className="btn !min-h-[44px]" disabled={busy} onClick={() => act('pause', mission.id)}><Pause size={14} />Pause</button>
        <button className="btn !min-h-[44px]" disabled={busy} onClick={() => act('complete', mission.id)}><Square size={14} />End</button>
        <Link to="/missions" className="btn !min-h-[44px]">Details</Link>
      </div>
      <div className="flex gap-1.5">
        <input className="input" placeholder="Quick inspection note…" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} />
        <button className={cn('btn !px-3')} onClick={addNote} disabled={!note.trim()} aria-label="Add note"><StickyNote size={16} /></button>
      </div>
    </div>
  );
}
