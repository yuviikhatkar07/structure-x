import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { all, get, run } from '../database/index.js';
import { HttpError } from '../bus.js';
import { REPORT_DIR } from '../config.js';
import { getSettings } from './settings.js';
import { getMission, listNotes, missionStats } from './missions.js';
import { missionSnapshots, snapshotPath } from './snapshots.js';
import { logEvent } from './events.js';

const C = { orange: '#FF6A13', dark: '#14171B', grey: '#6B7280', light: '#E5E7EB', green: '#16A34A', amber: '#D97706', red: '#DC2626', paper: '#F5F6F7' };
const LEVEL_COLOR = { SAFE: C.green, CAUTION: C.amber, DANGER: C.red, UNKNOWN: C.grey };
const M = 42; // page margin

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' }) : '—');
const fmtDur = (ms) => {
  if (!ms || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h} h ` : ''}${m} min ${s % 60} s`;
};
const n1 = (v, unit = '') => (v === null || v === undefined ? '—' : `${(+v).toFixed(1)}${unit}`);
const n0 = (v) => (v === null || v === undefined ? '—' : String(Math.round(v)));

function drawLogo(doc, x, y, size, color = C.orange) {
  doc.save();
  doc.lineWidth(size / 12).strokeColor(color);
  const c = size / 5;
  doc.polygon([x + c, y], [x + size - c, y], [x + size, y + c], [x + size, y + size - c], [x + size - c, y + size], [x + c, y + size], [x, y + size - c], [x, y + c]).stroke();
  doc.lineWidth(size / 8).strokeColor('#FFFFFF');
  doc.moveTo(x + size * 0.28, y + size * 0.28).lineTo(x + size * 0.72, y + size * 0.72).stroke();
  doc.moveTo(x + size * 0.72, y + size * 0.28).lineTo(x + size * 0.28, y + size * 0.72).stroke();
  doc.rect(x + size * 0.43, y + size * 0.43, size * 0.14, size * 0.14).fill(color);
  doc.restore();
}

function pageHeader(doc, small) {
  doc.save();
  doc.rect(0, 0, doc.page.width, small ? 34 : 86).fill(C.dark);
  doc.rect(0, small ? 34 : 86, doc.page.width, 3).fill(C.orange);
  drawLogo(doc, M, small ? 7 : 20, small ? 20 : 44);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(small ? 11 : 22).text('STRUCTURE X', M + (small ? 28 : 56), small ? 11 : 24, { lineBreak: false, characterSpacing: 2 });
  doc.fillColor('#9CA3AF').font('Helvetica').fontSize(small ? 7 : 8).text('ADVANCED DISASTER INSPECTION SYSTEM', M + (small ? 28 : 56), small ? 24 : 52, { lineBreak: false, characterSpacing: 1.5 });
  if (!small) doc.fillColor(C.orange).font('Helvetica-Bold').fontSize(9).text('MISSION INSPECTION REPORT', doc.page.width - M - 200, 34, { width: 200, align: 'right', characterSpacing: 1 });
  doc.restore();
  doc.x = M;
  doc.y = small ? 52 : 108;
}

function ensure(doc, h) {
  if (doc.y + h > doc.page.height - 56) doc.addPage();
}

function section(doc, title) {
  ensure(doc, 60);
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(M, y, 4, 15).fill(C.orange);
  doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(12).text(title.toUpperCase(), M + 11, y + 2, { characterSpacing: 0.8 });
  doc.moveTo(M, doc.y + 4).lineTo(doc.page.width - M, doc.y + 4).lineWidth(0.5).strokeColor(C.light).stroke();
  doc.moveDown(0.6);
  doc.x = M;
}

function para(doc, text, opts = {}) {
  doc.fillColor(opts.color ?? C.dark).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 9.5).text(text, M, doc.y, { width: doc.page.width - 2 * M, lineGap: 2 });
}

function kvGrid(doc, rows) {
  const w = (doc.page.width - 2 * M) / 2;
  for (let i = 0; i < rows.length; i += 2) {
    ensure(doc, 34);
    const y = doc.y;
    rows.slice(i, i + 2).forEach(([k, v], j) => {
      doc.fillColor(C.grey).font('Helvetica').fontSize(7.5).text(k.toUpperCase(), M + j * w, y, { width: w - 10, characterSpacing: 0.6 });
      doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(10).text(String(v ?? '—'), M + j * w, y + 10, { width: w - 10 });
    });
    doc.y = y + 32;
  }
  doc.x = M;
}

