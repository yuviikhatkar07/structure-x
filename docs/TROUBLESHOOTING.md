# Troubleshooting

| Symptom | Check |
|---|---|
| ESP32 dot red / "control unavailable" | Device on STRUCTURE_X? Open `http://192.168.4.1/data` in a browser. Backend `Robot API` URL correct? Demo mode off? |
| Backend unreachable banner | Backend running (`npm run dev`)? Phone using the laptop's Network URL, firewall allows 8080? |
| No camera image | Open `http://192.168.4.2:81/stream` directly. Camera powered from ≥500 mA 5 V? Joined AP *after* main ESP32 boot? Press **Retry**. Only one stream client at a time is reliable on ESP32-CAM — the backend shares one upstream stream among viewers. |
| Camera reboots / garbled | Brown-out: improve 5 V supply, add 470 µF cap, lower quality (`/quality?q=20&size=QVGA`). |
| Robot keeps moving after release | Should never exceed ~0.9 s. Verify firmware flashed (serial prints `watchdog stop`). Use the physical E-STOP. |
| Robot jerks / stops while driving | Wi-Fi congestion: reduce camera size; check RSSI via `/status`. |
| Directions reversed | Swap a motor's two wires, or swap IN pins in firmware. |
| Flipper moves wrong way / hits frame | Settings → Flipper calibration; tick *Mounted inverted*; set Min/Max inside mechanical stops. |
| Distance shows NO DATA | Echo timeout/out of range or ECHO not level-shifted; wiring. |
| Gas reading high at start | MQ-2 warm-up; allow minutes, burn-in 24 h for real calibration. |
| Humidity "not reported" | Firmware without DHT humidity field. |
| `better-sqlite3` install fails | Install Node 20/22 LTS and build tools (see SETUP). |
| Data after restart | `backend/data/`; active mission resumes as *paused*. |
| Snapshot fails in demo | Demo uses a labelled synthetic frame; real photos need hardware. |

Do not claim hardware tests passed until you have run the commissioning checklist in `SETUP.md` on the real robot.
