export type Dir = 'F' | 'B' | 'L' | 'R' | 'S';
export type ConnStatus = 'connected' | 'connecting' | 'disconnected';
export type RiskLevel = 'SAFE' | 'CAUTION' | 'DANGER' | 'UNKNOWN';
export type Severity = 'info' | 'warning' | 'error' | 'critical';
export type MissionStatus = 'planned' | 'active' | 'paused' | 'completed' | 'aborted';

export interface ServoCfg {
  min: number;
  max: number;
  up: number;
  down: number;
  home: number;
  invert: boolean;
}

export interface Settings {
  network: {
    esp32Ip: string;
    apiBaseUrl: string;
    cameraIp: string;
    cameraStreamUrl: string;
    cameraCaptureUrl: string;
    cameraMode: 'proxy' | 'direct';
    timeoutMs: number;
    reconnectIntervalMs: number;
    endpoints: { move: string; speed: string; servo: string; data: string };
  };
  robot: {
    minSpeed: number;
    defaultSpeed: number;
    maxSpeed: number;
    speedPresets: { low: number; normal: number; high: number };
    servo: { L: ServoCfg; R: ServoCfg };
    servoCalibrated: boolean;
  };
  sensors: {
    refreshMs: number;
    gasWarning: number;
    gasCritical: number;
    tempWarning: number;
    tempCritical: number;
    obstacleWarningCm: number;
    obstacleCriticalCm: number;
    motionRaisesCaution: boolean;
  };
  storage: { readingIntervalActiveSec: number; readingIntervalIdleSec: number; retentionDays: number };
  dashboard: {
    theme: 'dark' | 'daylight';
    layout: 'standard' | 'compact';
    cameraSize: 'medium' | 'large' | 'xl';
    mobileControl: 'dpad' | 'joystick';
    chartMinutes: number;
    showChartGrid: boolean;
  };
  mission: {
    operatorName: string;
    defaultLocation: string;
    report: { organization: string; includePhotos: boolean; maxPhotos: number; footerNote: string };
  };
  demoMode: boolean;
}

export interface ConnectionInfo {
  status: ConnStatus;
  lastOk: number | null;
  lastError: string | null;
  latencyMs?: number | null;
  failures?: number;
  since?: number;
  lastFrame?: number | null;
  lastSave?: number | null;
  viewers?: number;
  fps?: number;
  idle?: boolean;
  simulated?: boolean;
}
export interface Connections {
  esp32: ConnectionInfo;
  camera: ConnectionInfo;
  database: ConnectionInfo;
  wifi: { status: ConnStatus };
}

export interface RobotState {
  direction: Dir;
  speed: number;
  estop: boolean;
  servos: { L: number | null; R: number | null };
  status: string;
  mode: 'hardware' | 'simulated';
  driver: string | null;
  driverActive: boolean;
  lastError: string | null;
}

export interface Reading {
  ts: number;
  distance: number | null;
  temperature: number | null;
  humidity: number | null;
  gas: number | null;
  motion: boolean | null;
  movement: string | null;
  deviceRisk: string | null;
  battery: number | null;
  servoL: number | null;
  servoR: number | null;
  speed: number | null;
  uptime: number | null;
  simulated: boolean;
}
export interface SensorStatus {
  ultrasonic: 'ok' | 'invalid';
  mq2: 'ok' | 'warming' | 'invalid';
  dht22: 'ok' | 'partial' | 'invalid';
  pir: 'ok' | 'unknown';
  gasWarmupSec: number;
  humidityReported: boolean;
}
export interface RiskReason {
  code: string;
  severity: 'info' | 'caution' | 'danger';
  text: string;
}
export interface RiskState {
  level: RiskLevel;
  since: number;
  ts: number;
  reasons: RiskReason[];
  warnings: string[];
  eventId: number | null;
  acknowledged: boolean;
}
export interface Telemetry {
  reading: Reading | null;
  sensors: SensorStatus | null;
  risk: RiskState;
}

export interface Mission {
  id: number;
  name: string;
  location: string | null;
  operator: string | null;
  description: string | null;
  status: MissionStatus;
  planned_start: number | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
  notes: string | null;
  snapshot_count?: number;
  risk_event_count?: number;
}
export interface MissionDetail extends Mission {
  stats: {
    readings: Record<string, number | null>;
    snapshots: number;
    events: number;
    commands: number;
    riskEvents: number;
    dangerEvents: number;
    motionEvents: number;
    notes: number;
  };
  missionNotes: MissionNote[];
}
export interface MissionNote {
  id: number;
  mission_id: number;
  ts: number;
  operator: string | null;
  text: string;
}

export interface AppEvent {
  id: number;
  ts: number;
  type: string;
  severity: Severity;
  description: string;
  mission_id: number | null;
  operator: string | null;
  meta: unknown;
}

export interface Snapshot {
  id: number;
  ts: number;
  mission_id: number | null;
  mission_name?: string | null;
  operator: string | null;
  note: string | null;
  risk_level: RiskLevel | null;
  filename: string;
  size_bytes: number;
  source: string;
}

export interface RiskEventRow {
  id: number;
  ts: number;
  mission_id: number | null;
  level: RiskLevel;
  prev_level: RiskLevel | null;
  reasons: RiskReason[];
  readings: Partial<Reading> | null;
  acknowledged: boolean;
  ack_ts: number | null;
  ack_by: string | null;
}

export interface ReadingRow {
  id: number;
  ts: number;
  mission_id: number | null;
  distance: number | null;
  temperature: number | null;
  humidity: number | null;
  gas: number | null;
  motion: number | null;
  risk_level: RiskLevel | null;
}

export interface ReportRow {
  id: number;
  mission_id: number;
  mission_name: string;
  created_at: number;
  filename: string;
  size_bytes: number;
  generated_by: string | null;
}

export interface FullState {
  serverTime: number;
  demo: boolean;
  connections: Connections;
  robot: RobotState;
  telemetry: Telemetry;
  mission: Mission | null;
  pausedMissions: { id: number; name: string }[];
  settings: Settings;
}
