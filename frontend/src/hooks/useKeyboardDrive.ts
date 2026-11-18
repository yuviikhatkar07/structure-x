import { useEffect } from 'react';
import { useRobot } from '../state/RobotContext';
import type { Dir } from '../types';

const KEY_DIR: Record<string, Dir> = {
  w: 'F',
  arrowup: 'F',
  s: 'B',
  arrowdown: 'B',
  a: 'L',
  arrowleft: 'L',
  d: 'R',
  arrowright: 'R',
};

export function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/** WASD / arrow keys drive while held. Ignored while typing in form fields. Mounted only on pages with drive controls. */
export function useKeyboardDrive(enabled = true) {
  const { drive } = useRobot();
  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = KEY_DIR[e.key.toLowerCase()];
      if (!dir) return;
      e.preventDefault();
      if (e.repeat) return;
      drive.press(`key:${e.key.toLowerCase()}`, dir);
    };
    const up = (e: KeyboardEvent) => {
      if (KEY_DIR[e.key.toLowerCase()]) drive.release(`key:${e.key.toLowerCase()}`);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      drive.stopAll();
    };
  }, [drive, enabled]);
}