function table(doc, columns, rows, { rowHeight = 16 } = {}) {
  const total = doc.page.width - 2 * M;
  const widths = columns.map((c) => c.w * total);
  const head = () => {
    ensure(doc, rowHeight * 2);
    const y = doc.y;
    doc.rect(M, y, total, rowHeight).fill(C.dark);
    let x = M;
    columns.forEach((c, i) => {
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text(c.label.toUpperCase(), x + 4, y + 5, { width: widths[i] - 8, lineBreak: false });
      x += widths[i];
    });
    doc.y = y + rowHeight;
  };
  head();
  rows.forEach((r, ri) => {
    if (doc.y + rowHeight > doc.page.height - 56) {
      doc.addPage();
      head();
    }
    const y = doc.y;
    if (ri % 2 === 0) doc.rect(M, y, total, rowHeight).fill(C.paper);
    let x = M;
    columns.forEach((c, i) => {
      const val = r[i];
      const color = c.color ? c.color(val, r) : C.dark;
      doc.fillColor(color).font(c.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).text(String(val ?? '—'), x + 4, y + 4.5, { width: widths[i] - 8, height: rowHeight - 4, ellipsis: true, lineBreak: false });
      x += widths[i];
    });
    doc.y = y + rowHeight;
  });
  doc.x = M;
  doc.moveDown(0.4);
}

function lineChart(doc, { title, unit, data, color, thresholds = [], height = 100 }) {
  ensure(doc, height + 34);
  const w = doc.page.width - 2 * M;
  const y0 = doc.y;
  doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8.5).text(`${title}${unit ? ` (${unit})` : ''}`, M, y0);
  const top = y0 + 14;
  const left = M + 34;
  const cw = w - 40;
  doc.rect(left, top, cw, height).lineWidth(0.5).strokeColor(C.light).stroke();
  const pts = data.filter((d) => d.v !== null && d.v !== undefined);
  if (pts.length < 2) {
    doc.fillColor(C.grey).font('Helvetica-Oblique').fontSize(8).text('Insufficient data recorded for this mission', left + 8, top + height / 2 - 4);
    doc.y = top + height + 8;
    return;
  }
  const vals = pts.map((p) => p.v);
  const lo = Math.min(...vals, ...thresholds.map((t) => t.v).filter((v) => v < Math.max(...vals) * 3));
  const hi = Math.max(...vals, ...thresholds.map((t) => t.v).filter((v) => v < Math.max(...vals) * 3));
  const min = lo - (hi - lo || 1) * 0.08;
  const max = hi + (hi - lo || 1) * 0.08;
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t || t0 + 1;
  const X = (t) => left + ((t - t0) / (t1 - t0 || 1)) * cw;
  const Y = (v) => top + height - ((v - min) / (max - min || 1)) * height;
  doc.font('Helvetica').fontSize(7).fillColor(C.grey);
  doc.text(max.toFixed(0), M, top - 3, { width: 30, align: 'right' });
  doc.text(min.toFixed(0), M, top + height - 6, { width: 30, align: 'right' });
  for (const t of thresholds) {
    if (t.v < min || t.v > max) continue;
    doc.moveTo(left, Y(t.v)).lineTo(left + cw, Y(t.v)).dash(3, { space: 3 }).lineWidth(0.7).strokeColor(t.color).stroke().undash();
    doc.fillColor(t.color).fontSize(6.5).text(t.label, left + 3, Y(t.v) - 8, { lineBreak: false });
  }
  const step = Math.max(1, Math.floor(pts.length / 240));
  doc.lineWidth(1.1).strokeColor(color);
  pts.forEach((p, i) => {
    if (i % step && i !== pts.length - 1) return;
    if (i === 0) doc.moveTo(X(p.t), Y(p.v));
    else doc.lineTo(X(p.t), Y(p.v));
  });
  doc.stroke();
  doc.fillColor(C.grey).fontSize(6.5).text(new Date(t0).toLocaleTimeString('en-GB'), left, top + height + 3, { lineBreak: false });
  doc.text(new Date(t1).toLocaleTimeString('en-GB'), left + cw - 60, top + height + 3, { width: 60, align: 'right', lineBreak: false });
  doc.y = top + height + 18;
  doc.x = M;
}

