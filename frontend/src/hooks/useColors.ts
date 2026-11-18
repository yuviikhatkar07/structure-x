import { useRobot } from '../state/RobotContext';

/** Concrete colours for SVG charts (CSS variables don't work in SVG presentation attributes). */
export function useColors() {
  const { settings } = useRobot();
  const day = settings?.dashboard.theme === 'daylight';
  return day
    ? { accent: '#D64E00', ok: '#159446', warn: '#C26904', bad: '#CD2020', grid: '#C6CBD3', text: '#58616E', blue: '#0B6FB3', panel: '#FAFBFC' }
    : { accent: '#FF6A13', ok: '#22C55E', warn: '#F59E0B', bad: '#EF4444', grid: '#2D3138', text: '#8A929E', blue: '#38BDF8', panel: '#14161A' };
}
