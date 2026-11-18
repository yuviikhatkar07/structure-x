import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, Maximize2, Minimize2, RefreshCw, VideoOff, Rows3 } from 'lucide-react';
import { useRobot } from '../state/RobotContext';
import { useFullscreen } from '../hooks/useFullscreen';
import { useNow } from '../hooks/useMedia';
import { api, ApiError } from '../services/api';
import { cn, fmtClock, fmtDate } from '../utils/format';
import { Badge, Dot, riskTone } from './ui';

/** Clearly-labelled synthetic frame for DEMO mode only. Never shown when hardware mode is configured. */
function DemoCanvas({ canvasRef }: { canvasRef: React.RefObject<HTMLCanvasElement> }) {
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 100) return;
      last = t;
      ctx.fillStyle = '#101216';
      ctx.fillRect(0, 0, 640, 480);
      ctx.strokeStyle = '#2d3138';
      ctx.lineWidth = 1;
      for (let x = 0; x <= 640; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 480); ctx.stroke(); }
      for (let y = 0; y <= 480; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke(); }
      ctx.strokeStyle = '#FF6A13';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(320, 240, 60 + Math.sin(t / 500) * 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(300, 240); ctx.lineTo(340, 240); ctx.moveTo(320, 220); ctx.lineTo(320, 260); ctx.stroke();
      ctx.fillStyle = '#FF6A13';
      ctx.font = '700 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DEMO MODE — SIMULATED FRAME', 320, 60);
      ctx.fillStyle = '#8A929E';
      ctx.font = '14px sans-serif';
      ctx.fillText('This is NOT a real camera. Disable demo mode in Settings to use the ESP32-CAM.', 320, 90);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef]);
  return <canvas ref={canvasRef} width={640} height={480} className="h-full w-full object-contain" />;
}

export function CameraViewer({ fullscreenOverlay, className, onResize, sizeLabel, fillHeight }: { fullscreenOverlay?: ReactNode; className?: string; onResize?: () => void; sizeLabel?: string; fillHeight?: boolean }) {
  const { connections, settings, demo, reconnect, notify, risk, mission } = useRobot();
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<'loading' | 'live' | 'error'>('loading');
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const full = useFullscreen(boxRef);
  const now = useNow(1000);
  const camStatus = connections?.camera.status;
  const src = demo ? null : settings?.network.cameraMode === 'direct' ? `${settings.network.cameraStreamUrl}${settings.network.cameraStreamUrl.includes('?') ? '&' : '?'}n=${nonce}` : `/api/camera/stream?n=${nonce}`;

  const retry = useCallback(() => { setState('loading'); setNonce((n) => n + 1); reconnect('camera'); }, [reconnect]);

  // Auto-retry while errored; re-attach when the backend reports the camera is back.
  useEffect(() => {
    if (demo || state !== 'error') return;
    const t = window.setTimeout(() => { setState('loading'); setNonce((n) => n + 1); }, settings?.network.reconnectIntervalMs ?? 3000);
    return () => window.clearTimeout(t);
  }, [state, demo, settings?.network.reconnectIntervalMs]);
  useEffect(() => { if (camStatus === 'connected' && state === 'error') setNonce((n) => n + 1); }, [camStatus]); // eslint-disable-line

  const capture = async () => {
    setBusy(true);
    try {
      if (demo) {
        const blob: Blob | null = await new Promise((r) => canvasRef.current?.toBlob(r, 'image/jpeg', 0.85));
        if (!blob) throw new Error('No frame');
        await api.uploadDemoSnapshot(blob, 'DEMO synthetic frame (not a real photograph)');
      } else {
        await api.capture();
      }
      setFlash((f) => f + 1);
      notify('Snapshot saved' + (mission ? ` to mission “${mission.name}”` : ' (no active mission)'), 'ok');
    } catch (e) {
      notify(`Snapshot failed: ${(e as ApiError).message}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const showError = !demo && (state === 'error' || camStatus === 'disconnected') && state !== 'live';
  const live = demo || (state === 'live' && camStatus !== 'disconnected');
  const tone = demo ? 'accent' : live ? 'ok' : camStatus === 'connecting' || state === 'loading' ? 'warn' : 'bad';

  return (
    <div
      ref={boxRef}
      className={cn('relative overflow-hidden border border-line bg-black', full.pseudo ? 'fixed inset-0 z-[70] !border-0' : '', full.isFull ? 'h-full w-full' : fillHeight ? 'h-full min-h-[200px]' : 'aspect-[4/3] w-full sm:aspect-video', className)}
    >
      {demo ? (
        <DemoCanvas canvasRef={canvasRef} />
      ) : (
        src && <img key={nonce} src={src} alt="ESP32-CAM live stream" className={cn('h-full w-full object-contain', state !== 'live' && 'invisible')} onLoad={() => setState('live')} onError={() => setState('error')} draggable={false} />
      )}

      {!demo && state === 'loading' && !showError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-mute">
          <RefreshCw className="animate-spin" size={26} /><span className="label">Connecting to camera…</span>
        </div>
      )}
      {showError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/95 px-4 text-center">
          <VideoOff size={34} className="text-bad" />
          <div>
            <div className="font-display text-lg font-semibold uppercase tracking-[0.14em] text-bad">Camera disconnected</div>
            <p className="mx-auto mt-1 max-w-xs text-[12px] text-mute">{connections?.camera.lastError || 'No video from the ESP32-CAM.'} Check the robot Wi-Fi (STRUCTURE_X) and camera power. Retrying automatically.</p>
          </div>
          <button className="btn btn-accent" onClick={retry}><RefreshCw size={15} /> Retry now</button>
        </div>
      )}

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent p-2 text-white">
        <Badge tone={tone} className="!bg-black/60"><Dot tone={tone} pulse={!live} />{demo ? 'DEMO — SIMULATED' : live ? 'LIVE' : camStatus === 'connecting' ? 'CONNECTING' : 'OFFLINE'}</Badge>
        <div className="num text-right text-[11px] leading-tight text-white/90">
          <div>{fmtDate(now)} {fmtClock(now)}</div>
          {risk && risk.level !== 'UNKNOWN' && <div className={cn('font-semibold', riskTone(risk.level) === 'ok' ? 'text-ok' : riskTone(risk.level) === 'warn' ? 'text-warn' : 'text-bad')}>RISK {risk.level}</div>}
        </div>
      </div>
      {flash > 0 && <div key={flash} className="pointer-events-none absolute inset-0 animate-flash bg-white" />}

      {/* Actions */}
      <div className={cn('absolute bottom-2 right-2 flex gap-1.5', full.isFull && 'bottom-3 right-3')}>
        <button className="btn !min-h-[44px] !min-w-[44px] !px-3 !bg-black/70" onClick={capture} disabled={busy || (!demo && !live)} aria-label="Capture snapshot"><Camera size={18} /><span className="hidden sm:inline">Snapshot</span></button>
        {onResize && !full.isFull && <button className="btn !min-h-[44px] !min-w-[44px] !px-3 !bg-black/70 max-lg:hidden" onClick={onResize} aria-label="Resize camera panel"><Rows3 size={18} /><span className="hidden xl:inline">{sizeLabel}</span></button>}
        <button className="btn !min-h-[44px] !min-w-[44px] !px-3 !bg-black/70" onClick={full.toggle} aria-label="Toggle fullscreen">{full.isFull ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
      </div>
      {full.isFull && fullscreenOverlay}
    </div>
  );
}