function timeInLevels(risk, start, end) {
  const out = { SAFE: 0, CAUTION: 0, DANGER: 0 };
  const sorted = [...risk].sort((a, b) => a.ts - b.ts);
  sorted.forEach((r, i) => {
    const until = sorted[i + 1]?.ts ?? end;
    if (out[r.level] !== undefined) out[r.level] += Math.max(0, until - r.ts);
  });
  return out;
}

export async function generateMissionReport(missionId, generatedBy) {
  const mission = getMission(missionId);
  const settings = getSettings();
  const opts = settings.mission.report;
  const start = mission.started_at ?? mission.created_at;
  const end = mission.ended_at ?? Date.now();
  const stats = missionStats(mission.id);
  const notes = listNotes(mission.id);
  const readings = all('SELECT * FROM sensor_readings WHERE mission_id=? ORDER BY ts ASC', mission.id);
  const risk = all('SELECT * FROM risk_events WHERE mission_id=? ORDER BY ts ASC', mission.id);
  const events = all("SELECT * FROM events WHERE mission_id=? AND (severity != 'info' OR type IN ('mission_started','mission_paused','mission_resumed','mission_completed','mission_aborted','snapshot','estop','mission_note','motion')) ORDER BY ts ASC LIMIT 400", mission.id);
  const snaps = opts.includePhotos ? missionSnapshots(mission.id).filter((s) => fs.existsSync(snapshotPath(s))).slice(0, opts.maxPhotos) : [];
  const snapTotal = missionSnapshots(mission.id).length;

  const filename = `STX-report-M${mission.id}-${Date.now()}.pdf`;
  const filepath = path.join(REPORT_DIR, filename);

  const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: `STRUCTURE X Mission Report – ${mission.name}`, Author: generatedBy || 'STRUCTURE X', Subject: 'Preliminary inspection report' } });
  const stream = fs.createWriteStream(filepath);
  doc.pipe(stream);
  doc.on('pageAdded', () => pageHeader(doc, true));
  pageHeader(doc, false);

  // ---- Title block
  doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(20).text(mission.name, M, doc.y, { width: doc.page.width - 2 * M });
  doc.moveDown(0.2);
  const sc = { completed: C.green, active: C.orange, paused: C.amber, aborted: C.red, planned: C.grey }[mission.status];
  doc.fillColor(sc).font('Helvetica-Bold').fontSize(9).text(`MISSION #${mission.id}  ·  ${mission.status.toUpperCase()}`, { characterSpacing: 1 });
  doc.moveDown(0.8);
  kvGrid(doc, [
    ['Mission ID', `STX-M${String(mission.id).padStart(4, '0')}`],
    ['Building / location', mission.location || '—'],
    ['Operator', mission.operator || '—'],
    ['Organisation', opts.organization || '—'],
    ['Mission start', fmtDate(mission.started_at)],
    ['Mission end', mission.ended_at ? fmtDate(mission.ended_at) : mission.status === 'active' || mission.status === 'paused' ? 'In progress at report time' : '—'],
    ['Duration', fmtDur(end - start)],
    ['Report generated', fmtDate(Date.now())],
  ]);

  // ---- Notice
  ensure(doc, 60);
  const ny = doc.y;
  doc.rect(M, ny, doc.page.width - 2 * M, 48).fill('#FFF4EC');
  doc.rect(M, ny, 3, 48).fill(C.orange);
  doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(8).text('PRELIMINARY FINDINGS ONLY', M + 12, ny + 7);
  doc.font('Helvetica').fontSize(7.8).text('Sensor-based observations in this report come from low-cost sensors (MQ-2, DHT22, HC-SR04, PIR) and are preliminary environmental indicators. The MQ-2 does not identify specific toxic gases. This report is not a structural-integrity assessment and does not establish that any site is safe to enter.', M + 12, ny + 18, { width: doc.page.width - 2 * M - 22, lineGap: 1.5 });
  doc.y = ny + 58;

  // ---- Summary
  section(doc, 'Mission summary');
  para(doc, mission.description || 'No description provided.');
  doc.moveDown(0.6);
  kvGrid(doc, [
    ['Sensor samples recorded', stats.readings.n],
    ['Robot movement commands', stats.commands],
    ['Photographs captured', stats.snapshots],
    ['Caution / danger events', `${stats.riskEvents} (${stats.dangerEvents} danger)`],
    ['PIR motion events', stats.motionEvents],
    ['Operator notes', stats.notes],
  ]);

  // ---- Environmental summary
  section(doc, 'Environmental sensor summary (preliminary)');
  const r = stats.readings;
  table(doc, [{ label: 'Sensor', w: 0.3 }, { label: 'Min', w: 0.17 }, { label: 'Average', w: 0.18 }, { label: 'Max', w: 0.17 }, { label: 'Unit', w: 0.18 }], [
    ['Temperature (DHT22)', n1(r.tmin), n1(r.tavg), n1(r.tmax), '°C'],
    ['Humidity (DHT22)', n1(r.hmin), n1(r.havg), n1(r.hmax), '% RH'],
    ['Gas / smoke (MQ-2 raw)', n0(r.gmin), n0(r.gavg), n0(r.gmax), 'ADC counts (0-4095)'],
    ['Closest obstacle (HC-SR04)', n1(r.dmin), '—', '—', 'cm'],
  ]);
  const series = (k) => readings.map((x) => ({ t: x.ts, v: x[k] }));
  lineChart(doc, { title: 'Temperature', unit: '°C', data: series('temperature'), color: C.orange, thresholds: [{ v: settings.sensors.tempWarning, color: C.amber, label: 'warning' }, { v: settings.sensors.tempCritical, color: C.red, label: 'critical' }] });
  lineChart(doc, { title: 'Gas / smoke sensor (MQ-2 raw)', unit: 'counts', data: series('gas'), color: '#2563EB', thresholds: [{ v: settings.sensors.gasWarning, color: C.amber, label: 'warning' }, { v: settings.sensors.gasCritical, color: C.red, label: 'critical' }] });

  // ---- Risk
  section(doc, 'Risk assessment history (preliminary)');
  const tl = timeInLevels(risk, start, end);
  const totalT = tl.SAFE + tl.CAUTION + tl.DANGER || 1;
  kvGrid(doc, [
    ['Time with no threshold exceeded', `${fmtDur(tl.SAFE)} (${Math.round((tl.SAFE / totalT) * 100)}%)`],
    ['Time in CAUTION', `${fmtDur(tl.CAUTION)} (${Math.round((tl.CAUTION / totalT) * 100)}%)`],
    ['Time in DANGER', `${fmtDur(tl.DANGER)} (${Math.round((tl.DANGER / totalT) * 100)}%)`],
    ['Configured thresholds', `Gas ${settings.sensors.gasWarning}/${settings.sensors.gasCritical}; Temp ${settings.sensors.tempWarning}/${settings.sensors.tempCritical} °C`],
  ]);
  if (risk.length) {
    table(doc, [{ label: 'Time', w: 0.2 }, { label: 'Level', w: 0.12, bold: true, color: (v) => LEVEL_COLOR[v] }, { label: 'Reason', w: 0.56 }, { label: 'Ack', w: 0.12 }],
      risk.map((e) => [fmtDate(e.ts), e.level, JSON.parse(e.reasons || '[]')[0]?.text ?? '', e.acknowledged ? 'Yes' : e.level === 'SAFE' ? 'n/a' : 'No']));
  } else para(doc, 'No risk-level transitions were recorded during this mission.', { color: C.grey });

  // ---- Photos
  if (opts.includePhotos) {
    section(doc, `Captured photographs (${snaps.length}${snapTotal > snaps.length ? ` of ${snapTotal} shown` : ''})`);
    if (!snaps.length) para(doc, 'No photographs were captured during this mission.', { color: C.grey });
    const cw = (doc.page.width - 2 * M - 14) / 2;
    const ch = cw * 0.75;
    for (let i = 0; i < snaps.length; i += 2) {
      ensure(doc, ch + 52);
      const y = doc.y;
      snaps.slice(i, i + 2).forEach((s, j) => {
        const x = M + j * (cw + 14);
        try {
          doc.image(snapshotPath(s), x, y, { fit: [cw, ch], align: 'center', valign: 'center' });
        } catch {
          doc.rect(x, y, cw, ch).fill(C.paper);
        }
        doc.rect(x, y, cw, ch).lineWidth(0.5).strokeColor(C.light).stroke();
        doc.fillColor(C.dark).font('Helvetica-Bold').fontSize(7.8).text(`#${s.id}  ·  ${fmtDate(s.ts)}`, x, y + ch + 4, { width: cw, lineBreak: false });
        doc.fillColor(LEVEL_COLOR[s.risk_level] || C.grey).font('Helvetica-Bold').fontSize(7).text(`Risk at capture: ${s.risk_level ?? '—'}`, x, y + ch + 14, { width: cw, lineBreak: false });
        if (s.note) doc.fillColor(C.grey).font('Helvetica').fontSize(7.5).text(s.note, x, y + ch + 24, { width: cw, height: 20, ellipsis: true });
      });
      doc.y = y + ch + 48;
    }
  }

  // ---- Events
  section(doc, 'Important event log');
  if (events.length) {
    table(doc, [{ label: 'Time', w: 0.2 }, { label: 'Severity', w: 0.1, bold: true, color: (v) => ({ warning: C.amber, error: C.red, critical: C.red }[v] || C.grey) }, { label: 'Type', w: 0.17 }, { label: 'Description', w: 0.53 }],
      events.map((e) => [fmtDate(e.ts), e.severity, e.type, e.description]));
  } else para(doc, 'No notable events recorded.', { color: C.grey });

  // ---- Observations
  section(doc, 'Inspection observations and final notes');
  if (mission.notes) {
    para(doc, 'Mission inspection notes', { bold: true, size: 9 });
    para(doc, mission.notes);
    doc.moveDown(0.6);
  }
  if (notes.length) {
    for (const n of notes) {
      ensure(doc, 34);
      doc.fillColor(C.grey).font('Helvetica').fontSize(7.5).text(`${fmtDate(n.ts)} · ${n.operator || 'Operator'}`, M, doc.y);
      para(doc, n.text);
      doc.moveDown(0.4);
    }
  } else if (!mission.notes) para(doc, 'No operator observations were recorded.', { color: C.grey });

  doc.moveDown(1);
  ensure(doc, 70);
  const sy = doc.y;
  doc.moveTo(M, sy + 30).lineTo(M + 200, sy + 30).lineWidth(0.6).strokeColor(C.grey).stroke();
  doc.moveTo(doc.page.width - M - 200, sy + 30).lineTo(doc.page.width - M, sy + 30).stroke();
  doc.fillColor(C.grey).font('Helvetica').fontSize(7.5).text(`Operator: ${mission.operator || ''}`, M, sy + 34).text('Reviewed by / date', doc.page.width - M - 200, sy + 34);
  doc.y = sy + 60;

  // ---- Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // allow drawing in the footer zone without triggering auto page-break
    const fy = doc.page.height - 34;
    doc.moveTo(M, fy - 6).lineTo(doc.page.width - M, fy - 6).lineWidth(0.5).strokeColor(C.light).stroke();
    doc.fillColor(C.grey).font('Helvetica').fontSize(7);
    doc.text(`STRUCTURE X · Mission M${mission.id} · Preliminary sensor-based findings – not a safety clearance${opts.footerNote ? ` · ${opts.footerNote}` : ''}`, M, fy, { width: doc.page.width - 2 * M - 60, lineBreak: false });
    doc.text(`Page ${i + 1} / ${range.count}`, doc.page.width - M - 60, fy, { width: 60, align: 'right', lineBreak: false });
  }

  doc.end();
  await new Promise((res, rej) => {
    stream.on('finish', res);
    stream.on('error', rej);
  });

  const size = fs.statSync(filepath).size;
  const rr = run('INSERT INTO reports(mission_id,created_at,filename,size_bytes,generated_by) VALUES(?,?,?,?,?)', mission.id, Date.now(), filename, size, generatedBy || settings.mission.operatorName);
  logEvent({ type: 'report', severity: 'info', description: `PDF report generated for mission "${mission.name}"`, missionId: mission.id });
  return getReport(Number(rr.lastInsertRowid));
}

export function getReport(id) {
  const r = get('SELECT r.*, m.name AS mission_name FROM reports r JOIN missions m ON m.id = r.mission_id WHERE r.id = ?', Number(id));
  if (!r) throw new HttpError(404, 'Report not found');
  return r;
}
export const reportPath = (r) => path.join(REPORT_DIR, path.basename(r.filename));
export const listReports = ({ missionId } = {}) =>
  missionId
    ? all('SELECT r.*, m.name AS mission_name FROM reports r JOIN missions m ON m.id=r.mission_id WHERE r.mission_id=? ORDER BY r.created_at DESC', Number(missionId))
    : all('SELECT r.*, m.name AS mission_name FROM reports r JOIN missions m ON m.id=r.mission_id ORDER BY r.created_at DESC LIMIT 200');

export function deleteReport(id) {
  const r = getReport(id);
  try {
    fs.unlinkSync(reportPath(r));
  } catch {
    /* already gone */
  }
  run('DELETE FROM reports WHERE id=?', r.id);
}
