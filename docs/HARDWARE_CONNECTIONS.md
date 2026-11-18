# Hardware connections

## Main ESP32 DevKit V1
| Function | Pin | Notes |
|---|---|---|
| L298N ENA (left PWM) | GPIO25 | remove the ENA jumper |
| L298N IN1 / IN2 | GPIO26 / GPIO27 | |
| L298N ENB (right PWM) | GPIO33 | remove the ENB jumper |
| L298N IN3 / IN4 | GPIO19 / GPIO18 | |
| Left flipper servo signal | GPIO16 | servo power from a **separate 5 V BEC**, common GND |
| Right flipper servo signal | GPIO17 | |
| HC-SR04 TRIG | GPIO23 | |
| HC-SR04 ECHO | GPIO34 | **ECHO is 5 V → divide to 3.3 V** (e.g. 1 kΩ + 2 kΩ) |
| MQ-2 AO | GPIO36 (VP) | AO can reach 5 V → divider; ADC1 pin (ADC2 is unusable with Wi-Fi) |
| DHT22 DATA | GPIO4 | 10 kΩ pull-up to 3.3 V |
| PIR OUT | GPIO22 | 3.3 V output type, or divide |

GPIO12 / 0 / 2 / 15 are deliberately unused (boot-strapping pins).

## ESP32-CAM (AI Thinker)
Standard AI-Thinker pin map is built into the sketch. Power: 5 V pin + GND (≥500 mA). Static IP 192.168.4.2.

## Power
- Motors: L298N from the motor battery **through a physical E-STOP switch** (mushroom, latching, rated for motor stall current).
- L298N drops ~1.4–2 V and handles 2 A/channel — check your gearmotor stall current; a MOSFET/ BTS7960-type driver is safer for heavy motors.
- Logic: ESP32 + camera from a regulated 5 V; servos from their own BEC; **all grounds common**.
- Battery telemetry is **not implemented** (no sensor in the hardware list). Add a voltage divider on an ADC1 pin and a `"battery"` (0–100) field to `/data` and the UI shows it automatically.

## Missing/optional hardware
- No hardware = no battery %, no camera zoom, no recording (not claimed by the app).
- MQ-2 needs 24–48 h burn-in and clean-air calibration for meaningful thresholds; it is not a toxic-gas detector. A CO / VOC / O₂ sensor would be needed for those hazards.
