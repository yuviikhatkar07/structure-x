import { useCallback, useEffect, useState } from 'react';
import { FileText, Trash2, Save } from 'lucide-react';
import { PageHeader, Panel, Badge, Empty, Modal, Confirm, riskTone } from '../components/ui';
import { Gallery } from '../components/Gallery';
import { EventRow } from '../components/Feeds';
import { SeriesChart } from '../components/Charts';
import { useColors } from '../hooks/useColors';
import { api, ApiError } from '../services/api';
import { useRobot } from '../state/RobotContext';
import { statusTone } from './MissionsPage';
import { fmtDateTime, fmtDuration, num } from '../utils/format';
import type { AppEvent, Mission, MissionDetail, ReadingRow, RiskEventRow, Snapshot } from '../types';

const PAGE = 25;
const dayStart = (s: string) => (s ? new Date(`${s}T00:00:00`).getTime() : undefined);
const dayEnd = (s: string) => (s ? new Date(`${s}T23:59:59.999`).getTime() : undefined);

function MissionDetailView({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { notify } = useRobot();
  const c = useColors();
  const [d, setD] = useState<MissionDetail | null>(null);
  const [tab, setTab] = useState<'overview' | 'sensors' | 'photos' | 'risk' | 'events'>('overview');
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [risk, setRisk] = useState<RiskEventRow[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [notes, setNotes] = useState('');
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.mission(id).then((m) => { setD(m); setNotes(m.notes || ''); }).catch((e: ApiError) => notify(e.message, 'error'));
    api.missionReadings(id).then(setReadings).catch(() => {});
    api.missionSnapshots(id).then(setSnaps).catch(() => {});
    api.missionRisk(id).then(setRisk).catch(() => {});
    api.missionEvents(id).then((r) => setEvents(r.events)).catch(() => {});
  }, [id, notify]);
  useEffect(load, [load]);
  if (!d) return <p className="text-sm text-mute">Loading…</p>;
  const r = d.stats.readings;
  const report = async () => {
    setBusy(true);
    try { const rep = await api.generateReport(id); notify('Report generated', 'ok'); window.open(api.reportUrl(rep.id, true), '_blank'); } catch (e) { notify((e as ApiError).message, 'error'); } finally { setBusy(false); }
  };
  const saveNotes = async () => { try { await api.updateMission(id, { notes }); notify('Inspection notes saved', 'ok'); } catch (e) { notify((e as ApiError).message, 'error'); } };
  const remove = async () => { try { await api.deleteMission(id); notify('Mission deleted', 'ok'); onChanged(); onClose(); } catch (e) { notify((e as ApiError).message, 'error'); } };
  const pts = readings.map((x) => ({ ts: x.ts, temperature: x.temperature, humidity: x.humidity, gas: x.gas }));
  const tabs = ['overview', 'sensors', 'photos', 'risk', 'events'] as const;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><Badge tone={statusTone(d.status)}>{d.status}</Badge> <span className="text-sm text-mute">{d.location || '—'} · {d.operator || '—'}</span></div>
        <div className="flex gap-2"><button className="btn btn-accent" disabled={busy} onClick={report}><FileText size={14} />{busy ? 'Building…' : 'PDF report'}</button><button className="btn btn-danger !px-3" onClick={() => setDel(true)} aria-label="Delete mission"><Trash2 size={14} /></button></div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-line">{tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`btn btn-ghost !min-h-[44px] border-b-2 ${tab === t ? '!border-accent text-accent' : '!border-transparent'}`}>{t}</button>)}</div>
      {tab === 'overview' && (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Started', fmtDateTime(d.started_at)], ['Ended', fmtDateTime(d.ended_at)], ['Duration', d.started_at ? fmtDuration((d.ended_at ?? Date.now()) - d.started_at) : '—'], ['Photos', String(d.stats.snapshots)], ['Commands', String(d.stats.commands)], ['Risk events', `${d.stats.riskEvents} (${d.stats.dangerEvents} danger)`], ['Motion events', String(d.stats.motionEvents)], ['System events', String(d.stats.events)]].map(([k, v]) => <div key={k}><dt className="label">{k}</dt><dd className="num">{v}</dd></div>)}
          </dl>
          <p className="text-mute">{d.description || 'No description.'}</p>
          <div className="border border-line p-2.5"><div className="label mb-1">Sensor summary (preliminary)</div>
            <div className="num grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4 text-[13px]"><span>Temp min/avg/max</span><span className="md:col-span-3">{num(r.temp_min as number, 1)} / {num(r.temp_avg as number, 1)} / {num(r.temp_max as number, 1)} °C</span><span>Gas avg/max</span><span className="md:col-span-3">{num(r.gas_avg as number, 0)} / {num(r.gas_max as number, 0)} raw</span><span>Min distance</span><span className="md:col-span-3">{num(r.dist_min as number, 0)} cm</span></div></div>
          <div><div className="label mb-1">Inspection notes (appear in report)</div><textarea className="input !min-h-[90px] py-2" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} /><button className="btn mt-1.5" onClick={saveNotes}><Save size={14} />Save notes</button></div>
          {d.missionNotes.length > 0 && <ul className="space-y-1.5">{d.missionNotes.map((n) => <li key={n.id} className="border-l-2 border-accent pl-2"><span className="num block text-[11px] text-mute">{fmtDateTime(n.ts)} · {n.operator || '—'}</span>{n.text}</li>)}</ul>}
        </div>
      )}
      {tab === 'sensors' && (pts.length < 2 ? <Empty>No sensor readings stored for this mission.</Empty> : (
        <div className="space-y-3"><div><div className="label">Temperature / humidity</div><SeriesChart data={pts} keys={[{ key: 'temperature', color: c.accent, name: '°C' }, { key: 'humidity', color: c.blue, name: '% RH' }]} /></div><div><div className="label">MQ-2 raw</div><SeriesChart data={pts} keys={[{ key: 'gas', color: c.warn, name: 'raw' }]} /></div></div>
      ))}
      {tab === 'photos' && <Gallery items={snaps} onChange={load} />}
      {tab === 'risk' && (!risk.length ? <Empty>No risk events in this mission.</Empty> : <ul className="space-y-1.5">{risk.map((e) => <li key={e.id} className="flex flex-wrap items-center gap-2 border-b border-line/50 pb-1.5 text-sm"><span className="num text-[12px] text-mute">{fmtDateTime(e.ts)}</span><Badge tone={riskTone(e.level)}>{e.level}</Badge><span>{e.reasons.map((x) => x.text).join('; ') || 'Thresholds clear'}</span></li>)}</ul>)}
      {tab === 'events' && (!events.length ? <Empty>No events.</Empty> : <ul>{events.map((e) => <EventRow key={e.id} e={e} showDate />)}</ul>)}
      <Confirm open={del} title="Delete mission" text="Deletes the mission with its readings, notes, risk events and photographs. This cannot be undone." confirmLabel="Delete mission" onConfirm={remove} onClose={() => setDel(false)} />
    </div>
  );
}

