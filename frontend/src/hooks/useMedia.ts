import { useEffect, useState } from 'react';

export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

function compute() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const landscapePhone = h < 480 && w > h;
  const mode: LayoutMode = w < 768 || landscapePhone ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  return { mode, width: w, height: h, landscapePhone };
}

/** Structural layout mode. Mobile = <768px wide OR a phone held in landscape (short viewport). */
export function useLayout() {
  const [v, setV] = useState(compute);
  useEffect(() => {
    const on = () => setV(compute());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return v;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
