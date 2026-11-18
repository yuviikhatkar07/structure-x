import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, OctagonAlert, RotateCcw, ChevronUp, ChevronDown, Home, ShieldAlert } from 'lucide-react';
import { useRobot } from '../state/RobotContext';
import { api, ApiError } from '../services/api';
import { cn, DIR_LABEL, speedPercent } from '../utils/format';
import type { Dir } from '../types';
import { Badge } from './ui';

/* ---------------------------- E-STOP ---------------------------- */
export function EStopButton({ variant = 'bar' }: { variant?: 'bar' | 'big' }) {
  const { emergencyStop, rearm, robot } = useRobot();
  const latched = !!robot?.estop;
  if (latched)
    return (
      <button onClick={rearm} className={cn('btn btn-accent animate-pulseSoft', variant === 'big' ? 'min-h-[56px] w-full text-lg' : 'min-h-[40px]')}>
        <RotateCcw size={16} /> Re-arm
      </button>
    );
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); emergencyStop(); }}
      onKeyDown={(e) => (e.key === 'Enter') && emergencyStop()}
      aria-label="Emergency stop"
      className={cn('btn btn-danger shadow-glowBad font-bold', variant === 'big' ? 'min-h-[60px] w-full text-xl tracking-[0.2em]' : 'min-h-[40px] px-4')}
    >
      <OctagonAlert size={variant === 'big' ? 24 : 18} /> E-STOP
    </button>
  );
}

/* ---------------------------- Direction pad ---------------------------- */
function HoldButton({ src, dir, disabled, size, children, label }: { src: string; dir: Dir; disabled: boolean; size: number; children: React.ReactNode; label: string }) {
  const { drive, driveState } = useRobot();
  const held = useRef(false);
  const active = driveState.intent === dir;
  const start = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    held.current = true;
    drive.press(src, dir);
  };
  const end = () => {
    if (!held.current) return;
    held.current = false;
    drive.release(src);
  };
  useEffect(() => () => { if (held.current) drive.release(src); }, [drive, src]);
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      style={{ width: size, height: size }}
      className={cn(
        'touch-none-all flex items-center justify-center border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        active ? (driveState.pending ? 'border-warn bg-warn/25 text-warn' : 'border-accent bg-accent text-white shadow-glowAccent') : 'border-line bg-panel2 text-fg active:border-accent active:bg-accent/30',
      )}
    >
      {children}
    </button>
  );
}

export function useDriveDisabled() {
  const { controlAvailable, robot } = useRobot();
  return !controlAvailable || !!robot?.estop;
}

export function DriveStateBadge() {
  const { driveState, robot, controlAvailable } = useRobot();
  if (!controlAvailable) return <Badge tone="bad"><ShieldAlert size={13} /> Control unavailable</Badge>;
  if (robot?.estop) return <Badge tone="bad">E-STOP LATCHED</Badge>;
  if (driveState.intent === 'S') return <Badge tone="mute">Stopped</Badge>;
  if (driveState.pending) return <Badge tone="warn">Sending… {DIR_LABEL[driveState.intent]}</Badge>;
  return <Badge tone="accent">{DIR_LABEL[driveState.intent]} · confirmed</Badge>;
}

