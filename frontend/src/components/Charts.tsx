import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useRobot, type HistoryPoint } from '../state/RobotContext';
import { useColors } from '../hooks/useColors';
import { fmtClock } from '../utils/format';

type Pt = Record<string, number | null>;
const tick = (t: number) => fmtClock(t).slice(0, 5);

export function SeriesChart({ data, keys, height = 180, refs = [], domain }: { data: Pt[]; keys: { key: string; color: string; name: string }[]; height?: number; refs?: { y: number; color: string; label: string }[]; domain?: [number | 'auto', number | 'auto'] }) {
  const c = useColors();
  const { settings } = useRobot();
  if (data.length < 2) return <div className="flex items-center justify-center text-sm text-mute" style={{ height }}>Collecting data…</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
        {settings?.dashboard.showChartGrid !== false && <CartesianGrid stroke={c.grid} strokeDasharray="3 3" />}
        <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} tickFormatter={tick} stroke={c.text} fontSize={10} minTickGap={40} />
        <YAxis stroke={c.text} fontSize={10} domain={domain ?? ['auto', 'auto']} width={44} />
        <Tooltip contentStyle={{ background: c.panel, border: `1px solid ${c.grid}`, fontSize: 12 }} labelFormatter={(t) => fmtClock(Number(t))} />
        {refs.map((r) => <ReferenceLine key={r.label} y={r.y} stroke={r.color} strokeDasharray="4 3" />)}
        {keys.map((k) => <Line key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={k.color} dot={false} strokeWidth={2} isAnimationActive={false} connectNulls={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function useWindowed(history: HistoryPoint[]) {
  const { settings } = useRobot();
  const mins = settings?.dashboard.chartMinutes ?? 10;
  const cut = Date.now() - mins * 60000;
  return history.filter((h) => h.ts >= cut) as unknown as Pt[];
}

export function TempChart({ height = 180 }: { height?: number }) {
  const { history, settings } = useRobot();
  const c = useColors();
  const data = useWindowed(history);
  const s = settings?.sensors;
  return <SeriesChart data={data} height={height} keys={[{ key: 'temperature', color: c.accent, name: 'Temp °C' }, { key: 'humidity', color: c.blue, name: 'Humidity %' }]} refs={s ? [{ y: s.tempWarning, color: c.warn, label: 'w' }, { y: s.tempCritical, color: c.bad, label: 'c' }] : []} />;
}
export function GasChart({ height = 180 }: { height?: number }) {
  const { history, settings } = useRobot();
  const c = useColors();
  const data = useWindowed(history);
  const s = settings?.sensors;
  return <SeriesChart data={data} height={height} keys={[{ key: 'gas', color: c.warn, name: 'MQ-2 raw' }]} refs={s ? [{ y: s.gasWarning, color: c.warn, label: 'w' }, { y: s.gasCritical, color: c.bad, label: 'c' }] : []} />;
}
export function DistanceChart({ height = 180 }: { height?: number }) {
  const { history } = useRobot();
  const c = useColors();
  return <SeriesChart data={useWindowed(history)} height={height} keys={[{ key: 'distance', color: c.blue, name: 'Distance cm' }]} />;
}
export function MotionChart({ height = 110 }: { height?: number }) {
  const { history } = useRobot();
  const c = useColors();
  const data = useWindowed(history);
  if (data.length < 2) return <div className="flex items-center justify-center text-sm text-mute" style={{ height }}>Collecting data…</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} tickFormatter={tick} stroke={c.text} fontSize={10} minTickGap={40} />
        <YAxis stroke={c.text} fontSize={10} ticks={[0, 1]} domain={[0, 1]} width={44} />
        <Area type="stepAfter" dataKey="motion" name="PIR" stroke={c.warn} fill={c.warn} fillOpacity={0.25} isAnimationActive={false} />
        <Tooltip contentStyle={{ background: c.panel, border: `1px solid ${c.grid}`, fontSize: 12 }} labelFormatter={(t) => fmtClock(Number(t))} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RiskTrend({ data, height = 120 }: { data: { ts: number; score: number | null }[]; height?: number }) {
  const c = useColors();
  if (data.length < 2) return <div className="flex items-center justify-center text-sm text-mute" style={{ height }}>No risk history yet</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
        <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} tickFormatter={tick} stroke={c.text} fontSize={10} minTickGap={40} />
        <YAxis stroke={c.text} fontSize={10} ticks={[0, 1, 2]} tickFormatter={(v) => ['SAFE', 'CAUT', 'DANG'][v]} domain={[0, 2]} width={44} />
        <Area type="stepAfter" dataKey="score" name="Risk" stroke={c.bad} fill={c.bad} fillOpacity={0.2} isAnimationActive={false} />
        <Tooltip contentStyle={{ background: c.panel, border: `1px solid ${c.grid}`, fontSize: 12 }} labelFormatter={(t) => fmtClock(Number(t))} formatter={(v: number) => ['SAFE', 'CAUTION', 'DANGER'][v]} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
