import { Activity, Camera, Clock, Flag, FileText, Gamepad2, Gauge, History, LayoutDashboard, ListTree, Settings, ShieldAlert, Wrench } from 'lucide-react';

export const NAV = [
  { to: '/', label: 'Command Center', short: 'Command', icon: LayoutDashboard, end: true },
  { to: '/camera', label: 'Live Camera', short: 'Camera', icon: Camera },
  { to: '/control', label: 'Robot Control', short: 'Drive', icon: Gamepad2 },
  { to: '/climbing', label: 'Climbing Mechanism', short: 'Climb', icon: Wrench },
  { to: '/environment', label: 'Environmental Monitoring', short: 'Sensors', icon: Gauge },
  { to: '/risk', label: 'Risk Assessment', short: 'Risk', icon: ShieldAlert },
  { to: '/missions', label: 'Inspection Missions', short: 'Missions', icon: Flag },
  { to: '/history', label: 'Inspection History', short: 'History', icon: History },
  { to: '/events', label: 'Event Logs', short: 'Events', icon: ListTree },
  { to: '/reports', label: 'Mission Reports', short: 'Reports', icon: FileText },
  { to: '/settings', label: 'System Settings', short: 'Settings', icon: Settings },
] as const;
export const MOBILE_PRIMARY = ['/', '/control', '/camera', '/environment'];
export const DRIVE_PAGES = ['/', '/camera', '/control', '/climbing'];
export { Activity, Clock };
