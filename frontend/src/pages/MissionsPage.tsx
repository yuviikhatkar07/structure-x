import { useCallback, useEffect, useState } from 'react';
import { Play, Plus } from 'lucide-react';
import { PageHeader, Panel, Field, Badge, Empty } from '../components/ui';
import { MissionActivity } from '../components/Feeds';
import { api, ApiError } from '../services/api';
import { useRobot } from '../state/RobotContext';
import { fmtDateTime } from '../utils/format';
import type { Mission, MissionNote } from '../types';

export const statusTone = (s: string) => (s === 'active' ? 'ok' : s === 'paused' ? 'warn' : s === 'aborted' ? 'bad' : s === 'completed' ? 'accent' : 'mute');

export default function MissionsPage() {
  const { settings, mission, notify, refreshMission, eventTick } = useRobot();
  const [form, setForm] = useState({ name: '', location: '', operator: '', description: '', plannedStart: '', startNow: true });
  const [open, setOpen] = useState<Mission[]>([]);
  const [notes, setNotes] = useState<MissionNote[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings) setForm((f) => ({ ...f, operator: f.operator || settings.mission.operatorName, location: f.location || settings.mission.defaultLocation })); }, [settings]);

  const load = useCallback(() => {
    Promise.all([api.missions({ status: 'planned', limit: 50 }), api.missions({ status: 'paused', limit: 50 })]).then(([a, b]) => setOpen([...b.missions, ...a.missions])).catch(() => {});
    if (mission) api.mission(mission.id).then((d) => setNotes(d.missionNotes)).catch(() => {}); else setNotes([]);
  }, [mission]);
  useEffect(load, [load, eventTick]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createMission({ name: form.name.trim(), location: form.location, operator: form.operator, description: form.description, startNow: form.startNow, plannedStart: form.plannedStart ? new Date(form.plannedStart).getTime() : undefined });
      notify(form.startNow ? 'Mission started' : 'Mission planned', 'ok');
      setForm((f) => ({ ...f, name: '', description: '', plannedStart: '' }));
      await refreshMission(); load();
    } catch (er) { notify((er as ApiError).message, 'error'); } finally { setBusy(false); }
  };
  const act = async (id: number, a: 'start' | 'resume') => { try { await api.missionAction(id, a); await refreshMission(); load(); } catch (er) { notify((er as ApiError).message, 'error'); } };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-3">
      <PageHeader title="Inspection Missions" sub="Readings, risk events, photographs, movements and notes attach to the active mission automatically" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="New mission" icon={<Plus size={14} />}>
          <form onSubmit={create} className="space-y-2.5">
            <Field label="Mission name *"><input className="input" required maxLength={120} value={form.name} onChange={set('name')} placeholder="e.g. Block C stairwell survey" /></Field>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="Building / location ID"><input className="input" maxLength={120} value={form.location} onChange={set('location')} /></Field>
              <Field label="Operator"><input className="input" maxLength={80} value={form.operator} onChange={set('operator')} /></Field>
            </div>
            <Field label="Description"><textarea className="input !min-h-[72px] py-2" maxLength={1000} value={form.description} onChange={set('description')} /></Field>
            <Field label="Planned start (optional)"><input type="datetime-local" className="input" value={form.plannedStart} onChange={set('plannedStart')} /></Field>
            <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[rgb(var(--accent))]" checked={form.startNow} onChange={(e) => setForm({ ...form, startNow: e.target.checked })} />Start immediately</label>
            <button className="btn btn-accent w-full" disabled={busy || !form.name.trim()}>{form.startNow ? 'Create & start mission' : 'Create planned mission'}</button>
          </form>
        </Panel>
        <div className="space-y-3">
          <Panel title="Active mission"><MissionActivity /></Panel>
          {mission && (
            <Panel title="Mission notes">
              {!notes.length ? <p className="text-sm text-mute">No notes yet. Add quick notes from the Command Center or above.</p> : <ul className="space-y-2">{notes.map((n) => <li key={n.id} className="border-l-2 border-accent pl-2 text-sm"><span className="num block text-[11px] text-mute">{fmtDateTime(n.ts)} · {n.operator || '—'}</span>{n.text}</li>)}</ul>}
            </Panel>
          )}
        </div>
      </div>
      <Panel title="Planned & paused missions">
        {!open.length ? <Empty>Nothing waiting. Completed and aborted missions are in Inspection History.</Empty> : (
          <ul className="divide-y divide-line/60">{open.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0"><div className="truncate font-medium">{m.name}</div><div className="text-[12px] text-mute">{m.location || '—'} · {m.operator || '—'}{m.planned_start ? ` · planned ${fmtDateTime(m.planned_start)}` : ''}</div></div>
              <div className="flex items-center gap-2"><Badge tone={statusTone(m.status)}>{m.status}</Badge><button className="btn !min-h-[44px]" disabled={!!mission} title={mission ? 'Finish the active mission first' : ''} onClick={() => act(m.id, m.status === 'paused' ? 'resume' : 'start')}><Play size={14} />{m.status === 'paused' ? 'Resume' : 'Start'}</button></div>
            </li>))}</ul>
        )}
      </Panel>
    </div>
  );
}
