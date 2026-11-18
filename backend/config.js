import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname);
export const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
export const SNAPSHOT_DIR = path.join(DATA_DIR, 'snapshots');
export const REPORT_DIR = path.join(DATA_DIR, 'reports');
export const PORT = Number(process.env.PORT || 8080);
export const HOST = process.env.HOST || '0.0.0.0';
export const DEMO_ENV = process.env.DEMO === '1';
export const FRONTEND_DIST = path.resolve(ROOT, '..', 'frontend', 'dist');
