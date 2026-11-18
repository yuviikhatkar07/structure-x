import { CheckCheck, ShieldAlert, ShieldCheck, ShieldQuestion, TriangleAlert } from 'lucide-react';
import { useRobot } from '../state/RobotContext';
import { api, ApiError } from '../services/api';
import { cn, fmtClock, fmtDate } from '../utils/format';
import { riskTone, toneText } from './ui';

export const RISK_DISCLAIMER = 'Preliminary environmental warning only. MQ-2 responds to a range of combustible gases and smoke and does not identify toxic gases. These sensors cannot certify structural integrity or establish that a site is safe.';

export function RiskPanel({ compact = false }: { compact?: boolean }) {
  const { risk, notify, connections } = useRobot();
  if (!risk) return null;
  const offline = connections?.esp32.status !== 'connected';
  const level = offline ? 'UNKNOWN' : risk.level;
  const tone = riskTone(level);
  const Icon = level === 'SAFE' ? ShieldCheck : level === 'CAUTION' ? TriangleAlert : level === 'DANGER' ? ShieldAlert : ShieldQuestion;
  const ack = async () => {
    if (!risk.eventId) return;
    try { await api.ackRisk(risk.eventId); } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  return (
    <div>
      <div className={cn('flex items-center gap-3 border px-3 py-2.5', tone === 'ok' ? 'border-ok/50 bg-ok/10' : tone === 'warn' ? 'border-warn/50 bg-warn/10' : tone === 'bad' ? 'border-bad/60 bg-bad/10 animate-pulseSoft' : 'border-line bg-panel2')}>
        <Icon size={compact ? 26 : 34} className={toneText(tone)} />
        <div className="min-w-0">
          <div className={cn('font-display font-bold uppercase leading-none tracking-[0.14em]', compact ? 'text-2xl' : 'text-3xl', toneText(tone))}>{level === 'UNKNOWN' ? 'NO DATA' : level}</div>
          <div className="num mt-1 text-[11px] text-mute">{offline ? 'Robot offline' : `Since ${fmtDate(risk.since)} ${fmtClock(risk.since)}`}</div>
        </div>
      </div>
      {!offline && (
        <ul className="mt-2 space-y-1 text-sm">
          {risk.reasons.length === 0 && <li className="text-mute">No configured hazard threshold exceeded.</li>}
          {risk.reasons.map((r) => (
            <li key={r.code} className="flex gap-2"><span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0', r.severity === 'danger' ? 'bg-bad' : r.severity === 'caution' ? 'bg-warn' : 'bg-mute')} /><span>{r.text}</span></li>
          ))}
        </ul>
      )}
      {!offline && risk.level !== 'SAFE' && risk.level !== 'UNKNOWN' && risk.eventId && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={cn('text-[12px]', risk.acknowledged ? 'text-ok' : 'text-warn')}>{risk.acknowledged ? 'Acknowledged' : 'Awaiting acknowledgment'}</span>
          {!risk.acknowledged && <button className="btn !min-h-[44px]" onClick={ack}><CheckCheck size={15} /> Acknowledge</button>}
        </div>
      )}
      {!compact && <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-mute">{RISK_DISCLAIMER}</p>}
    </div>
  );
}
