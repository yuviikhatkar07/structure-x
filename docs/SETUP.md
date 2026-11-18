# Setup

## 1. Software
```bash
node -v          # >= 18.18 (22+ recommended)
npm install      # installs backend + frontend workspaces
npm run demo     # UI + simulated robot
npm run dev      # UI (http://localhost:5173) + backend (:8080), hardware mode
npm run build && npm start   # production: single port 8080
```
Environment variables (backend): `PORT` (8080), `HOST` (0.0.0.0), `DATA_DIR` (backend/data), `DEMO=1`.
Data (SQLite DB, snapshot JPEGs, PDF reports) lives in `backend/data/` and survives restarts. Back this folder up.

`better-sqlite3` ships prebuilt binaries for common platforms; if the install tries to compile, install build tools (`python3`, `make`, `g++`; on Windows "Desktop development with C++").

## 2. Firmware
Arduino IDE ≥ 2.x, **esp32 board package 3.x** (Espressif).

**Main ESP32** (`hardware/main_esp32/main_esp32.ino`): board *ESP32 Dev Module*. Libraries: `ESP32Servo`, `DHT sensor library`, `Adafruit Unified Sensor`. Edit `AP_PASS` before real use.

**ESP32-CAM** (`hardware/esp32_cam/esp32_cam.ino`): board *AI Thinker ESP32-CAM*, PSRAM *Enabled*, partition *Huge APP*. Upload with an FTDI adapter (IO0 → GND while flashing, then remove and reset). Power from a stable 5 V ≥ 500 mA (weak supplies cause brown-outs/reboots).
Boot order: power the main ESP32 first (it creates the Wi-Fi), then the camera joins at `192.168.4.2`.

## 3. First connection
1. Join Wi-Fi `STRUCTURE_X` on the operator device (it will have no internet — expected).
2. `npm run dev`; open the printed URL.
3. Settings → turn **Demo mode OFF** → check green ESP32/CAM indicators.
4. Optional checks: `http://192.168.4.1/data` and `http://192.168.4.2:81/stream` open directly in a browser.

## 4. Commissioning checklist (do with wheels off the ground)
- [ ] Physical E-STOP cuts motor power.
- [ ] Forward/back/left/right match the UI (swap motor wires or IN pins if reversed).
- [ ] Releasing a control stops within ~0.3 s; unplugging the Wi-Fi stops within ~1 s.
- [ ] Flipper calibration done (Settings → Flipper calibration).
- [ ] MQ-2 warmed up; thresholds tuned in clean air.
