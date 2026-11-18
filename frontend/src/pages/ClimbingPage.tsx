import { PageHeader, Panel, Badge } from '../components/ui';
import { CameraViewer } from '../components/CameraViewer';
import { DPad, FlipperPanel, FlipperRow, SpeedControl } from '../components/Controls';
import { FullscreenControls } from '../components/Decks';
import { useRobot } from '../state/RobotContext';
import { Link } from 'react-router-dom';

function Side({ angles }: { angles: { L: number | null; R: number | null } }) {
  const bar = (a: number | null, y: number, label: string) => (
    <g transform={`translate(60 ${y})`}>
      <rect x="-40" y="-8" width="80" height="16" fill="rgb(var(--surface2))" stroke="rgb(var(--line))" />
      <g transform={`rotate(${a === null ? 0 : -(a - 90)})`} opacity={a === null ? 0.3 : 1}>
        <rect x="0" y="-5" width="70" height="10" fill="rgb(var(--accent))" />
      </g>
      <circle r="6" fill="rgb(var(--text))" />
      <text x="-40" y="-14" fontSize="11" fill="rgb(var(--muted))" fontFamily="Barlow Condensed">{label} {a === null ? '—' : `${a}°`}</text>
    </g>
  );
  return <svg viewBox="0 0 200 150" className="mx-auto h-40 w-full max-w-xs">{bar(angles.L, 40, 'LEFT')}{bar(angles.R, 110, 'RIGHT')}<text x="100" y="146" textAnchor="middle" fontSize="9" fill="rgb(var(--muted))">Logical angles (side view, schematic)</text></svg>;
}

export default function ClimbingPage() {
  const { robot, settings } = useRobot();
  return (
    <div className="space-y-3">
      <PageHeader title="Climbing Mechanism" sub="Independent front flippers for obstacle climbing" right={<Link to="/settings#calibration" className="btn">Calibrate</Link>} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <CameraViewer fullscreenOverlay={<FullscreenControls />} />
          <Panel title="Flipper position"><Side angles={robot?.servos ?? { L: null, R: null }} />
            <div className="mt-2 flex flex-wrap gap-2"><Badge tone={settings?.robot.servoCalibrated ? 'ok' : 'warn'}>{settings?.robot.servoCalibrated ? 'Calibrated' : 'Not calibrated'}</Badge><Badge>Range L {settings?.robot.servo.L.min}–{settings?.robot.servo.L.max}° · R {settings?.robot.servo.R.min}–{settings?.robot.servo.R.max}°</Badge></div>
          </Panel>
        </div>
        <div className="space-y-3">
          <Panel title="Flippers" bodyClass="!p-2.5"><div className="space-y-2"><FlipperPanel compact /><FlipperRow side="L" /><FlipperRow side="R" /></div></Panel>
          <Panel title="Drive"><DPad size={64} /><div className="mt-3"><SpeedControl /></div></Panel>
        </div>
      </div>
    </div>
  );
}
