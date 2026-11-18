import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppEvent, Connections, FullState, Mission, Reading, RiskState, RobotState, SensorStatus, Settings } from '../types';
import { api, ApiError } from '../services/api';
import { RobotSocket, type SocketStatus } from '../services/socket';
import { DriveController, type DriveSnapshot } from '../services/drive';

export interface HistoryPoint {
  ts: number;
  temperature: number | null;
  humidity: number | null;
  gas: number | null;
  distance: number | null;
  motion: number;
}
export interface Toast {
  id: number;
  kind: 'info' | 'ok' | 'warn' | 'error';
  text: string;
}

interface Ctx {
  socketStatus: SocketStatus;
  ready: boolean;
  backendOnline: boolean;
  settings: Settings | null;
  connections: Connections | null;
  robot: RobotState | null;
  reading: Reading | null;
  sensors: SensorStatus | null;
  risk: RiskState | null;
  mission: Mission | null;
  pausedMissions: { id: number; name: string }[];
  demo: boolean;
  events: AppEvent[];
  eventTick: number;
  history: HistoryPoint[];
  staleTelemetry: boolean;
  latencyMs: number | null;
  controlAvailable: boolean;
  drive: DriveController;
  driveState: DriveSnapshot;
  toasts: Toast[];
  notify: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  saveSettings: (patch: unknown) => Promise<Settings>;
  emergencyStop: () => Promise<void>;
  rearm: () => Promise<void>;
  reconnect: (target?: 'esp32' | 'camera' | 'all') => Promise<void>;
  refreshMission: () => Promise<void>;
}

const RobotCtx = createContext<Ctx | null>(null);
export const useRobot = () => {
  const c = useContext(RobotCtx);
  if (!c) throw new Error('useRobot must be used inside <RobotProvider>');
  return c;
};

const HISTORY_MAX = 900;

