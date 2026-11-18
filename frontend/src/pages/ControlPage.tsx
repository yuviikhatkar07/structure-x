import { PageHeader, Panel } from '../components/ui';
import { CameraViewer } from '../components/CameraViewer';
import { ControlColumn, FullscreenControls } from '../components/Decks';
import { DPad, DriveStateBadge, EStopButton, FlipperPanel, Joystick } from '../components/Controls';
import { api, ApiError } from '../services/api';
import { useRobot } from '../state/RobotContext';
import { useLayout } from '../hooks/useMedia';
import { cn, DIR_LABEL, speedPercent } from '../utils/format';

/** Phone driving screen: camera fills the viewport, thumbs rest on controls overlaid on the video. */
function MobileDrive() {
  const { settings, robot, controlAvailable, notify } = useRobot();
  const { landscapePhone, width } = useLayout();
  const joy = settings?.dashboard.mobileControl === 'joystick';
  const presets = settings?.robot.speedPresets ?? { low: 120, normal: 170, high: 230 };
  const speed = robot?.speed ?? presets.normal;
  const setSpeed = async (v: number) => { try { await api.speed(v); } catch (e) { notify((e as ApiError).message, 'error'); } };
  const pad = landscapePhone ? 54 : Math.min(68, Math.floor((width - 120) / 3.4));
  return (
    <div className="-mx-3 -mt-3 sm:-mx-4 sm:-mt-4">
      <div className="relative h-[calc(100dvh-132px)] min-h-[240px]">
        <CameraViewer fillHeight className="!h-full" fullscreenOverlay={<FullscreenControls />} />
        <div className="pointer-events-none absolute inset-x-0 top-9 flex justify-center"><span className="pointer-events-auto"><DriveStateBadge /></span></div>
        <div className="absolute bottom-3 left-3 opacity-95">{joy ? <Joystick size={landscapePhone ? 120 : 150} /> : <DPad size={pad} id="mdrive" />}</div>
        <div className={cn('absolute right-2 flex w-[104px] flex-col gap-1.5', landscapePhone ? 'bottom-14' : 'bottom-[68px]')}>
          <div className="num text-right text-[11px] text-white/90">{speedPercent(speed)}% · {robot ? DIR_LABEL[robot.direction] : '—'}</div>
          {([['High', presets.high], ['Norm', presets.normal], ['Low', presets.low]] as const).map(([n, v]) => (
            <button key={n} disabled={!controlAvailable} onClick={() => setSpeed(v)} className={cn('btn !min-h-[40px] !bg-black/70 !px-2', Math.abs(speed - v) < 6 && '!border-accent !text-accent')}>{n}</button>
          ))}
        </div>
      </div>
      <div className="space-y-3 px-3 pt-3">
        <EStopButton variant="big" />
        <Panel title="Flippers" bodyClass="!p-2.5"><FlipperPanel /></Panel>
      </div>
    </div>
  );
}

export default function ControlPage() {
  const { robot, driveState, settings, mission } = useRobot();
  const { mode } = useLayout();
  if (mode === 'mobile') return <MobileDrive />;
  return (
    <div className="space-y-3">
      <PageHeader title="Robot Control" sub="Hold to move · release to stop · movement is operator-driven only" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          <CameraViewer fullscreenOverlay={<FullscreenControls />} />
          <Panel title="Control state">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="label">Commanded</dt><dd className="num">{DIR_LABEL[driveState.intent]}</dd></div>
              <div><dt className="label">Robot reports</dt><dd className="num">{robot?.status ?? '—'}</dd></div>
              <div><dt className="label">Speed (PWM)</dt><dd className="num">{robot?.speed ?? '—'} / {settings?.robot.maxSpeed}</dd></div>
              <div><dt className="label">Mission</dt><dd className="truncate">{mission?.name ?? 'none'}</dd></div>
            </dl>
            <p className="mt-3 border-t border-line pt-2 text-[11px] text-mute">Safety: the browser sends a 200 ms heartbeat while a control is held; the backend stops the robot after 600 ms of silence and the ESP32 firmware has its own independent timeout. Tab hidden, focus lost, disconnect or E-STOP all stop the robot. Fit a physical motor-power cut-off switch.</p>
          </Panel>
        </div>
        <ControlColumn />
      </div>
    </div>
  );
}
