/**
 * CNC Web UI — MCU demo firmware (JSON line protocol)
 *
 * Board: ESP32 / STM32 / Arduino with USB CDC (USB Type-C cable to PC)
 * Serial: 115200 baud, newline-delimited JSON
 *
 * Host sends:  {"cmd":"jog","axis":"X","dir":1,"step":0.01,"rapid":false}
 * MCU replies: {"evt":"status","machine":"IDLE","x":0,"y":0,"z":0,"spindle":0}
 *
 * Upload with Arduino IDE or PlatformIO. Select the correct USB CDC port.
 */

#include <ArduinoJson.h>

static float posX = 0, posY = 0, posZ = 0;
static float spindleRpm = 0;
static String machineState = "IDLE";
static String lastMdiId;

void sendJson(const JsonDocument& doc) {
  serializeJson(doc, Serial);
  Serial.println();
}

void sendHello() {
  StaticJsonDocument<128> doc;
  doc["evt"] = "hello";
  doc["firmware"] = "cnc-mcu-demo-1.0";
  doc["board"] = "ESP32-USB";
  sendJson(doc);
}

void sendStatus() {
  StaticJsonDocument<192> doc;
  doc["evt"] = "status";
  doc["machine"] = machineState;
  doc["x"] = posX;
  doc["y"] = posY;
  doc["z"] = posZ;
  doc["spindle"] = spindleRpm;
  doc["tempC"] = 25.0f + (millis() % 100) / 10.0f;
  sendJson(doc);
}

void sendMdiDone(const char* id, const char* status, const char* detail = nullptr) {
  StaticJsonDocument<256> doc;
  doc["evt"] = "mdi_done";
  if (id && strlen(id)) doc["id"] = id;
  doc["status"] = status;
  if (detail) doc["detail"] = detail;
  doc["x"] = posX;
  doc["y"] = posY;
  doc["z"] = posZ;
  sendJson(doc);
}

bool parseGcodeMove(const String& line) {
  // Very small subset: G0/G1 X Y Z F
  int xi = line.indexOf('X');
  int yi = line.indexOf('Y');
  int zi = line.indexOf('Z');
  if (xi >= 0) posX = line.substring(xi + 1).toFloat();
  if (yi >= 0) posY = line.substring(yi + 1).toFloat();
  if (zi >= 0) posZ = line.substring(zi + 1).toFloat();
  return true;
}

void handleCommand(JsonDocument& doc) {
  const char* cmd = doc["cmd"] | "";
  if (strcmp(cmd, "ping") == 0) {
    sendHello();
    return;
  }
  if (strcmp(cmd, "estop") == 0) {
    machineState = "ESTOP";
    spindleRpm = 0;
    sendStatus();
    return;
  }
  if (strcmp(cmd, "reset") == 0) {
    machineState = "IDLE";
    sendStatus();
    return;
  }
  if (strcmp(cmd, "feed_hold") == 0) {
    machineState = "PAUSED";
    sendStatus();
    return;
  }
  if (strcmp(cmd, "home") == 0) {
    posX = posY = posZ = 0;
    machineState = "IDLE";
    sendStatus();
    return;
  }
  if (strcmp(cmd, "jog") == 0) {
    const char* axis = doc["axis"] | "X";
    int dir = doc["dir"] | 1;
    float step = doc["step"] | 0.01f;
    bool rapid = doc["rapid"] | false;
    float dist = (rapid ? step * 50.0f : step) * (dir < 0 ? -1.0f : 1.0f);
    if (axis[0] == 'X') posX += dist;
    else if (axis[0] == 'Y') posY += dist;
    else if (axis[0] == 'Z') posZ += dist;
    machineState = "IDLE";
    sendStatus();
    return;
  }
  if (strcmp(cmd, "gcode") == 0) {
    const char* line = doc["line"] | "";
    const char* id = doc["id"] | "";
    lastMdiId = id;
    machineState = "EXECUTING";
    sendStatus();

    // Demo soft limit (match UI demo)
    if (strstr(line, "X150") || strstr(line, "X150.")) {
      machineState = "ERROR";
      sendMdiDone(id, "ERR_LIMIT", "LIMIT REACHED");
      return;
    }

    parseGcodeMove(String(line));
    machineState = "IDLE";
    sendMdiDone(id, "SUCCESS");
    return;
  }
}

void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000) { }
  delay(300);
  sendHello();
}

unsigned long lastStatusMs = 0;

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) return;

    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, line);
    if (err) {
      StaticJsonDocument<128> errDoc;
      errDoc["evt"] = "error";
      errDoc["msg"] = "JSON parse error";
      sendJson(errDoc);
      return;
    }
    handleCommand(doc);
  }

  if (millis() - lastStatusMs > 200) {
    lastStatusMs = millis();
    sendStatus();
  }
}
