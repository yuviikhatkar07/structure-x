/*
 * STRUCTURE X — Main controller firmware (ESP32 DevKit V1)
 * Arduino-ESP32 core 3.x (2.x also supported via the macro below)
 * Libraries: "ESP32Servo" (Kevin Harrington), "DHT sensor library" (Adafruit) + "Adafruit Unified Sensor"
 *
 * Creates Wi-Fi AP  SSID: STRUCTURE_X   PASS: structure123   IP: 192.168.4.1
 * HTTP API (all GET, CORS enabled):
 *   /cmd?d=F|B|L|R|S        drive (needs repeating every <900 ms or motors stop — WATCHDOG)
 *   /speed?v=100..255       PWM speed
 *   /servo?s=L|R|BOTH&a=0..180
 *   /data                   JSON telemetry
 * Pin map: see docs/HARDWARE_CONNECTIONS.md
 */
#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <DHT.h>

// ---------------- configuration ----------------
const char* AP_SSID = "STRUCTURE_X";
const char* AP_PASS = "structure123";          // >= 8 characters. CHANGE for real deployments.
IPAddress AP_IP(192, 168, 4, 1), AP_GW(192, 168, 4, 1), AP_MASK(255, 255, 255, 0);

const uint32_t DRIVE_WATCHDOG_MS = 900;        // stop motors if no drive command within this time
const uint32_t GAS_WARMUP_MS     = 20000;      // MQ-2 needs warm-up; readings flagged until then (use 24h+ burn-in for real calibration)
const int SERVO_MIN_DEG = 0, SERVO_MAX_DEG = 180; // hard limits only; the app enforces calibrated limits
const int SPEED_MIN = 0, SPEED_MAX = 255;

// ---------------- pins (ESP32 DevKit V1) ----------------
// L298N — left track
const int ENA = 25, IN1 = 26, IN2 = 27;
// L298N — right track
const int ENB = 33, IN3 = 19, IN4 = 18;
// Flipper servos
const int SERVO_L_PIN = 16, SERVO_R_PIN = 17;
// HC-SR04  (ECHO is 5 V -> MUST use a divider/level shifter to 3.3 V)
const int TRIG_PIN = 23, ECHO_PIN = 34;
// MQ-2 analog out (ADC1 only; AO can reach 5 V -> use divider)
const int MQ2_PIN = 36;
// DHT22
const int DHT_PIN = 4;
// PIR
const int PIR_PIN = 22;

// ---------------- state ----------------
WebServer server(80);
DHT dht(DHT_PIN, DHT22);
Servo servoL, servoR;

char moveState = 'S';
int speedPwm = 170;
int angL = 90, angR = 90;
uint32_t lastDriveMs = 0;
uint32_t bootMs = 0;

float distanceCm = NAN, tempC = NAN, hum = NAN;
int gasRaw = -1;
bool motion = false;
uint32_t tUltra = 0, tGas = 0, tDht = 0;

#if ESP_ARDUINO_VERSION_MAJOR >= 3
  #define PWM_ATTACH(pin, ch) ledcAttach(pin, 1000, 8)
  #define PWM_WRITE(pin, ch, v) ledcWrite(pin, v)
#else
  #define PWM_ATTACH(pin, ch) do { ledcSetup(ch, 1000, 8); ledcAttachPin(pin, ch); } while (0)
  #define PWM_WRITE(pin, ch, v) ledcWrite(ch, v)
#endif

// ---------------- helpers ----------------
void cors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Private-Network", "true");
  server.sendHeader("Cache-Control", "no-store");
}
void reply(int code, const String& body, const char* type = "application/json") { cors(); server.send(code, type, body); }

void setMotors(int l, int r) {           // -255..255 each
  digitalWrite(IN1, l > 0); digitalWrite(IN2, l < 0);
  digitalWrite(IN3, r > 0); digitalWrite(IN4, r < 0);
  PWM_WRITE(ENA, 0, abs(l));
  PWM_WRITE(ENB, 1, abs(r));
}
void drive(char d) {
  moveState = d;
  int s = speedPwm;
  switch (d) {
    case 'F': setMotors(s, s); break;
    case 'B': setMotors(-s, -s); break;
    case 'L': setMotors(-s, s); break;    // pivot left
    case 'R': setMotors(s, -s); break;    // pivot right
    default:  setMotors(0, 0); moveState = 'S'; break;
  }
}

// ---------------- sensors (non-blocking cadence; /data serves cached values) ----------------
float readUltrasonic() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(3);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long us = pulseIn(ECHO_PIN, HIGH, 25000);  // 25 ms timeout ≈ 4.3 m
  if (us == 0) return NAN;                             // no echo => INVALID (never reported as 0)
  float cm = us * 0.0343f / 2.0f;
  return (cm < 2.0f || cm > 400.0f) ? NAN : cm;
}
void sampleSensors() {
  uint32_t now = millis();
  if (now - tUltra >= 120) { tUltra = now; distanceCm = readUltrasonic(); }
  if (now - tGas >= 250)   { tGas = now; gasRaw = analogRead(MQ2_PIN); }
  if (now - tDht >= 2200)  { tDht = now; tempC = dht.readTemperature(); hum = dht.readHumidity(); }
  motion = digitalRead(PIR_PIN) == HIGH;
}
String num(float v, int d = 1) { return isnan(v) ? "null" : String(v, d); }

