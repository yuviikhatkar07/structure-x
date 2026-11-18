import { useCallback, useEffect, useState } from 'react';
import { Download, FilePlus, Printer, Trash2 } from 'lucide-react';
import { PageHeader, Panel, Empty, Confirm } from '../components/ui';
import { api, ApiError } from '../services/api';
import { useRobot } from '../state/RobotContext';
import { bytes, fmtDateTime } from '../utils/format';
import type { Mission, ReportRow } from '../types';

export default function ReportsPage() {
  const { notify } = useRobot();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<ReportRow | null>(null);
  const load = useCallback(() => { api.reports().then(setReports).catch(() => {}); api.missions({ limit: 200 }).then((r) => setMissions(r.missions)).catch(() => {}); }, []);
  useEffect(load, [load]);
  const gen = async () => {
    if (!sel) return;
    setBusy(true);
    try { const r = await api.generateReport(Number(sel)); notify('Report generated', 'ok'); load(); window.open(api.reportUrl(r.id, true), '_blank'); } catch (e) { notify((e as ApiError).message, 'error'); } finally { setBusy(false); }
  };
  const remove = async (r: ReportRow) => { try { await api.deleteReport(r.id); load(); } catch (e) { notify((e as ApiError).message, 'error'); } };
  return (
    <div className="space-y-3">
      <PageHeader title="Mission Reports" sub="PDF inspection reports. Sensor-based observations are labelled as preliminary findings." />
      <Panel title="Generate report" icon={<FilePlus size={14} />}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className="input" value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Mission"><option value="">Select a mission…</option>{missions.map((m) => <option key={m.id} value={m.id}>#{m.id} · {m.name} ({m.status})</option>)}</select>
          <button className="btn btn-accent sm:w-52" disabled={!sel || busy} onClick={gen}>{busy ? 'Building PDF…' : 'Generate PDF'}</button>
        </div>
      </Panel>
      <Panel title="Report history" bodyClass="!p-0">
        {!reports.length ? <div className="p-3"><Empty>No reports generated yet.</Empty></div> : (
          <ul className="divide-y divide-line/60">{reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0"><div className="truncate font-medium">{r.mission_name}</div><div className="num text-[12px] text-mute">Mission #{r.mission_id} · {fmtDateTime(r.created_at)} · {bytes(r.size_bytes)} · {r.generated_by || '—'}</div></div>
              <div className="flex gap-1.5">
                <a className="btn !px-3" href={api.reportUrl(r.id)} download><Download size={14} /><span className="hidden sm:inline">Download</span></a>
                <a className="btn !px-3" href={api.reportUrl(r.id, true)} target="_blank" rel="noreferrer"><Printer size={14} /><span className="hidden sm:inline">Print</span></a>
                <button className="btn btn-danger !px-3" onClick={() => setDel(r)} aria-label="Delete report"><Trash2 size={14} /></button>
              </div>
            </li>))}</ul>
        )}
      </Panel>
      <Confirm open={!!del} title="Delete report" text="The PDF file is deleted. The mission itself is not affected." confirmLabel="Delete" onConfirm={() => del && remove(del)} onClose={() => setDel(null)} />
    </div>
  );
}
