export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <path d="M9 3h22l6 6v22l-6 6H9l-6-6V9z" fill="rgb(var(--bg))" stroke="rgb(var(--accent))" strokeWidth="2.5" />
      <path d="M13 13l14 14M27 13L13 27" stroke="rgb(var(--text))" strokeWidth="4" strokeLinecap="square" />
      <rect x="17" y="17" width="6" height="6" fill="rgb(var(--accent))" />
    </svg>
  );
}

export function Logo({ compact = false, subtitle = true }: { compact?: boolean; subtitle?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={compact ? 28 : 36} />
      <div className="leading-none">
        <div className={`font-display font-bold uppercase tracking-[0.18em] ${compact ? 'text-[17px]' : 'text-[22px]'}`}>
          STRUCTURE <span className="text-accent">X</span>
        </div>
        {subtitle && !compact && <div className="mt-1 font-display text-[9.5px] font-semibold uppercase tracking-[0.2em] text-mute">Advanced Disaster Inspection System</div>}
      </div>
    </div>
  );
}
