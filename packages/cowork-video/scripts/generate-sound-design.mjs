/** Deterministic, original synthesized sound design. No external samples or services. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenes = JSON.parse(fs.readFileSync(path.join(root, "src/scenes.json")));
const seconds = scenes.reduce((sum, s) => sum + s.duration, 0) / 30;
const at = (scene, frame = 0) => (scenes[scene].start + frame) / 30;
const sr = 48000;
const length = Math.round(sr * seconds);
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
// Cue from the same timeline as the visuals. Gentler arrivals, not aggressive cut hits.
[at(0, 128), at(1, 8), at(5, 14), at(5, 98)].forEach((t) => {
  tone(t, 0.55, 60, 0.25);
  tone(t, 0.18, 120, 0.08);
});
scenes.slice(1).forEach((scene) => whoosh(scene.start / 30 - 0.24, 0.38));
[
  at(2, 90),
  at(2, 106),
  at(2, 122),
  at(3, 30),
  at(3, 115),
  at(3, 244),
  at(4, 88),
  at(4, 142),
].forEach((t) => {
  tone(t, 0.2, 880, 0.13);
  tone(t + 0.09, 0.28, 1320, 0.09);
});
for (let t = 1.3; t < 3.6; t += 0.14)
  tone(t, 0.025, 1600 + noise() * 700, 0.065);
for (let t = at(1); t < at(5); t += 0.5)
  tone(t, 0.12, t % 2 === 0 ? 65 : 130, 0.035);
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
  `${seconds}s of restrained sound design, synced to the natural-pace timeline.`,
);