// ---------------- handlers ----------------
void hCmd() {
  if (!server.hasArg("d") || server.arg("d").length() < 1) return reply(400, "{\"ok\":false,\"error\":\"missing d\"}");
  char d = toupper(server.arg("d")[0]);
  if (d != 'F' && d != 'B' && d != 'L' && d != 'R' && d != 'S') return reply(400, "{\"ok\":false,\"error\":\"bad direction\"}");
  drive(d);
  lastDriveMs = millis();
  reply(200, String("{\"ok\":true,\"dir\":\"") + moveState + "\"}");
}
void hSpeed() {
  if (!server.hasArg("v")) return reply(400, "{\"ok\":false,\"error\":\"missing v\"}");
  speedPwm = constrain(server.arg("v").toInt(), SPEED_MIN, SPEED_MAX);
  if (moveState != 'S') drive(moveState);
  reply(200, String("{\"ok\":true,\"speed\":") + speedPwm + "}");
}
void hServo() {
  if (!server.hasArg("s") || !server.hasArg("a")) return reply(400, "{\"ok\":false,\"error\":\"missing s or a\"}");
  String s = server.arg("s"); s.toUpperCase();
  if (s != "L" && s != "R" && s != "BOTH") return reply(400, "{\"ok\":false,\"error\":\"s must be L, R or BOTH\"}");
  int a = constrain(server.arg("a").toInt(), SERVO_MIN_DEG, SERVO_MAX_DEG);
  if (s == "L" || s == "BOTH") { angL = a; servoL.write(a); }
  if (s == "R" || s == "BOTH") { angR = a; servoR.write(a); }
  reply(200, String("{\"ok\":true,\"servoL\":") + angL + ",\"servoR\":" + angR + "}");
}
void hData() {
  uint32_t up = (millis() - bootMs) / 1000;
  long warm = (long)GAS_WARMUP_MS - (long)(millis() - bootMs);
  const char* risk = "SAFE";                       // coarse on-device hint only; the app does the real assessment
  if (gasRaw > 1200 || (!isnan(tempC) && tempC > 55)) risk = "DANGER";
  else if (gasRaw > 800 || (!isnan(tempC) && tempC > 40)) risk = "CAUTION";
  String j = "{";
  j += "\"distance\":" + num(distanceCm) + ",";
  j += "\"temperature\":" + num(tempC) + ",";
  j += "\"humidity\":" + num(hum) + ",";
  j += "\"gas\":" + (gasRaw < 0 ? String("null") : String(gasRaw)) + ",";
  j += "\"gasWarmup\":" + String(warm > 0 ? warm / 1000 : 0) + ",";
  j += "\"motion\":" + String(motion ? 1 : 0) + ",";
  j += "\"movement\":\"" + String(moveState) + "\",";
  j += "\"risk\":\"" + String(risk) + "\",";
  j += "\"speed\":" + String(speedPwm) + ",";
  j += "\"servoL\":" + String(angL) + ",\"servoR\":" + String(angR) + ",";
  j += "\"uptime\":" + String(up) + "}";
  reply(200, j);
}
void hOptions() { cors(); server.send(204); }

void setup() {
  Serial.begin(115200);
  bootMs = millis();
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  PWM_ATTACH(ENA, 0); PWM_ATTACH(ENB, 1);
  setMotors(0, 0);                                  // motors OFF first, always
  pinMode(TRIG_PIN, OUTPUT); pinMode(ECHO_PIN, INPUT); pinMode(PIR_PIN, INPUT);
  analogReadResolution(12);
  dht.begin();
  ESP32PWM::allocateTimer(2); ESP32PWM::allocateTimer(3);
  servoL.setPeriodHertz(50); servoR.setPeriodHertz(50);
  servoL.attach(SERVO_L_PIN, 500, 2400); servoR.attach(SERVO_R_PIN, 500, 2400);
  servoL.write(angL); servoR.write(angR);

  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(AP_IP, AP_GW, AP_MASK);
  WiFi.softAP(AP_SSID, AP_PASS, 6, 0, 4);
  Serial.printf("AP %s up at %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());

  server.on("/cmd", HTTP_GET, hCmd);
  server.on("/speed", HTTP_GET, hSpeed);
  server.on("/servo", HTTP_GET, hServo);
  server.on("/data", HTTP_GET, hData);
  server.onNotFound([]() { if (server.method() == HTTP_OPTIONS) hOptions(); else reply(404, "{\"ok\":false,\"error\":\"not found\"}"); });
  server.begin();
}

void loop() {
  server.handleClient();
  sampleSensors();
  // SAFETY WATCHDOG: no drive command recently => stop. Independent of the website/backend.
  if (moveState != 'S' && millis() - lastDriveMs > DRIVE_WATCHDOG_MS) { drive('S'); Serial.println("watchdog stop"); }
  // SAFETY: Wi-Fi client count 0 while moving => stop (operator device gone).
  static uint32_t tChk = 0;
  if (millis() - tChk > 500) { tChk = millis(); if (moveState != 'S' && WiFi.softAPgetStationNum() == 0) drive('S'); }
}
