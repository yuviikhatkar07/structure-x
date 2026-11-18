import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader, Panel, Empty, Badge } from '../components/ui';
import { sevTone } from '../components/Feeds';
import { api, ApiError } from '../services/api';
import { useRobot } from '../state/RobotContext';
import { fmtDateTime } from '../utils/format';
import type { AppEvent } from '../types';

const PAGE = 50;
const dayStart = (s: string) => (s ? new Date(`${s}T00:00:00`).getTime() : undefined);
const dayEnd = (s: string) => (s ? new Date(`${s}T23:59:59.999`).getTime() : undefined);

export default function EventsPage() {
  const { notify, eventTick } = useRobot();
  const [f, setF] = useState({ search: '', severity: '', type: '', from: '', to: '' });
  const [types, setTypes] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ total: number; events: AppEvent[] }>({ total: 0, events: [] });
  const [live, setLive] = useState(true);
  const q = { search: f.search, severity: f.severity, type: f.type, from: dayStart(f.from), to: dayEnd(f.to) };
  const load = useCallback(() => { api.events({ ...q, limit: PAGE, offset: page * PAGE }).then(setData).catch((e: ApiError) => notify(e.message, 'error')); }, [f, page]); // eslint-disable-line
  useEffect(() => { api.eventTypes().then(setTypes).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (live && page === 0) load(); }, [eventTick]); // eslint-disable-line
  const csv = async () => {
    try {
      const r = await api.events({ ...q, limit: 5000 });
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const body = ['time,severity,type,mission,operator,description', ...r.events.map((e) => [new Date(e.ts).toISOString(), e.severity, e.type, e.mission_id, e.operator, e.description].map(esc).join(','))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv' }));
      a.download = `structure-x-events-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  const set = (k: string, v: string) => { setF({ ...f, [k]: v }); setPage(0); };
  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  return (
    <div className="space-y-3">
      <PageHeader title="Event Logs" sub="Persistent system and operator event history" right={<button className="btn" onClick={csv}><Download size={14} />Export CSV</button>} />
      <Panel>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <input className="input lg:col-span-2" placeholder="Search descriptions…" value={f.search} onChange={(e) => set('search', e.target.value)} aria-label="Search" />
          <select className="input" value={f.severity} onChange={(e) => set('severity', e.target.value)} aria-label="Severity"><option value="">All severities</option>{['info', 'warning', 'error', 'critical'].map((s) => <option key={s}>{s}</option>)}</select>
          <select className="input" value={f.type} onChange={(e) => set('type', e.target.value)} aria-label="Type"><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
          <div className="flex gap-2"><input type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="From" /><input type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="To" /></div>
        </div>
      </Panel>
      <Panel title={`${data.total} events`} right={<label className="flex items-center gap-1.5 text-[12px] text-mute"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />Live</label>} bodyClass="!p-0">
        {!data.events.length ? <div className="p-3"><Empty>No events match.</Empty></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
            <thead><tr className="label border-b border-line"><th className="px-3 py-2">Time</th><th>Severity</th><th>Type</th><th>Description</th><th className="pr-3">Mission</th></tr></thead>
            <tbody>{data.events.map((e) => (
              <tr key={e.id} className="border-b border-line/50 align-top">
                <td className="num whitespace-nowrap px-3 py-1.5 text-[12px]">{fmtDateTime(e.ts)}</td>
                <td className="pr-2"><Badge tone={sevTone(e.severity)}>{e.severity}</Badge></td>
                <td className="num pr-2 text-[12px] text-mute">{e.type}</td>
                <td className="pr-2 text-[13px]">{e.description}</td>
                <td className="pr-3 text-[12px]">{e.mission_id ? `#${e.mission_id}` : '—'}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Panel>
      <div className="flex items-center justify-between"><button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button><span className="num text-sm text-mute">Page {page + 1} / {pages}</span><button className="btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
    </div>
  );
}
