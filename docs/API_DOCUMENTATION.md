# API

## Main ESP32 (firmware, port 80, all GET, CORS enabled)
| Endpoint | Purpose |
|---|---|
| `/cmd?d=F\|B\|L\|R\|S` | drive; must repeat every <900 ms or the firmware stops the motors |
| `/speed?v=100..255` | PWM speed |
| `/servo?s=L\|R\|BOTH&a=0..180` | flipper angle (device angle) |
| `/data` | JSON: `distance, temperature, humidity, gas, gasWarmup, motion, movement, risk, speed, servoL, servoR, uptime` (invalid ⇒ `null`) |

Paths are templates in Settings → Network → Endpoint paths (`{dir}`, `{value}`, `{servo}`, `{angle}`).

## ESP32-CAM
`:81/stream` MJPEG · `:80/capture` JPEG · `:80/status` · `:80/quality?q=..&size=..`

## Backend REST (`/api`)
Control: `POST /control/move {dir}` · `/control/stop` · `/control/estop` · `/control/rearm` · `/control/speed {value}` · `/control/servo {servo, angle|action, calibrate?}`
System: `GET /health /state /settings /telemetry/history /risk /risk/trend /events /events/types` · `PUT /settings` · `POST /settings/reset` · `POST /connections/reconnect`
Risk: `GET /risk/events` · `POST /risk/events/:id/ack`
Missions: `GET/POST /missions` · `GET/PATCH/DELETE /missions/:id` · `POST /missions/:id/{start|pause|resume|complete|abort}` · `/notes` · `GET /readings /events /risk /snapshots /movements` · `POST /missions/:id/report`
Snapshots: `GET /snapshots` · `POST /snapshots/capture` · `GET /snapshots/:id/image` · `PATCH/DELETE /snapshots/:id`
Reports: `GET /reports` · `GET /reports/:id/download[?inline=1]` · `DELETE /reports/:id`
Camera: `GET /camera/stream` (proxied MJPEG) · `/camera/status` · `POST /camera/reconnect`

## WebSocket `/ws`
Client → server: `hello`, `ping`, `move {dir,seq}`, `stop`, `estop`. Server → client: `state`, `telemetry`, `robot`, `connections`, `risk`, `mission`, `settings`, `event`, `ack`, `pong`.

## Safety behaviour
Heartbeat 200 ms (browser) → watchdog 600 ms (backend) → watchdog 900 ms (firmware). One device holds the drive lease at a time; STOP/E-STOP from any device always works. E-STOP latches until **Re-arm**. A mission left active across a backend restart is resumed as *paused*, never silently recording.
