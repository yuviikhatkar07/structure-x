# STRUCTURE X — Advanced Disaster Inspection System

Command-and-control web application for an ESP32 post-disaster inspection rover: live ESP32-CAM video, manual drive + climbing flippers, environmental sensors, preliminary risk warnings, inspection missions, photo gallery, event log and PDF reports. Works from laptop, tablet and phone (separate desktop and mobile layouts, same backend and database).

> **Safety first.** Software stops are never a substitute for a **physical motor-power emergency switch**. Fit one in series with the L298N motor supply. The risk module is a *preliminary environmental warning system*: an MQ-2 does not identify all toxic gases, and none of these sensors can certify structural integrity or that a site is safe.

## Architecture

```
 Phone / laptop ──(Wi-Fi: STRUCTURE_X)──┐
   browser UI  ⇄  Node backend (Express + WebSocket + SQLite)  ──HTTP──▶ Main ESP32  192.168.4.1
   http://localhost:8080 (or :5173 dev)                         ──HTTP──▶ ESP32-CAM   192.168.4.2 (:81 stream)
```

The browser only talks to the backend (same origin → no CORS / mixed-content problems). The backend runs **on the operator device** (or any machine joined to the robot Wi-Fi) and relays to the robot. An externally hosted website can **not** reach `192.168.4.x`; see `docs/NETWORK_SETUP.md`.

| Folder | Contents |
|---|---|
| `frontend/` | React + TypeScript + Vite + Tailwind + Recharts + Lucide |
| `backend/` | Express, WebSocket hub, SQLite (migrations), control/watchdog, telemetry, risk, missions, snapshots, PDF reports |
| `hardware/main_esp32/` | Main controller firmware (AP, motors, servos, sensors, watchdog) |
| `hardware/esp32_cam/` | AI-Thinker camera firmware (MJPEG on :81, `/capture`) |
| `docs/` | Setup, hardware wiring, API, network, troubleshooting |

## Quick start

Requires Node.js ≥ 18.18 (22+ recommended).

```bash
cd STRUCTURE-X
npm install
npm run demo        # simulated robot, no hardware — explore the UI
# open http://localhost:5173   (use the Network URL printed by the backend on a phone)

npm run dev         # real hardware mode (join the STRUCTURE_X Wi-Fi first)
```

Production build (backend serves the UI on one port):

```bash
npm run build
npm start           # http://localhost:8080   (npm run start:demo for demo mode)
```

Backend tests (no hardware needed): `npm test -w backend`.

## First run with the robot

1. Flash both boards (`docs/SETUP.md`), wire per `docs/HARDWARE_CONNECTIONS.md`.
2. Power the robot, connect the laptop/phone to Wi-Fi **STRUCTURE_X** (password `structure123` — change it).
3. `npm run dev` (or `npm start`), open the app, **Settings → Operating mode: turn Demo OFF**.
4. Check the top bar: ESP32 and CAM dots go green. Run **Settings → Flipper calibration** before using the flippers.
5. Test drive with wheels lifted off the ground first.

## Features at a glance
- Live MJPEG camera with timestamp overlay, fullscreen (landscape controls overlay), auto-retry, snapshots + gallery.
- Hold-to-drive D-pad / joystick / WASD+arrows; release, tab-hide, blur, disconnect or `Space` ⇒ STOP; 200 ms heartbeat, 600 ms backend watchdog, 900 ms firmware watchdog; contradictory inputs resolve to STOP; success shown only after ESP32 acknowledgement.
- Flipper control with per-servo limits, inversion and a guided calibration procedure.
- Sensor telemetry (HC-SR04, MQ-2, DHT22, PIR); invalid readings show NO DATA, never 0.
- SAFE / CAUTION / DANGER with reasons, acknowledgment, trend and history; thresholds configurable.
- Missions (planned/active/paused/completed/aborted) auto-attach readings, risk events, movements, photos, notes, events.
- Persistent event log (search/filter/CSV), settings, PDF reports (download/print/history).
- Demo mode (clearly labelled simulated data) for presentations without hardware.

## Honest status
Backend unit/integration tests (risk, telemetry, settings, missions, control safety, watchdog, e-stop, flipper limits) pass against the simulated device. **Nothing here has been verified on physical hardware** — treat the first drive test as a commissioning test (see `docs/TROUBLESHOOTING.md`).