export function DPad({ size = 64, id = 'pad' }: { size?: number; id?: string }) {
  const { drive } = useRobot();
  const disabled = useDriveDisabled();
  const gap = Math.max(6, Math.round(size / 10));
  const ic = Math.round(size * 0.45);
  return (
    <div className="mx-auto grid w-max touch-none-all" style={{ gridTemplateColumns: `repeat(3, ${size}px)`, gap }}>
      <span />
      <HoldButton src={`${id}:F`} dir="F" disabled={disabled} size={size} label="Forward"><ArrowUp size={ic} /></HoldButton>
      <span />
      <HoldButton src={`${id}:L`} dir="L" disabled={disabled} size={size} label="Left"><ArrowLeft size={ic} /></HoldButton>
      <button
        aria-label="Stop"
        onPointerDown={(e) => { e.preventDefault(); drive.stopAll(); }}
        style={{ width: size, height: size }}
        className="touch-none-all flex items-center justify-center border-2 border-bad/70 bg-bad/15 font-display text-sm font-bold uppercase tracking-widest text-bad active:bg-bad active:text-white"
      >
        Stop
      </button>
      <HoldButton src={`${id}:R`} dir="R" disabled={disabled} size={size} label="Right"><ArrowRight size={ic} /></HoldButton>
      <span />
      <HoldButton src={`${id}:B`} dir="B" disabled={disabled} size={size} label="Backward"><ArrowDown size={ic} /></HoldButton>
      <span />
    </div>
  );
}

/* ---------------------------- Virtual joystick ---------------------------- */
export function Joystick({ size = 176 }: { size?: number }) {
  const { drive, driveState } = useRobot();
  const disabled = useDriveDisabled();
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const down = useRef(false);
  const base = useRef<HTMLDivElement>(null);
  const R = size / 2;

  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    const max = R * 0.62;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    setKnob({ x: dx, y: dy });
    const m = Math.hypot(dx, dy) / max;
    if (m < 0.4) return drive.release('joy');
    const dir: Dir = Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? 'F' : 'B') : dx < 0 ? 'L' : 'R';
    drive.press('joy', dir);
  };
  const end = () => {
    if (!down.current) return;
    down.current = false;
    setKnob({ x: 0, y: 0 });
    drive.release('joy');
  };
  useEffect(() => { if (disabled) end(); /* eslint-disable-next-line */ }, [disabled]);
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={base}
        className={cn('touch-none-all relative rounded-full border-2 border-line bg-panel2', disabled && 'opacity-35')}
        style={{ width: size, height: size }}
        onPointerDown={(e) => { if (disabled) return; e.preventDefault(); down.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); update(e); }}
        onPointerMove={(e) => down.current && update(e)}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className="absolute left-1/2 top-2 -translate-x-1/2 text-[10px] text-mute">F</span>
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-mute">B</span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-mute">L</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-mute">R</span>
        <div
          className={cn('absolute rounded-full border-2', driveState.intent !== 'S' ? 'border-accent bg-accent/70' : 'border-mute bg-line')}
          style={{ width: size * 0.38, height: size * 0.38, left: R - size * 0.19 + knob.x, top: R - size * 0.19 + knob.y }}
        />
      </div>
      <button className="btn btn-danger !min-h-[48px] w-full" onPointerDown={(e) => { e.preventDefault(); drive.stopAll(); }}>Stop</button>
    </div>
  );
}