export default function HistoryPage() {
  const { notify, eventTick } = useRobot();
  const [view, setView] = useState<'missions' | 'photos'>('missions');
  const [f, setF] = useState({ search: '', status: '', from: '', to: '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; missions: Mission[] }>({ total: 0, missions: [] });
  const [sel, setSel] = useState<number | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const load = useCallback(() => {
    api.missions({ search: f.search, status: f.status, from: dayStart(f.from), to: dayEnd(f.to), limit: PAGE, offset: page * PAGE }).then(setData).catch((e: ApiError) => notify(e.message, 'error'));
  }, [f, page, notify]);
  const loadSnaps = useCallback(() => { api.snapshots({ limit: 120 }).then((r) => setSnaps(r.snapshots)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load, eventTick]);
  useEffect(() => { if (view === 'photos') loadSnaps(); }, [view, loadSnaps, eventTick]);
  const set = (k: string, v: string) => { setF({ ...f, [k]: v }); setPage(0); };
  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  return (
    <div className="space-y-3">
      <PageHeader title="Inspection History" sub="Search past missions, review sensors, photographs and risk events" right={<div className="flex"><button className={`btn ${view === 'missions' ? '!border-accent !text-accent' : ''}`} onClick={() => setView('missions')}>Missions</button><button className={`btn ${view === 'photos' ? '!border-accent !text-accent' : ''}`} onClick={() => setView('photos')}>All photos</button></div>} />
      {view === 'photos' ? <Panel title="Inspection gallery"><Gallery items={snaps} onChange={loadSnaps} /></Panel> : (
        <>
          <Panel><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input className="input" placeholder="Search name, location, operator…" value={f.search} onChange={(e) => set('search', e.target.value)} aria-label="Search" />
            <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)} aria-label="Status"><option value="">All statuses</option>{['planned', 'active', 'paused', 'completed', 'aborted'].map((s) => <option key={s}>{s}</option>)}</select>
            <input type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
            <input type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
          </div></Panel>
          {!data.missions.length ? <Empty>No missions found.</Empty> : (
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{data.missions.map((m) => (
              <li key={m.id}><button onClick={() => setSel(m.id)} className="block w-full border border-line bg-panel p-3 text-left hover:border-accent">
                <div className="flex items-start justify-between gap-2"><span className="truncate font-display text-lg font-semibold uppercase tracking-wide">{m.name}</span><Badge tone={statusTone(m.status)}>{m.status}</Badge></div>
                <div className="text-[12px] text-mute">#{m.id} · {m.location || '—'} · {m.operator || '—'}</div>
                <div className="num mt-1 text-[12px]">{fmtDateTime(m.started_at ?? m.created_at)}{m.ended_at && m.started_at ? ` · ${fmtDuration(m.ended_at - m.started_at)}` : ''}</div>
                <div className="mt-1 text-[12px] text-mute">{m.snapshot_count ?? 0} photos · {m.risk_event_count ?? 0} risk events</div>
              </button></li>))}</ul>
          )}
          <div className="flex items-center justify-between"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button><span className="num text-sm text-mute">Page {page + 1} / {pages} · {data.total} missions</span><button className="btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
        </>
      )}
      <Modal open={sel !== null} onClose={() => setSel(null)} title={`Mission #${sel ?? ''}`} wide>{sel !== null && <MissionDetailView id={sel} onClose={() => setSel(null)} onChanged={load} />}</Modal>
    </div>
  );
}
