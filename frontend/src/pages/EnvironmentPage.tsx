import { PageHeader, Panel, Badge, Dot } from '../components/ui';
import { SensorCards, TelemetryFooter } from '../components/Sensors';
import { DistanceChart, GasChart, MotionChart, TempChart } from '../components/Charts';
import { useRobot } from '../state/RobotContext';
import { Link } from 'react-router-dom';

export default function EnvironmentPage() {
  const { sensors, settings, staleTelemetry } = useRobot();
  const rows: [string, string | undefined, string][] = [
    ['HC-SR04 ultrasonic', sensors?.ultrasonic, 'Distance to nearest obstacle in front'],
    ['MQ-2 gas / smoke', sensors?.mq2, sensors?.mq2 === 'warming' ? `Warming up (${sensors.gasWarmupSec}s left) — readings unreliable` : 'Raw analog value; responds to combustible gas/smoke, not specific gases'],
    ['DHT22 temp / humidity', sensors?.dht22, 'Temperature °C and relative humidity'],
    ['PIR motion', sensors?.pir, 'Detects moving heat sources in its field of view'],
  ];
  const tone = (s?: string) => (s === 'ok' ? 'ok' : s === 'warming' || s === 'partial' || s === 'unknown' ? 'warn' : 'bad');
  return (
    <div className="space-y-3">
      <PageHeader title="Environmental Monitoring" sub="Live readings from the main ESP32 (≈1 Hz)" right={<TelemetryFooter />} />
      <SensorCards />
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Temperature (°C) & humidity (%)"><TempChart height={220} /></Panel>
        <Panel title="MQ-2 raw analog"><GasChart height={220} /></Panel>
        <Panel title="Ultrasonic distance (cm)"><DistanceChart height={200} /></Panel>
        <Panel title="PIR motion events"><MotionChart height={200} /></Panel>
      </div>
      <Panel title="Sensor status" right={<Link to="/settings" className="label hover:text-accent">Thresholds →</Link>}>
        {staleTelemetry && <p className="mb-2 text-sm text-bad">Telemetry is stale — values above are not current.</p>}
        <ul className="divide-y divide-line/60">
          {rows.map(([n, s, d]) => (
            <li key={n} className="flex items-center justify-between gap-3 py-2"><span><span className="block text-sm">{n}</span><span className="block text-[11px] text-mute">{d}</span></span><Badge tone={tone(s)}><Dot tone={tone(s)} />{s ?? 'unknown'}</Badge></li>
          ))}
        </ul>
        {settings && <p className="mt-2 text-[11px] text-mute">Gas warn/critical: {settings.sensors.gasWarning}/{settings.sensors.gasCritical} (raw, uncalibrated) · Temp warn/critical: {settings.sensors.tempWarning}/{settings.sensors.tempCritical} °C · Obstacle: {settings.sensors.obstacleWarningCm}/{settings.sensors.obstacleCriticalCm} cm</p>}
      </Panel>
    </div>
  );
}
