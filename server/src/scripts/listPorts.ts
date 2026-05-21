import { listSerialPorts, autoDetectPort } from "../hardware/serialBridge.js";

const ports = await listSerialPorts();
const auto = await autoDetectPort();

console.log("Available serial ports:\n");
if (!ports.length) {
  console.log("  (none — plug in MCU via USB and retry)");
} else {
  for (const p of ports) {
    const mark = p.path === auto ? " ← auto" : "";
    console.log(`  ${p.path}${mark}`);
    if (p.manufacturer) console.log(`    manufacturer: ${p.manufacturer}`);
    if (p.vendorId) console.log(`    vid:pid ${p.vendorId}:${p.productId}`);
  }
}
console.log("\nAuto-detect would use:", auto ?? "(none)");
