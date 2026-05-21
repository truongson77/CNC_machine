/**
 * CNC Web UI — MCU firmware (JSON line protocol @ 115200)
 *
 * HOW IT CONNECTS TO THE WEBSITE
 * ------------------------------
 * 1. Flash this sketch to your MCU (USB Type-C / CDC).
 * 2. On PC:  npm run dev:com12   — Node opens COM12 and bridges to the UI.
 * 3. Open http://localhost:5173 → Controller → press X+, Y-, etc.
 * 4. Node sends JSON to MCU; MCU prints JSON replies (see SERIAL_DEBUG in server terminal).
 *
 * IMPORTANT: Arduino Serial Monitor cannot use COM12 while the website is running.
 *    - With website: watch [serial TX] / [serial RX] in the Node terminal.
 *    - MCU-only test: stop Node, Serial Monitor 115200, paste lines from bottom of this file.
 *
 * Libraries: ArduinoJson 6.x (Library Manager)
 */

#include <ArduinoJson.h>

#if defined(ARDUINO_ARCH_ESP32)
  #define BOARD_NAME "ESP32"
#elif defined(ARDUINO_ARCH_STM32)
  #define BOARD_NAME "STM32"
#else
  #define BOARD_NAME "Arduino"
#endif

static float posX = 0, posY = 0, posZ = 0;
static float spindleRpm = 0;
static const char* machineState = "IDLE";

static const bool PERIODIC_STATUS = true;
static const unsigned long STATUS_MS = 500;

template<typename TDoc>
void sendJson(TDoc& doc) {
  serializeJson(doc, Serial);
  Serial.print('\n');
  Serial.flush();
}

void sendHello() {
  StaticJsonDocument<128> doc;
  doc["evt"] = "hello";
  doc["firmware"] = "cnc-mcu-ui-1.1";
  doc["board"] = BOARD_NAME;
  doc["protocol"] = "json";
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
  sendJson(doc);
}

void sendAck(const char* cmd) {
  StaticJsonDocument<96> doc;
  doc["evt"] = "ack";
  doc["cmd"] = cmd;
  doc["ok"] = true;
  sendJson(doc);
}

void sendJogDone(const char* axis, int dir, float step, bool rapid) {
  StaticJsonDocument<192> doc;
  doc["evt"] = "jog_done";
  doc["axis"] = axis;
  doc["dir"] = dir;
  doc["step"] = step;
  doc["rapid"] = rapid;
  doc["x"] = posX;
  doc["y"] = posY;
  doc["z"] = posZ;
  sendJson(doc);
}

void sendError(const char* msg) {
  StaticJsonDocument<96> doc;
  doc["evt"] = "error";
  doc["msg"] = msg;
  sendJson(doc);
}

void sendMdiDone(const char* id, const char* status, const char* detail = nullptr) {
  StaticJsonDocument<256> doc;
  doc["evt"] = "mdi_done";
  if (id && id[0]) doc["id"] = id;
  doc["status"] = status;
  if (detail) doc["detail"] = detail;
  doc["x"] = posX;
  doc["y"] = posY;
  doc["z"] = posZ;
  sendJson(doc);
}

char axisLetter(const char* axis) {
  if (!axis || !axis[0]) return 'X';
  char c = axis[0];
  if (c == 'x' || c == 'X') return 'X';
  if (c == 'y' || c == 'Y') return 'Y';
  if (c == 'z' || c == 'Z') return 'Z';
  return 'X';
}

void applyJog(const char* axis, int dir, float step, bool rapid) {
  float dist = (rapid ? step * 50.0f : step) * (dir < 0 ? -1.0f : 1.0f);
  char a = axisLetter(axis);
  if (a == 'X') posX += dist;
  else if (a == 'Y') posY += dist;
  else if (a == 'Z') posZ += dist;
  machineState = "IDLE";
}

bool parseGcodeMove(const char* line) {
  if (!line) return false;
  String s(line);
  s.toUpperCase();
  int xi = s.indexOf('X');
  int yi = s.indexOf('Y');
  int zi = s.indexOf('Z');
  if (xi >= 0) posX = s.substring(xi + 1).toFloat();
  if (yi >= 0) posY = s.substring(yi + 1).toFloat();
  if (zi >= 0) posZ = s.substring(zi + 1).toFloat();
  return true;
}

void handleCommand(StaticJsonDocument<512>& doc) {
  const char* cmd = doc["cmd"] | "";

  if (!cmd[0]) {
    sendError("missing cmd");
    return;
  }

  sendAck(cmd);

  if (strcmp(cmd, "ping") == 0) {
    sendHello();
    sendStatus();
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

  if (strcmp(cmd, "cycle_start") == 0) {
    machineState = "EXECUTING";
    sendStatus();
    machineState = "IDLE";
    sendStatus();
    return;
  }

  if (strcmp(cmd, "home") == 0) {
    posX = posY = posZ = 0;
    machineState = "IDLE";
    sendStatus();
    return;
  }

  if (strcmp(cmd, "feed_override") == 0 || strcmp(cmd, "spindle_override") == 0) {
    sendStatus();
    return;
  }

  if (strcmp(cmd, "jog") == 0) {
    const char* axis = doc["axis"] | "X";
    int dir = doc["dir"] | 1;
    float step = doc["step"] | 0.01f;
    bool rapid = doc["rapid"] | false;

    applyJog(axis, dir, step, rapid);
    sendJogDone(axis, dir, step, rapid);
    sendStatus();
    return;
  }

  if (strcmp(cmd, "gcode") == 0) {
    const char* line = doc["line"] | "";
    const char* id = doc["id"] | "";
    machineState = "EXECUTING";
    sendStatus();

    if (strstr(line, "X150") || strstr(line, "x150")) {
      machineState = "ERROR";
      sendMdiDone(id, "ERR_LIMIT", "LIMIT REACHED");
      sendStatus();
      return;
    }

    parseGcodeMove(line);
    machineState = "IDLE";
    sendMdiDone(id, "SUCCESS");
    sendStatus();
    return;
  }

  sendError("unknown cmd");
}

void setup() {
  Serial.begin(115200);
#if defined(ARDUINO_ARCH_ESP32)
  unsigned long t0 = millis();
  while (!Serial && millis() - t0 < 4000) { delay(10); }
#endif
  delay(200);
  sendHello();
  sendStatus();
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
      sendError("JSON parse error");
      return;
    }
    handleCommand(doc);
  }

  if (PERIODIC_STATUS && millis() - lastStatusMs >= STATUS_MS) {
    lastStatusMs = millis();
    sendStatus();
  }
}

/*
 * Manual test in Serial Monitor (115200, Newline) — stop npm / close COM12 first:
 *
 * {"cmd":"ping"}
 * {"cmd":"jog","axis":"X","dir":1,"step":0.01,"rapid":false}
 * {"cmd":"jog","axis":"Y","dir":-1,"step":0.01,"rapid":false}
 */
