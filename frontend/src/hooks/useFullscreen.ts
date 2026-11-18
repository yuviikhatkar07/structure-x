import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Native fullscreen where available (also tries to lock landscape); CSS fallback for iPhone Safari. */
export function useFullscreen(ref: RefObject<HTMLElement>) {
  const [native, setNative] = useState(false);
  const [pseudo, setPseudo] = useState(false);

  useEffect(() => {
    const on = () => setNative(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [ref]);

  const exit = useCallback(async () => {
    setPseudo(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    try {
      (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
    } catch {
      /* not supported */
    }
  }, []);

  const enter = useCallback(async () => {
    const el = ref.current;
    if (el && document.fullscreenEnabled && el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        try {
          await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
        } catch {
          /* orientation lock unsupported or refused – fine */
        }
        return;
      } catch {
        /* fall through to pseudo fullscreen */
      }
    }
    setPseudo(true);
  }, [ref]);

  const isFull = native || pseudo;
  const toggle = useCallback(() => (isFull ? exit() : enter()), [isFull, enter, exit]);
  return { isFull, pseudo, toggle, exit };
}
