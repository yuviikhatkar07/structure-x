import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Battery, MoreHorizontal, Wifi, WifiOff, TriangleAlert, User } from 'lucide-react';
import { Logo, LogoMark } from '../components/Logo';
import { Dot, Modal, connTone, Toasts } from '../components/ui';
import { EStopButton } from '../components/Controls';
import { useRobot } from '../state/RobotContext';
import { useLayout, useNow } from '../hooks/useMedia';
import { isTypingTarget, useKeyboardDrive } from '../hooks/useKeyboardDrive';
import { cn, fmtClock, fmtDate } from '../utils/format';
import { DRIVE_PAGES, MOBILE_PRIMARY, NAV } from './nav';

function Chip({ label, status, pulse }: { label: string; status: 'connected' | 'connecting' | 'disconnected' | undefined; pulse?: boolean }) {
  return <span className="flex items-center gap-1.5 whitespace-nowrap"><Dot tone={connTone(status)} pulse={pulse || status === 'connecting'} /><span className="label !text-fg/80">{label}</span></span>;
}

function TopBar({ mobile }: { mobile: boolean }) {
  const { connections, robot, reading, settings, socketStatus, latencyMs } = useRobot();
  const now = useNow(1000);
  const battery = reading?.battery ?? null;
  const robotTone = !robot ? 'mute' : robot.estop ? 'bad' : robot.status === 'OFFLINE' ? 'bad' : robot.direction !== 'S' ? 'accent' : 'ok';
  return (
    <header className={cn('sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-ink/95 px-3 backdrop-blur safe-top', mobile ? 'h-[56px]' : 'h-14 px-4')}>
      {mobile ? <LogoMark size={30} /> : null}
      {!mobile && <div className="hidden xl:block"><Logo compact /></div>}
      <div className={cn('flex min-w-0 flex-1 items-center overflow-x-auto', mobile ? 'gap-3' : 'gap-5')}>
        <Chip label="ESP32" status={connections?.esp32.status} />
        <Chip label="CAM" status={connections?.camera.status} />
        {!mobile && <Chip label="DB" status={connections?.database.status} />}
        <span className="flex items-center gap-1.5 whitespace-nowrap">{socketStatus === 'open' ? <Wifi size={14} className="text-ok" /> : <WifiOff size={14} className="text-bad" />}{!mobile && <span className="label !text-fg/80">{socketStatus === 'open' ? `LINK${latencyMs !== null ? ` ${latencyMs}ms` : ''}` : 'NO LINK'}</span>}</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap"><Dot tone={robotTone} pulse={robot?.direction !== 'S'} /><span className={cn('font-display text-[12px] font-semibold uppercase tracking-[0.12em]', robotTone === 'bad' ? 'text-bad' : robotTone === 'accent' ? 'text-accent' : '')}>{robot?.status ?? '—'}</span></span>
        {battery !== null && <span className="flex items-center gap-1 whitespace-nowrap text-sm"><Battery size={14} />{battery}%</span>}
      </div>
      {!mobile && (
        <div className="hidden items-center gap-4 md:flex">
          <div className="num text-right text-[11px] leading-tight text-mute"><div className="text-fg">{fmtClock(now)}</div><div>{fmtDate(now)}</div></div>
          <div className="flex items-center gap-1.5 text-sm text-mute"><User size={15} />{settings?.mission.operatorName || 'Operator'}</div>
        </div>
      )}
      <EStopButton />
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { mode } = useLayout();
  const mobile = mode === 'mobile';
  const { toasts, dismissToast, backendOnline, ready, connections, demo, emergencyStop, robot } = useRobot();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  useKeyboardDrive(!mobile && DRIVE_PAGES.includes(pathname));
  useEffect(() => setMore(false), [pathname]);

  // Space = emergency stop everywhere except while typing.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (!e.repeat && !robot?.estop) emergencyStop();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [emergencyStop, robot?.estop]);

  const banner = !backendOnline ? { t: 'Backend unreachable — robot control is DISABLED. Reconnecting…', tone: 'bad' }
    : connections?.esp32.status !== 'connected' ? { t: `Main ESP32 ${connections?.esp32.status ?? 'unknown'} — movement controls disabled. ${connections?.esp32.lastError ?? ''} Ensure this device is on the STRUCTURE_X Wi-Fi.`, tone: 'bad' }
    : null;

  return (
    <div className="flex min-h-[100dvh]">
      {!mobile && (
        <aside className="sticky top-0 hidden h-[100dvh] w-[212px] shrink-0 flex-col border-r border-line bg-panel lg:flex xl:w-[236px]">
          <div className="border-b border-line px-4 py-4"><Logo /></div>
          <nav className="flex-1 overflow-y-auto py-2">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={'end' in n && n.end} className={({ isActive }) => cn('flex min-h-[42px] items-center gap-3 border-l-2 px-4 font-display text-[14px] font-semibold uppercase tracking-[0.1em] transition-colors', isActive ? 'border-accent bg-accent/10 text-accent' : 'border-transparent text-mute hover:bg-line/30 hover:text-fg')}>
                <n.icon size={17} />{n.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-line p-3 text-[10px] leading-snug text-mute">Always fit a physical motor-power E-STOP. Software stops are not a safety substitute.</div>
        </aside>
      )}
      <div className={cn('flex min-w-0 flex-1 flex-col', mode === 'tablet' && 'pb-0')}>
        <TopBar mobile={mobile} />
        {demo && <div className="border-b border-accent/50 bg-accent/10 px-3 py-1 text-center font-display text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">Demo mode — simulated robot, no hardware connected</div>}
        {ready && banner && <div className={cn('flex items-start gap-2 border-b px-3 py-2 text-[13px]', 'border-bad/60 bg-bad/15 text-bad')}><TriangleAlert size={16} className="mt-0.5 shrink-0" /><span>{banner.t}</span></div>}
        <main className={cn('min-w-0 flex-1 p-3 sm:p-4 xl:p-5', mobile && 'pb-[88px]')}>{ready ? children : <Booting online={backendOnline} />}</main>
      </div>
      {mobile && (
        <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-line bg-panel safe-bottom" aria-label="Primary">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.to)).map((n) => (
            <NavLink key={n.to} to={n.to} end={'end' in n && n.end} className={({ isActive }) => cn('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider', isActive ? 'text-accent' : 'text-mute')}>
              <n.icon size={21} />{n.short}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider text-mute"><MoreHorizontal size={21} />More</button>
        </nav>
      )}
      <Modal open={more} onClose={() => setMore(false)} title="Menu">
        <div className="grid grid-cols-2 gap-2">
          {NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to)).map((n) => (
            <NavLink key={n.to} to={n.to} className="btn !min-h-[56px] flex-col !gap-1 !text-[12px]"><n.icon size={20} />{n.short}</NavLink>
          ))}
        </div>
      </Modal>
      <Toasts toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

function Booting({ online }: { online: boolean }) {
  return (
    <div className="flex h-[60dvh] flex-col items-center justify-center gap-3 text-center">
      <LogoMark size={56} />
      <div className="font-display text-xl font-semibold uppercase tracking-[0.2em]">{online ? 'Loading state…' : 'Connecting to STRUCTURE X backend…'}</div>
      {!online && <p className="max-w-sm text-sm text-mute">If this persists, start the backend with <span className="num text-fg">npm run dev</span> and make sure this device can reach it.</p>}
    </div>
  );
}
