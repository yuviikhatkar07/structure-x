/*
 * STRUCTURE X — ESP32-CAM (AI Thinker) firmware
 * Board: "AI Thinker ESP32-CAM" · PSRAM: Enabled · Partition: Huge APP
 * Joins Wi-Fi STRUCTURE_X as a station with static IP 192.168.4.2
 *   http://192.168.4.2:81/stream   MJPEG stream (used by the website)
 *   http://192.168.4.2/capture     single JPEG (used for snapshots)
 *   http://192.168.4.2/status      JSON {"ok":true,"rssi":..}
 *   http://192.168.4.2/quality?q=10..63&size=QVGA|VGA|SVGA   (lower q = better quality)
 */
#include "esp_camera.h"
#include <WiFi.h>
#include "esp_http_server.h"

const char* STA_SSID = "STRUCTURE_X";
const char* STA_PASS = "structure123";
IPAddress STA_IP(192, 168, 4, 2), STA_GW(192, 168, 4, 1), STA_MASK(255, 255, 255, 0);

// AI Thinker pin map
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

httpd_handle_t streamHttpd = NULL, ctrlHttpd = NULL;
static const char* BOUNDARY = "\r\n--frame\r\n";
static const char* CT = "multipart/x-mixed-replace;boundary=frame";

static esp_err_t streamHandler(httpd_req_t* req) {
  httpd_resp_set_type(req, CT);
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  char part[64];
  while (true) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) { delay(50); continue; }
    esp_err_t res = httpd_resp_send_chunk(req, BOUNDARY, strlen(BOUNDARY));
    if (res == ESP_OK) { size_t n = snprintf(part, sizeof(part), "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n", fb->len); res = httpd_resp_send_chunk(req, part, n); }
    if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len);
    esp_camera_fb_return(fb);
    if (res != ESP_OK) break;                 // client went away
  }
  return ESP_OK;
}
static esp_err_t captureHandler(httpd_req_t* req) {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { httpd_resp_send_500(req); return ESP_FAIL; }
  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  esp_err_t r = httpd_resp_send(req, (const char*)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return r;
}
static esp_err_t statusHandler(httpd_req_t* req) {
  char b[96]; snprintf(b, sizeof(b), "{\"ok\":true,\"rssi\":%d,\"heap\":%u}", WiFi.RSSI(), ESP.getFreeHeap());
  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  return httpd_resp_send(req, b, strlen(b));
}
static esp_err_t qualityHandler(httpd_req_t* req) {
  char q[64], v[16]; sensor_t* s = esp_camera_sensor_get();
  if (httpd_req_get_url_query_str(req, q, sizeof(q)) == ESP_OK) {
    if (httpd_query_key_value(q, "q", v, sizeof(v)) == ESP_OK) s->set_quality(s, constrain(atoi(v), 10, 63));
    if (httpd_query_key_value(q, "size", v, sizeof(v)) == ESP_OK) {
      framesize_t f = !strcmp(v, "VGA") ? FRAMESIZE_VGA : !strcmp(v, "SVGA") ? FRAMESIZE_SVGA : FRAMESIZE_QVGA;
      s->set_framesize(s, f);
    }
  }
  return statusHandler(req);
}

void startServers() {
  httpd_config_t c = HTTPD_DEFAULT_CONFIG();
  c.server_port = 80; c.ctrl_port = 32768;
  httpd_uri_t cap = {"/capture", HTTP_GET, captureHandler, NULL}, st = {"/status", HTTP_GET, statusHandler, NULL}, ql = {"/quality", HTTP_GET, qualityHandler, NULL};
  if (httpd_start(&ctrlHttpd, &c) == ESP_OK) { httpd_register_uri_handler(ctrlHttpd, &cap); httpd_register_uri_handler(ctrlHttpd, &st); httpd_register_uri_handler(ctrlHttpd, &ql); }
  c.server_port = 81; c.ctrl_port = 32769;
  httpd_uri_t stream = {"/stream", HTTP_GET, streamHandler, NULL};
  if (httpd_start(&streamHttpd, &c) == ESP_OK) httpd_register_uri_handler(streamHttpd, &stream);
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);                        // lower latency
  WiFi.config(STA_IP, STA_GW, STA_MASK);
  WiFi.begin(STA_SSID, STA_PASS);
  uint32_t t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 15000) delay(250);
}

void setup() {
  Serial.begin(115200);
  camera_config_t cfg = {};
  cfg.ledc_channel = LEDC_CHANNEL_0; cfg.ledc_timer = LEDC_TIMER_0;
  cfg.pin_d0 = Y2_GPIO_NUM; cfg.pin_d1 = Y3_GPIO_NUM; cfg.pin_d2 = Y4_GPIO_NUM; cfg.pin_d3 = Y5_GPIO_NUM;
  cfg.pin_d4 = Y6_GPIO_NUM; cfg.pin_d5 = Y7_GPIO_NUM; cfg.pin_d6 = Y8_GPIO_NUM; cfg.pin_d7 = Y9_GPIO_NUM;
  cfg.pin_xclk = XCLK_GPIO_NUM; cfg.pin_pclk = PCLK_GPIO_NUM; cfg.pin_vsync = VSYNC_GPIO_NUM; cfg.pin_href = HREF_GPIO_NUM;
  cfg.pin_sccb_sda = SIOD_GPIO_NUM; cfg.pin_sccb_scl = SIOC_GPIO_NUM;
  cfg.pin_pwdn = PWDN_GPIO_NUM; cfg.pin_reset = RESET_GPIO_NUM;
  cfg.xclk_freq_hz = 20000000; cfg.pixel_format = PIXFORMAT_JPEG;
  if (psramFound()) { cfg.frame_size = FRAMESIZE_VGA; cfg.jpeg_quality = 14; cfg.fb_count = 2; cfg.grab_mode = CAMERA_GRAB_LATEST; }
  else { cfg.frame_size = FRAMESIZE_QVGA; cfg.jpeg_quality = 16; cfg.fb_count = 1; }
  if (esp_camera_init(&cfg) != ESP_OK) { Serial.println("camera init failed"); delay(3000); ESP.restart(); }
  connectWifi();
  startServers();
  Serial.printf("stream: http://%s:81/stream\n", WiFi.localIP().toString().c_str());
}

void loop() {
  // Auto-reconnect to the robot AP (e.g. if the main ESP32 rebooted).
  if (WiFi.status() != WL_CONNECTED) { WiFi.disconnect(); connectWifi(); }
  delay(2000);
}
