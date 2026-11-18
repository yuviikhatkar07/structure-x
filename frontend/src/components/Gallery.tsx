import { useState } from 'react';
import { Download, Trash2, Save } from 'lucide-react';
import { api, ApiError } from '../services/api';
import type { Snapshot } from '../types';
import { useRobot } from '../state/RobotContext';
import { bytes, fmtDateTime } from '../utils/format';
import { Badge, Confirm, Empty, Modal, riskTone } from './ui';

export function Gallery({ items, onChange }: { items: Snapshot[]; onChange: () => void }) {
  const { notify } = useRobot();
  const [sel, setSel] = useState<Snapshot | null>(null);
  const [note, setNote] = useState('');
  const [del, setDel] = useState(false);
  const open = (s: Snapshot) => { setSel(s); setNote(s.note || ''); };
  const saveNote = async () => {
    if (!sel) return;
    try { await api.updateSnapshot(sel.id, { note }); notify('Note saved', 'ok'); onChange(); } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  const remove = async () => {
    if (!sel) return;
    try { await api.deleteSnapshot(sel.id); setSel(null); notify('Snapshot deleted', 'ok'); onChange(); } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  if (!items.length) return <Empty>No inspection photographs yet. Use the Snapshot button on the live camera.</Empty>;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((s) => (
          <button key={s.id} onClick={() => open(s)} className="group relative aspect-[4/3] overflow-hidden border border-line bg-black text-left hover:border-accent">
            <img src={api.snapshotUrl(s.id)} alt={`Snapshot ${s.id}`} loading="lazy" className="h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1 text-[10px] text-white"><span className="num">{fmtDateTime(s.ts)}</span>{s.source === 'demo' && <span className="ml-1 text-accent">DEMO</span>}</span>
          </button>
        ))}
      </div>
      <Modal open={!!sel} onClose={() => setSel(null)} title={sel ? `Snapshot #${sel.id}` : ''} wide>
        {sel && (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
            <img src={api.snapshotUrl(sel.id)} alt="" className="w-full border border-line bg-black object-contain" />
            <div className="space-y-2 text-sm">
              <div className="num text-mute">{fmtDateTime(sel.ts)} · {bytes(sel.size_bytes)}</div>
              <div>Mission: <b>{sel.mission_name || (sel.mission_id ? `#${sel.mission_id}` : 'none')}</b></div>
              <div>Operator: <b>{sel.operator || '—'}</b></div>
              <div className="flex items-center gap-2">Risk at capture: <Badge tone={riskTone(sel.risk_level ?? 'UNKNOWN')}>{sel.risk_level || 'n/a'}</Badge></div>
              {sel.source === 'demo' && <Badge tone="accent">Demo synthetic frame</Badge>}
              <textarea className="input !min-h-[80px] py-2" value={note} maxLength={500} placeholder="Inspection note…" onChange={(e) => setNote(e.target.value)} />
              <div className="grid grid-cols-3 gap-1.5">
                <button className="btn !px-2" onClick={saveNote}><Save size={14} />Save</button>
                <a className="btn !px-2" href={api.snapshotUrl(sel.id, true)} download><Download size={14} />Get</a>
                <button className="btn btn-danger !px-2" onClick={() => setDel(true)}><Trash2 size={14} />Del</button>
              </div>
              <a className="btn w-full" href={api.snapshotUrl(sel.id)} target="_blank" rel="noreferrer">Open full-size</a>
            </div>
          </div>
        )}
      </Modal>
      <Confirm open={del} title="Delete snapshot" text="This permanently deletes the image file and its record. This cannot be undone." confirmLabel="Delete" onConfirm={remove} onClose={() => setDel(false)} />
    </>
  );
}
