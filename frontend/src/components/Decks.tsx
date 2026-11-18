import { Camera as CamIcon, Gauge, Gamepad2, Keyboard } from 'lucide-react';
import { CameraViewer } from './CameraViewer';
import { DPad, DriveStateBadge, EStopButton, FlipperPanel, Joystick, SpeedControl } from './Controls';
import { Panel } from './ui';
import { useRobot } from '../state/RobotContext';
import { useLayout } from '../hooks/useMedia';
import { cn } from '../utils/format';

/** Overlay shown inside the fullscreen camera so the robot stays drivable (landscape phone use). */
export function FullscreenControls() {
  const { settings } = useRobot();
  const joy = settings?.dashboard.mobileControl === 'joystick';
  return (
    <>
      <div className="absolute bottom-3 left-3 opacity-90">{joy ? <Joystick size={132} /> : <DPad size={56} id="fs" />}</div>
      <div className="absolute left-1/2 top-12 w-40 -translate-x-1/2"><EStopButton variant="big" /></div>
      <div className="absolute bottom-16 right-3 w-36"><FlipperPanel compact /></div>
    </>
  );
}

export function MovementPanel({ big = false }: { big?: boolean }) {
  const { settings } = useRobot();
  const { mode } = useLayout();
  const mobile = mode === 'mobile';
  const joy = mobile && settings?.dashboard.mobileControl === 'joystick';
  return (
    <Panel title="Movement" icon={<Gamepad2 size={14} />} right={<DriveStateBadge />}>
      <div className="space-y-3">
        {joy ? <Joystick size={Math.min(200, window.innerWidth - 80)} /> : <DPad size={mobile ? 76 : big ? 72 : 64} />}
        {mobile && <EStopButton variant="big" />}
        <SpeedControl />
        {!mobile && <p className="flex items-center gap-1.5 text-[11px] text-mute"><Keyboard size={13} /> WASD / arrows drive while held · Space = E-STOP · release = stop</p>}
      </div>
    </Panel>
  );
}

export function ControlColumn({ flippers = true }: { flippers?: boolean }) {
  return (
    <div className="space-y-3">
      <MovementPanel />
      {flippers && <Panel title="Climbing flippers" bodyClass="!p-2.5"><FlipperPanel /></Panel>}
    </div>
  );
}

const SIZES = ['medium', 'large', 'xl'] as const;
export function CameraDeck({ flippers = true, extra }: { flippers?: boolean; extra?: React.ReactNode }) {
  const { settings, saveSettings } = useRobot();
  const size = settings?.dashboard.cameraSize ?? 'large';
  const next = () => saveSettings({ dashboard: { cameraSize: SIZES[(SIZES.indexOf(size) + 1) % 3] } }).catch(() => {});
  const xl = size === 'xl';
  return (
    <div className={cn('grid gap-3', xl ? 'lg:grid-cols-1' : size === 'medium' ? 'lg:grid-cols-[minmax(0,1fr)_330px] xl:grid-cols-[minmax(0,1fr)_340px] 2xl:max-w-[1500px]' : 'lg:grid-cols-[minmax(0,1fr)_330px]')}>
      <div className="min-w-0 space-y-3">
        <Panel title="Live camera" icon={<CamIcon size={14} />} right={<span className="text-[10px] uppercase tracking-wider text-mute">ESP32-CAM · MJPEG</span>} bodyClass="!p-1.5">
          <div className={cn(size === 'medium' && 'lg:mx-auto lg:max-w-[640px]')}>
            <CameraViewer fullscreenOverlay={<FullscreenControls />} onResize={next} sizeLabel={size} />
          </div>
        </Panel>
        {extra}
      </div>
      {xl ? (
        <div className="grid gap-3 lg:grid-cols-2"><MovementPanel big />{flippers && <Panel title="Climbing flippers" icon={<Gauge size={14} />} bodyClass="!p-2.5"><FlipperPanel /></Panel>}</div>
      ) : (
        <ControlColumn flippers={flippers} />
      )}
    </div>
  );
}
