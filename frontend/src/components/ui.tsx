import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/format';
import type { ConnStatus, RiskLevel } from '../types';

export function Panel({ title, icon, right, children, className, bodyClass }: { title?: string; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn('relative min-w-0 border border-line bg-panel', className)}>
      <span className="pointer-events-none absolute -left-px -top-px h-2 w-2 border-l-2 border-t-2 border-accent" />
      {title && (
        <header className="flex min-h-[38px] items-center justify-between gap-2 border-b border-line px-3">
          <h2 className="label flex items-center gap-2 !text-fg/80">
            {icon && <span className="text-accent">{icon}</span>}
            {title}
          </h2>
          {right}
        </header>
      )}
      <div className={cn('p-3', bodyClass)}>{children}</div>
    </section>
  );
}

export const connTone = (s: ConnStatus | undefined) => (s === 'connected' ? 'ok' : s === 'connecting' ? 'warn' : 'bad');
export const riskTone = (l: RiskLevel | undefined) => (l === 'SAFE' ? 'ok' : l === 'CAUTION' ? 'warn' : l === 'DANGER' ? 'bad' : 'mute');

const TONE_BG: Record<string, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', mute: 'bg-mute', accent: 'bg-accent' };
const TONE_GLOW: Record<string, string> = { ok: 'shadow-glowOk', warn: 'shadow-glowWarn', bad: 'shadow-glowBad', accent: 'shadow-glowAccent', mute: '' };
const TONE_TEXT: Record<string, string> = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', mute: 'text-mute', accent: 'text-accent' };
const TONE_BORDER: Record<string, string> = { ok: 'border-ok/50 bg-ok/10', warn: 'border-warn/50 bg-warn/10', bad: 'border-bad/60 bg-bad/10', mute: 'border-line bg-panel2', accent: 'border-accent/60 bg-accent/10' };
export const toneText = (t: string) => TONE_TEXT[t] || '';

export function Dot({ tone, pulse }: { tone: string; pulse?: boolean }) {
  return <span className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', TONE_BG[tone], TONE_GLOW[tone], pulse && 'animate-pulseSoft')} />;
}

export function Badge({ tone = 'mute', children, className }: { tone?: string; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 border px-2 py-0.5 font-display text-[12px] font-semibold uppercase tracking-[0.12em]', TONE_BORDER[tone], TONE_TEXT[tone], className)}>{children}</span>;
}

export function StatusLine({ label, status, detail }: { label: string; status: ConnStatus | undefined; detail?: string }) {
  const tone = connTone(status);
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="flex items-center gap-2 text-sm"><Dot tone={tone} pulse={status === 'connecting'} />{label}</span>
      <span className="text-right">
        <span className={cn('font-display text-[12px] font-semibold uppercase tracking-[0.12em]', TONE_TEXT[tone])}>{status ?? 'unknown'}</span>
        {detail && <span className="block text-[11px] text-mute">{detail}</span>}
      </span>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={title} className={cn('flex max-h-[92dvh] w-full flex-col border border-line bg-panel shadow-2xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-md')}>
        <header className="flex items-center justify-between border-b border-line px-4 py-2">
          <h3 className="font-display text-base font-semibold uppercase tracking-[0.14em]">{title}</h3>
          <button className="btn btn-ghost !min-h-[44px] !min-w-[44px] !px-0" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function Confirm({ open, title, text, confirmLabel = 'Confirm', onConfirm, onClose }: { open: boolean; title: string; text: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-mute">{text}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-dashed border-line px-4 py-8 text-center text-sm text-mute">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-mute">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.12em]">{title}</h1>
        {sub && <p className="text-[13px] text-mute">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Toasts({ toasts, dismiss }: { toasts: { id: number; kind: string; text: string }[]; dismiss: (id: number) => void }) {
  const tone = (k: string) => (k === 'ok' ? 'border-ok' : k === 'warn' ? 'border-warn' : k === 'error' ? 'border-bad' : 'border-accent');
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[90] flex flex-col items-center gap-2 px-3 safe-top" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} onClick={() => dismiss(t.id)} className={cn('pointer-events-auto max-w-md border-l-4 border bg-panel2 px-3 py-2 text-left text-sm shadow-xl', tone(t.kind))}>{t.text}</button>
      ))}
    </div>
  );
}
