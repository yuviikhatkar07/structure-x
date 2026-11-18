import { useCallback, useEffect, useState } from 'react';
import { PageHeader, Panel, Badge, Empty, riskTone } from '../components/ui';
import { RiskPanel, RISK_DISCLAIMER } from '../components/Risk';
import { RiskTrend } from '../components/Charts';
import { api, ApiError } from '../services/api';
import { useRobot } from '../state/RobotContext';
import { fmtDateTime } from '../utils/format';
import type { RiskEventRow } from '../types';

export default function RiskPage() {
  const { risk, notify, settings } = useRobot();
  const [events, setEvents] = useState<RiskEventRow[]>([]);
  const [trend, setTrend] = useState<{ ts: number; score: number | null }[]>([]);
  const [mins, setMins] = useState(60);
  const load = useCallback(() => { api.riskEvents({ limit: 100 }).then(setEvents).catch(() => {}); api.riskTrend(mins).then(setTrend).catch(() => {}); }, [mins]);
  useEffect(load, [load, risk?.level, risk?.acknowledged]);
  const ack = async (id: number) => { try { await api.ackRisk(id); load(); } catch (e) { notify((e as ApiError).message, 'error'); } };
  return (
    <div className="space-y-3">
      <PageHeader title="Risk Assessment" sub="Preliminary environmental warning system" />
      <div className="grid gap-3 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Panel title="Current status"><RiskPanel /></Panel>
        <Panel title="Risk trend" right={<select className="input !min-h-[32px] !w-auto" value={mins} onChange={(e) => setMins(Number(e.target.value))} aria-label="Trend window">{[15, 60, 240, 1440].map((m) => <option key={m} value={m}>{m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}</select>}><RiskTrend data={trend} height={200} /></Panel>
      </div>
      <Panel title="Classification rules">
        <ul className="grid gap-2 text-sm md:grid-cols-3">
          <li><Badge tone="ok">Safe</Badge><p className="mt-1 text-mute">No configured hazard threshold exceeded.</p></li>
          <li><Badge tone="warn">Caution</Badge><p className="mt-1 text-mute">Gas ≥ {settings?.sensors.gasWarning}, temperature ≥ {settings?.sensors.tempWarning} °C, near obstacle ≤ {settings?.sensors.obstacleWarningCm} cm{settings?.sensors.motionRaisesCaution ? ', or motion detected' : ''}.</p></li>
          <li><Badge tone="bad">Danger</Badge><p className="mt-1 text-mute">Gas ≥ {settings?.sensors.gasCritical}, temperature ≥ {settings?.sensors.tempCritical} °C, or multiple warnings at once.</p></li>
        </ul>
        <p className="mt-3 border-t border-line pt-2 text-[11px] text-mute">{RISK_DISCLAIMER}</p>
      </Panel>
      <Panel title="Risk event history">
        {!events.length ? <Empty>No risk level changes recorded yet.</Empty> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="label border-b border-line"><th className="py-1.5">Time</th><th>Level</th><th>Reason</th><th>Mission</th><th>Ack</th></tr></thead>
            <tbody>{events.map((e) => (
              <tr key={e.id} className="border-b border-line/50 align-top">
                <td className="num py-1.5 pr-2 text-[12px]">{fmtDateTime(e.ts)}</td>
                <td className="pr-2"><Badge tone={riskTone(e.level)}>{e.prev_level ? `${e.prev_level} → ` : ''}{e.level}</Badge></td>
                <td className="pr-2 text-[13px]">{e.reasons.map((r) => r.text).join('; ') || 'Thresholds clear'}</td>
                <td className="pr-2 text-[12px]">{e.mission_id ? `#${e.mission_id}` : '—'}</td>
                <td>{e.level === 'SAFE' ? <span className="text-mute">n/a</span> : e.acknowledged ? <span className="text-[12px] text-ok">{e.ack_by || 'ack'}</span> : <button className="btn !min-h-[36px] !px-2" onClick={() => ack(e.id)}>Ack</button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Panel>
    </div>
  );
}
