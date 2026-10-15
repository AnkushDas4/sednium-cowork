/** Deterministic, original synthesized sound design. No external samples or services. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sr = 48000;
const length = sr * 35;
const buffer = new Float32Array(length);
let seed = 17;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
function tone(time, duration, freq, gain = 0.3) {
  const start = Math.floor(time * sr);
  for (let i = 0; i < duration * sr && start + i < length; i++) {
    const t = i / sr;
    buffer[start + i] +=
      Math.sin(2 * Math.PI * freq * t) *
      Math.exp((-t * 9) / duration) *
      Math.min(1, t * 300) *
      gain;
  }
}
function hit(time) {
  tone(time, 0.65, 54, 0.7);
  tone(time, 0.18, 108, 0.2);
}
function whoosh(time, duration = 0.25) {
  const start = Math.floor(time * sr);
  let prev = 0;
  for (let i = 0; i < duration * sr && start + i < length; i++) {
    const t = i / sr / duration;
    const n = noise();
    prev = 0.82 * prev + 0.18 * n;
    buffer[start + i] += (n - prev) * Math.sin(Math.PI * t) ** 2 * 0.2;
  }
}
[0, 4.5, 8, 16, 19, 22.5, 26, 31, 33].forEach(hit);
[4.2, 7.7, 15.7, 25.7, 30.7].forEach((t) => whoosh(t));
[18.9, 19.15, 22.6, 24, 28.17, 29.95].forEach((t) => {
  tone(t, 0.18, 880, 0.2);
  tone(t + 0.075, 0.25, 1320, 0.14);
});
[31.17, 31.83, 32.5].forEach((t) => {
  tone(t, 0.2, 95, 0.5);
  whoosh(t, 0.09);
});
for (let t = 0.5; t < 1.8; t += 0.075)
  tone(t, 0.025, 1600 + noise() * 700, 0.12);
// Very restrained 120 BPM mechanical pulse under the voice, not a glossy music bed.
for (let t = 5; t < 30; t += 0.5) tone(t, 0.12, t % 2 === 0 ? 65 : 130, 0.07);
const wav = Buffer.alloc(44 + length * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(36 + length * 2, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sr, 24);
wav.writeUInt32LE(sr * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(length * 2, 40);
for (let i = 0; i < length; i++)
  wav.writeInt16LE(Math.round(Math.tanh(buffer[i]) * 28000), 44 + i * 2);
fs.writeFileSync(path.join(root, "public/sound-design.wav"), wav);
console.log(
  "35 seconds of original UI ticks, mechanical cuts, dispatch chimes, and low-frequency hits.",
);
