import { Activity, ListTree, ShieldAlert, Flag, Thermometer, Server } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Panel, StatusLine } from '../components/ui';
import { CameraDeck, MovementPanel } from '../components/Decks';
import { CameraViewer } from '../components/CameraViewer';
import { FlipperPanel } from '../components/Controls';
import { FullscreenControls } from '../components/Decks';
import { SensorCards, TelemetryFooter } from '../components/Sensors';
import { RiskPanel } from '../components/Risk';
import { MissionActivity, RecentEvents } from '../components/Feeds';
import { TempChart } from '../components/Charts';
import { useRobot } from '../state/RobotContext';
import { useLayout } from '../hooks/useMedia';
import { ago } from '../utils/format';

export function ConnectionPanel() {
  const { connections: c, reconnect, latencyMs } = useRobot();
  return (
    <Panel title="Robot connection" icon={<Server size={14} />} right={<button className="btn !min-h-[32px] !px-2 text-[11px]" onClick={() => reconnect('all')}>Reconnect</button>}>
      <StatusLine label="Main ESP32" status={c?.esp32.status} detail={c?.esp32.status === 'connected' ? `${c.esp32.latencyMs ?? '—'} ms · ${ago(c.esp32.lastOk)}` : c?.esp32.lastError ?? undefined} />
      <StatusLine label="ESP32-CAM" status={c?.camera.status} detail={c?.camera.status === 'connected' ? `${c.camera.fps ? c.camera.fps + ' fps · ' : ''}frame ${ago(c.camera.lastFrame)}` : c?.camera.lastError ?? undefined} />
      <StatusLine label="Wi-Fi link" status={c?.wifi.status} />
      <StatusLine label="Database" status={c?.database.status} detail={c?.database.lastSave ? `saved ${ago(c.database.lastSave)}` : undefined} />
      <div className="mt-1 text-[11px] text-mute">Operator ↔ backend latency: {latencyMs ?? '—'} ms</div>
    </Panel>
  );
}

export default function Dashboard() {
  const { mode } = useLayout();
  if (mode === 'mobile') return <MobileDashboard />;
  return (
    <div className="space-y-3">
      <CameraDeck />
      <Panel title="Environmental telemetry" icon={<Thermometer size={14} />} right={<TelemetryFooter />}><SensorCards /></Panel>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Risk assessment" icon={<ShieldAlert size={14} />} right={<Link to="/risk" className="label hover:text-accent">Details →</Link>}><RiskPanel compact /></Panel>
        <Panel title="Mission activity" icon={<Flag size={14} />}><MissionActivity /></Panel>
        <div className="lg:col-span-2 xl:col-span-1"><ConnectionPanel /></div>
        <Panel title="Temperature & humidity" icon={<Activity size={14} />} className="lg:col-span-1 xl:col-span-2"><TempChart /></Panel>
        <Panel title="Recent system events" icon={<ListTree size={14} />} right={<Link to="/events" className="label hover:text-accent">All →</Link>}><RecentEvents limit={7} /></Panel>
      </div>
    </div>
  );
}

function MobileDashboard() {
  return (
    <div className="space-y-3">
      <CameraViewer fullscreenOverlay={<FullscreenControls />} />
      <MovementPanel />
      <Panel title="Flippers" bodyClass="!p-2.5"><FlipperPanel /></Panel>
      <Panel title="Sensors" right={<TelemetryFooter />} bodyClass="!p-2"><SensorCards compact /></Panel>
      <Panel title="Risk"><RiskPanel compact /></Panel>
      <Panel title="Mission"><MissionActivity /></Panel>
      <ConnectionPanel />
      <Panel title="Recent events"><RecentEvents limit={6} /></Panel>
    </div>
  );
}
