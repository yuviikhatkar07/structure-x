import { Flame, Move, Radar, Thermometer, Droplets } from 'lucide-react';
import { useRobot } from '../state/RobotContext';
import { cn, num } from '../utils/format';
import { Badge, Dot, toneText } from './ui';

function Card({ icon, label, children, tone = 'mute', status, compact }: { icon: React.ReactNode; label: string; children: React.ReactNode; tone?: string; status: string; compact?: boolean }) {
  return (
    <div className={cn('relative border border-line bg-panel', compact ? 'p-2.5' : 'p-3')}>
      <div className="flex items-center justify-between gap-1">
        <span className="label flex items-center gap-1.5">{icon}{label}</span>
        <span className={cn('flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider', toneText(tone))}><Dot tone={tone} />{status}</span>
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const NoData = ({ why }: { why: string }) => <div><div className="num text-2xl text-mute">NO DATA</div><div className="text-[11px] text-bad">{why}</div></div>;

export function SensorCards({ compact = false }: { compact?: boolean }) {
  const { reading: r, sensors: s, settings, staleTelemetry, connections } = useRobot();
  const th = settings?.sensors;
  const offline = connections?.esp32.status !== 'connected' || staleTelemetry || !r;
  if (offline)
    return (
      <div className="border border-bad/50 bg-bad/10 p-3 text-sm">
        <span className="font-semibold text-bad">Sensor data unavailable.</span> <span className="text-mute">{connections?.esp32.lastError || 'Main ESP32 is not reporting.'} Readings are not shown as zero.</span>
      </div>
    );
  const d = r.distance;
  const dTone = d === null ? 'bad' : th && d <= th.obstacleCriticalCm ? 'bad' : th && d <= th.obstacleWarningCm ? 'warn' : 'ok';
  const gTone = r.gas === null ? 'bad' : s?.mq2 === 'warming' ? 'warn' : th && r.gas >= th.gasCritical ? 'bad' : th && r.gas >= th.gasWarning ? 'warn' : 'ok';
  const tTone = r.temperature === null ? 'bad' : th && r.temperature >= th.tempCritical ? 'bad' : th && r.temperature >= th.tempWarning ? 'warn' : 'ok';
  const gasPct = r.gas === null || !th ? 0 : Math.min(100, (r.gas / Math.max(th.gasCritical * 1.25, 1)) * 100);
  const dPct = d === null ? 0 : Math.max(0, Math.min(100, 100 - (d / 200) * 100));
  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 xl:grid-cols-4')}>
      <Card compact={compact} icon={<Radar size={13} />} label="Distance" tone={dTone} status={d === null ? 'invalid' : dTone === 'ok' ? 'clear' : dTone === 'warn' ? 'obstacle' : 'very close'}>
        {d === null ? <NoData why="Echo timeout / out of range" /> : (<><div className="num text-2xl">{d.toFixed(0)}<span className="text-sm text-mute"> cm</span></div>
          <div className="mt-1.5 h-1.5 bg-line"><div className={cn('h-full transition-all', dTone === 'ok' ? 'bg-ok' : dTone === 'warn' ? 'bg-warn' : 'bg-bad')} style={{ width: `${dPct}%` }} /></div></>)}
      </Card>
      <Card compact={compact} icon={<Flame size={13} />} label="MQ-2 gas / smoke" tone={gTone} status={r.gas === null ? 'invalid' : s?.mq2 === 'warming' ? `warm-up ${s.gasWarmupSec}s` : gTone === 'ok' ? 'normal' : gTone === 'warn' ? 'elevated' : 'critical'}>
        {r.gas === null ? <NoData why="No analog reading" /> : (<><div className="num text-2xl">{r.gas}<span className="text-sm text-mute"> raw</span></div>
          <div className="relative mt-1.5 h-1.5 bg-line"><div className={cn('h-full', gTone === 'ok' ? 'bg-ok' : gTone === 'warn' ? 'bg-warn' : 'bg-bad')} style={{ width: `${gasPct}%` }} /></div>
          {!compact && <div className="mt-1 text-[10px] text-mute">warn ≥ {th?.gasWarning} · critical ≥ {th?.gasCritical} · uncalibrated, non-specific</div>}</>)}
      </Card>
      <Card compact={compact} icon={<Thermometer size={13} />} label="Temperature" tone={tTone} status={r.temperature === null ? 'invalid' : tTone === 'ok' ? 'normal' : tTone === 'warn' ? 'elevated' : 'critical'}>
        {r.temperature === null ? <NoData why="DHT22 read failed" /> : (<><div className="num text-2xl">{r.temperature.toFixed(1)}<span className="text-sm text-mute"> °C</span></div>
          <div className="mt-1 flex items-center gap-1 text-[12px] text-mute"><Droplets size={12} /> {s?.humidityReported === false ? 'humidity not reported' : r.humidity === null ? 'humidity —' : `${r.humidity.toFixed(0)} % RH`}</div></>)}
      </Card>
      <Card compact={compact} icon={<Move size={13} />} label="PIR motion" tone={r.motion ? 'warn' : 'ok'} status={r.motion === null ? 'unknown' : r.motion ? 'detected' : 'none'}>
        <div className="num text-2xl">{r.motion === null ? <span className="text-mute">NO DATA</span> : r.motion ? <span className="text-warn">MOTION</span> : <span>CLEAR</span>}</div>
        <div className="mt-1 text-[11px] text-mute">{r.motion ? 'Possible movement in front of sensor' : 'No movement detected'}</div>
      </Card>
    </div>
  );
}

export function TelemetryFooter() {
  const { reading: r } = useRobot();
  if (!r) return null;
  return <div className="num flex flex-wrap gap-x-4 text-[11px] text-mute"><span>Speed {num(r.speed, 0)}</span><span>Uptime {r.uptime ? `${Math.round(r.uptime)}s` : '—'}</span>{r.simulated && <Badge tone="accent">SIMULATED DATA</Badge>}</div>;
}