/* ---------------------------- Speed ---------------------------- */
export function SpeedControl() {
  const { settings, robot, notify, controlAvailable } = useRobot();
  const min = settings?.robot.minSpeed ?? 100;
  const max = settings?.robot.maxSpeed ?? 255;
  const presets = settings?.robot.speedPresets ?? { low: 120, normal: 170, high: 230 };
  const [val, setVal] = useState(robot?.speed ?? settings?.robot.defaultSpeed ?? 170);
  const editing = useRef(false);
  const timer = useRef<number>();
  useEffect(() => { if (!editing.current && robot?.speed) setVal(robot.speed); }, [robot?.speed]);

  const send = async (v: number) => {
    try { await api.speed(v); } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  const change = (v: number) => {
    setVal(v);
    editing.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { send(v); editing.current = false; }, 150);
  };
  const preset = (v: number) => { const c = Math.min(max, Math.max(min, v)); setVal(c); send(c); };
  const mode = val <= presets.low + 10 ? 'Low-speed inspection' : val >= presets.high - 10 ? 'High speed' : 'Normal';
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label">Speed</span>
        <span className="num text-lg font-medium">{speedPercent(val)}% <span className="text-xs text-mute">PWM {val}</span></span>
      </div>
      <input type="range" min={min} max={max} value={val} disabled={!controlAvailable} onChange={(e) => change(Number(e.target.value))} aria-label="Speed" />
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {([['Low', presets.low], ['Normal', presets.normal], ['High', presets.high]] as const).map(([n, v]) => (
          <button key={n} className={cn('btn !min-h-[44px]', Math.abs(val - v) < 6 && '!border-accent !text-accent')} disabled={!controlAvailable} onClick={() => preset(v)}>{n}</button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-mute">{mode}</p>
    </div>
  );
}

/* ---------------------------- Flippers ---------------------------- */
function FlipperRow({ side }: { side: 'L' | 'R' }) {
  const { settings, robot, notify, controlAvailable } = useRobot();
  const cfg = settings?.robot.servo[side];
  const cur = robot?.servos[side] ?? null;
  const [val, setVal] = useState<number>(cur ?? cfg?.home ?? 90);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current && cur !== null) setVal(cur); }, [cur]);
  if (!cfg) return null;
  const act = async (body: { angle?: number; action?: 'up' | 'down' | 'home' }) => {
    try { await api.servo({ servo: side, ...body }); } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  const commit = () => { editing.current = false; act({ angle: val }); };
  const off = !controlAvailable || !!robot?.estop;
  return (
    <div className="border border-line bg-ink/40 p-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="label">{side === 'L' ? 'Left' : 'Right'} flipper</span>
        <span className="num text-sm">{cur === null ? <span className="text-mute">unknown</span> : `${cur}°`}</span>
      </div>
      <input type="range" min={cfg.min} max={cfg.max} value={val} disabled={off} aria-label={`${side} flipper angle`}
        onChange={(e) => { editing.current = true; setVal(Number(e.target.value)); }} onPointerUp={commit} onKeyUp={commit} onBlur={() => editing.current && commit()} />
      <div className="grid grid-cols-3 gap-1.5">
        <button className="btn !min-h-[48px]" disabled={off} onClick={() => act({ action: 'up' })}><ChevronUp size={16} />Up</button>
        <button className="btn !min-h-[48px]" disabled={off} onClick={() => act({ action: 'down' })}><ChevronDown size={16} />Down</button>
        <button className="btn !min-h-[48px]" disabled={off} onClick={() => act({ action: 'home' })}><Home size={15} />Home</button>
      </div>
    </div>
  );
}

export function FlipperPanel({ compact = false }: { compact?: boolean }) {
  const { settings, robot, notify, controlAvailable } = useRobot();
  const off = !controlAvailable || !!robot?.estop;
  const both = async (action: 'up' | 'down' | 'home') => {
    try { await api.servo({ servo: 'BOTH', action }); } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  const status = !controlAvailable ? 'Unavailable' : robot?.servos.L === null && robot?.servos.R === null ? 'Position unknown' : 'Ready';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-mute">Mechanism</span>
        <Badge tone={status === 'Ready' ? 'ok' : status === 'Unavailable' ? 'bad' : 'warn'}>{status}</Badge>
      </div>
      {!settings?.robot.servoCalibrated && <p className="border border-warn/50 bg-warn/10 px-2 py-1.5 text-[11px] text-warn">Flippers not calibrated. Run the calibration procedure in Settings before climbing.</p>}
      {compact ? null : (<><FlipperRow side="L" /><FlipperRow side="R" /></>)}
      <div className="grid grid-cols-3 gap-1.5">
        <button className="btn !min-h-[48px]" disabled={off} onClick={() => both('up')}>Raise both</button>
        <button className="btn !min-h-[48px]" disabled={off} onClick={() => both('down')}>Lower both</button>
        <button className="btn !min-h-[48px]" disabled={off} onClick={() => both('home')}>Reset</button>
      </div>
    </div>
  );
}
export { FlipperRow };