export function RobotProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<RobotSocket>();
  if (!socketRef.current) socketRef.current = new RobotSocket();
  const socket = socketRef.current;

  const [socketStatus, setSocketStatus] = useState<SocketStatus>('connecting');
  const [state, setState] = useState<FullState | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [eventTick, setEventTick] = useState(0);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [stale, setStale] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [driveState, setDriveState] = useState<DriveSnapshot>({ intent: 'S', pending: false, error: null });
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const toastId = useRef(0);

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // Control is available only with a live backend socket AND a reachable robot.
  const stateRef = useRef<FullState | null>(null);
  stateRef.current = state;
  const controlAllowed = () => socket.isOpen && stateRef.current?.connections.esp32.status === 'connected' && !stateRef.current?.robot.estop;

  const driveRef = useRef<DriveController>();
  if (!driveRef.current) driveRef.current = new DriveController(socket, controlAllowed);
  const drive = driveRef.current;

  /* ---- socket wiring ---- */
  useEffect(() => {
    const offStatus = socket.onStatus((s) => {
      setSocketStatus(s);
      if (s !== 'open') drive.stopAll(); // lost the backend: release everything (backend watchdog stops the robot)
    });
    const offs = [
      socket.on('state', (s: FullState) => {
        setState(s);
        setSocketStatus('open');
      }),
      socket.on('telemetry', (d: { reading: Reading | null; sensors: SensorStatus | null; risk: RiskState; connections: Connections; stale?: boolean }) => {
        setStale(!!d.stale);
        setState((s) => (s ? { ...s, connections: d.connections, telemetry: { reading: d.reading, sensors: d.sensors, risk: d.risk } } : s));
        if (d.reading && !d.stale) {
          const r = d.reading;
          setHistory((h) => {
            const next = h.length >= HISTORY_MAX ? h.slice(h.length - HISTORY_MAX + 1) : h.slice();
            next.push({ ts: r.ts, temperature: r.temperature, humidity: r.humidity, gas: r.gas, distance: r.distance, motion: r.motion ? 1 : 0 });
            return next;
          });
        }
      }),
      socket.on('robot', (robot: RobotState) => setState((s) => (s ? { ...s, robot } : s))),
      socket.on('connections', (connections: Connections) => setState((s) => (s ? { ...s, connections } : s))),
      socket.on('risk', (risk: RiskState) => setState((s) => (s ? { ...s, telemetry: { ...s.telemetry, risk } } : s))),
      socket.on('mission', (mission: Mission | null) => setState((s) => (s ? { ...s, mission } : s))),
      socket.on('settings', (settings: Settings) => setState((s) => (s ? { ...s, settings, demo: settings.demoMode } : s))),
      socket.on('event', (ev: AppEvent) => {
        setEvents((e) => [ev, ...e].slice(0, 100));
        setEventTick((t) => t + 1);
        if (ev.severity === 'critical') notify(ev.description, 'error');
      }),
      socket.on('pong', () => setLatencyMs(socket.latencyMs)),
    ];
    socket.connect();
    return () => {
      offStatus();
      offs.forEach((o) => o());
      socket.close();
    };
  }, [socket, drive, notify]);

  /* ---- initial recent events + short telemetry backfill so charts aren't empty after a refresh ---- */
  useEffect(() => {
    if (socketStatus !== 'open') return;
    api.events({ limit: 40 }).then((r) => setEvents(r.events)).catch(() => {});
    api.history({ minutes: 15 }).then((rows) => {
      setHistory((cur) =>
        cur.length
          ? cur
          : rows.map((r) => ({ ts: r.ts, temperature: r.temperature, humidity: r.humidity, gas: r.gas, distance: r.distance, motion: r.motion ? 1 : 0 })),
      );
    }).catch(() => {});
  }, [socketStatus]);

  /* ---- drive state + safety stops ---- */
  useEffect(() => {
    const off = drive.subscribe((s) => {
      setDriveState(s);
      if (s.error) notify(s.error, 'error');
    });
    return off;
  }, [drive, notify]);

  useEffect(() => {
    const stop = () => drive.stopAll();
    const onVis = () => document.visibilityState === 'hidden' && stop();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', stop);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', stop);
      window.removeEventListener('pagehide', stop);
    };
  }, [drive]);

  const conn = state?.connections ?? null;
  const controlAvailable = socketStatus === 'open' && conn?.esp32.status === 'connected';
  useEffect(() => {
    if (!controlAvailable || state?.robot.estop) drive.stopAll();
  }, [controlAvailable, state?.robot.estop, drive]);

  /* ---- theme ---- */
  const theme = state?.settings.dashboard.theme ?? 'dark';
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B0C0E' : '#E2E5E9');
  }, [theme]);

  /* ---- actions ---- */
  const saveSettings = useCallback(async (patch: unknown) => {
    const next = await api.saveSettings(patch);
    setState((s) => (s ? { ...s, settings: next, demo: next.demoMode } : s));
    return next;
  }, []);

  const emergencyStop = useCallback(async () => {
    drive.stopAll();
    socket.send({ t: 'estop' });
    try {
      await api.estop(); // redundant HTTP path in case the socket is the thing that failed
    } catch (e) {
      notify(`E-STOP request failed: ${(e as ApiError).message}. Use the PHYSICAL power switch!`, 'error');
    }
  }, [drive, socket, notify]);

  const rearm = useCallback(async () => {
    try {
      await api.rearm();
      notify('Controls re-armed', 'ok');
    } catch (e) {
      notify((e as ApiError).message, 'error');
    }
  }, [notify]);

  const reconnect = useCallback(async (target: 'esp32' | 'camera' | 'all' = 'all') => {
    if (!socket.isOpen) socket.reconnectNow();
    try {
      await api.reconnect(target);
    } catch (e) {
      notify((e as ApiError).message, 'error');
    }
  }, [socket, notify]);

  const refreshMission = useCallback(async () => {
    try {
      const r = await api.missions({ status: 'active', limit: 1 });
      setState((s) => (s ? { ...s, mission: r.missions[0] ?? null } : s));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      socketStatus,
      ready: !!state,
      backendOnline: socketStatus === 'open',
      settings: state?.settings ?? null,
      connections: conn,
      robot: state?.robot ?? null,
      reading: state?.telemetry.reading ?? null,
      sensors: state?.telemetry.sensors ?? null,
      risk: state?.telemetry.risk ?? null,
      mission: state?.mission ?? null,
      pausedMissions: state?.pausedMissions ?? [],
      demo: state?.demo ?? false,
      events,
      eventTick,
      history,
      staleTelemetry: stale,
      latencyMs,
      controlAvailable,
      drive,
      driveState,
      toasts,
      notify,
      dismissToast,
      saveSettings,
      emergencyStop,
      rearm,
      reconnect,
      refreshMission,
    }),
    [socketStatus, state, conn, events, eventTick, history, stale, latencyMs, controlAvailable, drive, driveState, toasts, notify, dismissToast, saveSettings, emergencyStop, rearm, reconnect, refreshMission],
  );

  return <RobotCtx.Provider value={value}>{children}</RobotCtx.Provider>;
}
