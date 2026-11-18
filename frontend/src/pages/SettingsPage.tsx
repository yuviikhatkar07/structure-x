import { useEffect, useState } from 'react';
import { Save, RotateCcw } from 'lucide-react';
import { PageHeader, Panel, Field, Confirm, Badge } from '../components/ui';
import { api, ApiError } from '../services/api';
import { useRobot } from '../state/RobotContext';
import type { ServoCfg, Settings } from '../types';

type Draft = Settings;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function Num({ v, on, min, max, step = 1 }: { v: number; on: (n: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="number" inputMode="decimal" className="input" value={Number.isFinite(v) ? v : ''} min={min} max={max} step={step} onChange={(e) => on(e.target.value === '' ? NaN : Number(e.target.value))} />;
}

function Calibration({ d, setD }: { d: Draft; setD: (d: Draft) => void }) {
  const { notify, controlAvailable } = useRobot();
  const [side, setSide] = useState<'L' | 'R'>('L');
  const [angle, setAngle] = useState(90);
  const cfg = d.robot.servo[side];
  useEffect(() => setAngle(d.robot.servo[side].home), [side]); // eslint-disable-line
  const upd = (patch: Partial<ServoCfg>) => setD({ ...d, robot: { ...d.robot, servo: { ...d.robot.servo, [side]: { ...cfg, ...patch } } } });
  const jog = async (delta: number) => {
    const a = Math.max(0, Math.min(180, angle + delta));
    setAngle(a);
    try { await api.servo({ servo: side, angle: a, calibrate: true }); } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  const mark = (k: 'home' | 'up' | 'down' | 'min' | 'max') => upd({ [k]: angle } as Partial<ServoCfg>);
  return (
    <Panel title="Flipper calibration" icon={<span id="calibration" />}>
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-[13px] text-mute">
        <li>Lift the robot so the tracks and flippers can move freely. Keep fingers clear and keep the physical motor switch within reach.</li>
        <li>Select a flipper. Jog in <b>small steps</b> (±2°) — calibration mode ignores the configured limits and only enforces the 0–180° servo range.</li>
        <li>Find the angle where the flipper is level with the chassis (<b>Home</b>), fully raised (<b>Up</b>) and lowered (<b>Down</b>) without touching the frame or chassis. Press the matching “Set” button at each.</li>
        <li>Set <b>Min / Max</b> a few degrees inside the mechanical stops. If raising moves the flipper the wrong way, tick “Mounted inverted”.</li>
        <li>Repeat for the other flipper, then <b>Save settings</b> and tick “Mark as calibrated”.</li>
      </ol>
      <div className="mb-3 flex gap-2">{(['L', 'R'] as const).map((s) => <button key={s} className={`btn flex-1 ${side === s ? '!border-accent !text-accent' : ''}`} onClick={() => setSide(s)}>{s === 'L' ? 'Left' : 'Right'} flipper</button>)}</div>
      <div className="num mb-2 text-center text-3xl">{angle}°</div>
      <div className="mb-3 grid grid-cols-4 gap-1.5">{[-10, -2, 2, 10].map((x) => <button key={x} className="btn !min-h-[48px]" disabled={!controlAvailable} onClick={() => jog(x)}>{x > 0 ? '+' : ''}{x}°</button>)}</div>
      <div className="grid grid-cols-5 gap-1.5">{(['home', 'up', 'down', 'min', 'max'] as const).map((k) => <button key={k} className="btn !min-h-[48px] flex-col !gap-0 !px-1 text-[11px]" onClick={() => mark(k)}><span>Set {k}</span><span className="num text-mute">{cfg[k]}°</span></button>)}</div>
      <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={cfg.invert} onChange={(e) => upd({ invert: e.target.checked })} />Mounted inverted (mirror direction for this side)</label>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={d.robot.servoCalibrated} onChange={(e) => setD({ ...d, robot: { ...d.robot, servoCalibrated: e.target.checked } })} />Mark both flippers as calibrated</label>
      {!controlAvailable && <p className="text-[12px] text-bad">Robot not connected — jog buttons disabled.</p>}
    </Panel>
  );
}

export default function SettingsPage() {
  const { settings, saveSettings, notify } = useRobot();
  const [d, setD] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [reset, setReset] = useState(false);
  useEffect(() => { if (settings && !dirty) setD(clone(settings)); }, [settings, dirty]);
  useEffect(() => { if (location.hash === '#calibration') setTimeout(() => document.getElementById('calibration')?.scrollIntoView(), 300); }, []);
  if (!d) return null;
  const edit = (fn: (x: Draft) => void) => { const n = clone(d); fn(n); setD(n); setDirty(true); };
  const setDraft = (n: Draft) => { setD(n); setDirty(true); };
  const save = async () => {
    const bad = Object.values({ ...d.robot, ...d.sensors, ...d.network }).some((v) => typeof v === 'number' && !Number.isFinite(v));
    if (bad) return notify('Fix empty or invalid numeric fields first', 'error');
    try { await saveSettings(d); setDirty(false); notify('Settings saved', 'ok'); } catch (e) { notify((e as ApiError).message, 'error'); }
  };
  const doReset = async () => { try { const s = await api.resetSettings(); await saveSettings(s); setDirty(false); notify('Settings reset to defaults', 'ok'); } catch (e) { notify((e as ApiError).message, 'error'); } };
  const n = d.network, r = d.robot, s = d.sensors;
  return (
    <div className="space-y-3 pb-16">
      <PageHeader title="System Settings" sub="All values persist in the database across restarts" right={<div className="flex gap-2"><button className="btn" onClick={() => setReset(true)}><RotateCcw size={14} />Defaults</button><button className="btn btn-accent" disabled={!dirty} onClick={save}><Save size={14} />Save{dirty ? ' *' : ''}</button></div>} />
      <Panel title="Operating mode">
        <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={d.demoMode} onChange={(e) => edit((x) => { x.demoMode = e.target.checked; })} />Demo mode — simulated robot and sensors (no hardware used)</label>
        <p className="text-[12px] text-mute">Demo data is always labelled as simulated. Turn this OFF to talk to the real ESP32 and ESP32-CAM.</p>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Network">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Main ESP32 IP"><input className="input" value={n.esp32Ip} onChange={(e) => edit((x) => { x.network.esp32Ip = e.target.value; x.network.apiBaseUrl = `http://${e.target.value}`; })} /></Field>
            <Field label="Camera IP"><input className="input" value={n.cameraIp} onChange={(e) => edit((x) => { x.network.cameraIp = e.target.value; x.network.cameraStreamUrl = `http://${e.target.value}:81/stream`; x.network.cameraCaptureUrl = `http://${e.target.value}/capture`; })} /></Field>
            <Field label="API base URL"><input className="input" value={n.apiBaseUrl} onChange={(e) => edit((x) => { x.network.apiBaseUrl = e.target.value; })} /></Field>
            <Field label="Camera stream URL"><input className="input" value={n.cameraStreamUrl} onChange={(e) => edit((x) => { x.network.cameraStreamUrl = e.target.value; })} /></Field>
            <Field label="Camera still-capture URL" hint="Used for snapshots (proxy mode)"><input className="input" value={n.cameraCaptureUrl} onChange={(e) => edit((x) => { x.network.cameraCaptureUrl = e.target.value; })} /></Field>
            <Field label="Camera mode" hint="Proxy = via backend (recommended). Direct = browser fetches the ESP32-CAM itself."><select className="input" value={n.cameraMode} onChange={(e) => edit((x) => { x.network.cameraMode = e.target.value as 'proxy' | 'direct'; })}><option value="proxy">Proxy via backend</option><option value="direct">Direct from browser</option></select></Field>
            <Field label="Request timeout (ms)"><Num v={n.timeoutMs} min={300} max={10000} step={100} on={(v) => edit((x) => { x.network.timeoutMs = v; })} /></Field>
            <Field label="Reconnect interval (ms)"><Num v={n.reconnectIntervalMs} min={1000} max={60000} step={500} on={(v) => edit((x) => { x.network.reconnectIntervalMs = v; })} /></Field>
          </div>
          <details className="mt-3 text-sm"><summary className="label cursor-pointer">Endpoint paths</summary>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2">{(['move', 'speed', 'servo', 'data'] as const).map((k) => <Field key={k} label={k}><input className="input num" value={n.endpoints[k]} onChange={(e) => edit((x) => { x.network.endpoints[k] = e.target.value; })} /></Field>)}</div></details>
        </Panel>
        <Panel title="Robot">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Min speed (PWM)"><Num v={r.minSpeed} min={0} max={255} on={(v) => edit((x) => { x.robot.minSpeed = v; })} /></Field>
            <Field label="Max speed (PWM)"><Num v={r.maxSpeed} min={0} max={255} on={(v) => edit((x) => { x.robot.maxSpeed = v; })} /></Field>
            <Field label="Default speed"><Num v={r.defaultSpeed} min={0} max={255} on={(v) => edit((x) => { x.robot.defaultSpeed = v; })} /></Field>
            {(['low', 'normal', 'high'] as const).map((k) => <Field key={k} label={`${k} preset`}><Num v={r.speedPresets[k]} min={0} max={255} on={(v) => edit((x) => { x.robot.speedPresets[k] = v; })} /></Field>)}
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">{(['L', 'R'] as const).map((sd) => (
            <div key={sd} className="border border-line p-2"><div className="label mb-1">{sd === 'L' ? 'Left' : 'Right'} servo limits (°)</div>
              <div className="grid grid-cols-3 gap-1.5">{(['min', 'max', 'home', 'up', 'down'] as const).map((k) => <Field key={k} label={k}><Num v={r.servo[sd][k]} min={0} max={180} on={(v) => edit((x) => { x.robot.servo[sd][k] = v; })} /></Field>)}</div></div>))}</div>
          <p className="mt-2 text-[11px] text-mute">Never assume 0° or 180° is safe for your mounting — use the calibration panel below to find real limits.</p>
        </Panel>
        <Panel title="Sensors & thresholds">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Refresh interval (ms)"><Num v={s.refreshMs} min={500} max={10000} step={100} on={(v) => edit((x) => { x.sensors.refreshMs = v; })} /></Field>
            <Field label="Gas warning (raw)"><Num v={s.gasWarning} on={(v) => edit((x) => { x.sensors.gasWarning = v; })} /></Field>
            <Field label="Gas critical (raw)"><Num v={s.gasCritical} on={(v) => edit((x) => { x.sensors.gasCritical = v; })} /></Field>
            <Field label="Temp warning (°C)"><Num v={s.tempWarning} step={0.5} on={(v) => edit((x) => { x.sensors.tempWarning = v; })} /></Field>
            <Field label="Temp critical (°C)"><Num v={s.tempCritical} step={0.5} on={(v) => edit((x) => { x.sensors.tempCritical = v; })} /></Field>
            <Field label="Obstacle warn (cm)"><Num v={s.obstacleWarningCm} on={(v) => edit((x) => { x.sensors.obstacleWarningCm = v; })} /></Field>
            <Field label="Obstacle critical (cm)"><Num v={s.obstacleCriticalCm} on={(v) => edit((x) => { x.sensors.obstacleCriticalCm = v; })} /></Field>
          </div>
          <label className="mt-2 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={s.motionRaisesCaution} onChange={(e) => edit((x) => { x.sensors.motionRaisesCaution = e.target.checked; })} />PIR motion raises CAUTION</label>
          <p className="text-[11px] text-mute">MQ-2 values are raw ADC counts and depend on warm-up, supply and ambient air. Calibrate thresholds in clean air at your site.</p>
        </Panel>
        <Panel title="Storage & retention">
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Field label="Store every (s), mission"><Num v={d.storage.readingIntervalActiveSec} min={1} on={(v) => edit((x) => { x.storage.readingIntervalActiveSec = v; })} /></Field>
            <Field label="Store every (s), idle"><Num v={d.storage.readingIntervalIdleSec} min={1} on={(v) => edit((x) => { x.storage.readingIntervalIdleSec = v; })} /></Field>
            <Field label="Keep non-mission data (days)"><Num v={d.storage.retentionDays} min={1} on={(v) => edit((x) => { x.storage.retentionDays = v; })} /></Field>
          </div>
          <p className="mt-2 text-[11px] text-mute">Identical readings are not stored repeatedly. Video is never recorded — only snapshots you capture.</p>
        </Panel>
        <Panel title="Dashboard">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Theme"><select className="input" value={d.dashboard.theme} onChange={(e) => edit((x) => { x.dashboard.theme = e.target.value as 'dark' | 'daylight'; })}><option value="dark">Dark (graphite)</option><option value="daylight">Daylight (outdoor)</option></select></Field>
            <Field label="Camera panel size"><select className="input" value={d.dashboard.cameraSize} onChange={(e) => edit((x) => { x.dashboard.cameraSize = e.target.value as 'medium'; })}><option value="medium">Medium</option><option value="large">Large</option><option value="xl">Extra large</option></select></Field>
            <Field label="Mobile drive control"><select className="input" value={d.dashboard.mobileControl} onChange={(e) => edit((x) => { x.dashboard.mobileControl = e.target.value as 'dpad'; })}><option value="dpad">Directional buttons</option><option value="joystick">Virtual joystick</option></select></Field>
            <Field label="Chart window (min)"><Num v={d.dashboard.chartMinutes} min={1} max={120} on={(v) => edit((x) => { x.dashboard.chartMinutes = v; })} /></Field>
          </div>
          <label className="mt-2 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={d.dashboard.showChartGrid} onChange={(e) => edit((x) => { x.dashboard.showChartGrid = e.target.checked; })} />Show chart grid</label>
        </Panel>
        <Panel title="Mission & reports">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Operator name"><input className="input" value={d.mission.operatorName} onChange={(e) => edit((x) => { x.mission.operatorName = e.target.value; })} /></Field>
            <Field label="Default location"><input className="input" value={d.mission.defaultLocation} onChange={(e) => edit((x) => { x.mission.defaultLocation = e.target.value; })} /></Field>
            <Field label="Organization (report header)"><input className="input" value={d.mission.report.organization} onChange={(e) => edit((x) => { x.mission.report.organization = e.target.value; })} /></Field>
            <Field label="Max photos in report"><Num v={d.mission.report.maxPhotos} min={0} max={60} on={(v) => edit((x) => { x.mission.report.maxPhotos = v; })} /></Field>
          </div>
          <label className="mt-2 flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={d.mission.report.includePhotos} onChange={(e) => edit((x) => { x.mission.report.includePhotos = e.target.checked; })} />Include photographs</label>
          <Field label="Report footer note"><input className="input" value={d.mission.report.footerNote} onChange={(e) => edit((x) => { x.mission.report.footerNote = e.target.value; })} /></Field>
        </Panel>
      </div>
      <Calibration d={d} setD={setDraft} />
      {dirty && <div className="fixed inset-x-0 bottom-[64px] z-30 flex items-center justify-between gap-2 border-t border-accent bg-panel px-4 py-2 lg:bottom-0 lg:left-[212px]"><Badge tone="warn">Unsaved changes</Badge><div className="flex gap-2"><button className="btn" onClick={() => { setDirty(false); setD(clone(settings!)); }}>Discard</button><button className="btn btn-accent" onClick={save}>Save settings</button></div></div>}
      <Confirm open={reset} title="Reset settings" text="Restore every setting (network, thresholds, calibration) to factory defaults?" confirmLabel="Reset" onConfirm={doReset} onClose={() => setReset(false)} />
    </div>
  );
}
