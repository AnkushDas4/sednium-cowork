/** Sample-accurate, lossless narration assembly. Original delivery stays EXACTLY 1x. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { getBinary } from "./binaries.mjs";
import { readPcm16Wav, writePcm16Wav, placeTake } from "./pcm-audio.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = path.join(root, ".cache/audio-build");
fs.mkdirSync(scratch, { recursive: true });
const scenes = JSON.parse(fs.readFileSync(path.join(root, "src/scenes.json")));
const fps = 30,
  sampleRate = 48000,
  edgeFadeMs = 5;
const totalFrames = scenes.reduce((sum, s) => sum + s.duration, 0);
const totalSamples = totalFrames * (sampleRate / fps);
const master = new Float32Array(totalSamples);
const report = [];
const ffmpeg = getBinary("ffmpeg");
for (let i = 0; i < scenes.length; i++) {
  const scene = scenes[i];
  const filename = `${String(i + 1).padStart(2, "0")}.wav`;
  const file = path.join(root, "public/audio", filename);
  const decoded = path.join(scratch, filename);
  // Resample only: no tempo changes, compression artifacts from intermediate MP3s, or word trims.
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-i",
    file,
    "-ar",
    String(sampleRate),
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    decoded,
  ]);
  const { samples } = readPcm16Wav(fs.readFileSync(decoded));
  const sourceSeconds = samples.length / sampleRate;
  const startSample =
    (scene.start + scene.voiceoverOffset) * (sampleRate / fps);
  const tailSeconds =
    scene.duration / fps - sourceSeconds - scene.voiceoverOffset / fps;
  if (tailSeconds < 0)
    throw new Error(
      `${scene.name}: narration exceeds its slot. Extend the scene; speeding or trimming speech is forbidden.`,
    );
  placeTake(
    master,
    samples,
    startSample,
    Math.round((sampleRate * edgeFadeMs) / 1000),
  );
  report.push({
    ...scene,
    sourceFile: `audio/${filename}`,
    sourceSeconds,
    sourceSamples: samples.length,
    startSample,
    sampleRate,
    edgeFadeMs,
    playbackRate: 1,
    tailSeconds,
  });
}
const raw = path.join(scratch, "assembled.wav");
fs.writeFileSync(raw, writePcm16Wav(master, sampleRate));
// Measure once, then apply ONE fixed gain to the full master. No dynamic loudness pumping.
const analysis = spawnSync(
  ffmpeg,
  [
    "-hide_banner",
    "-nostats",
    "-i",
    raw,
    "-vn",
    "-af",
    "loudnorm=I=-16:TP=-2:LRA=11:print_format=json",
    "-c:a",
    "pcm_s16le",
    "-f",
    "null",
    "-",
  ],
  { encoding: "utf8" },
);
if (analysis.status !== 0) throw new Error(analysis.stderr);
const match = analysis.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
if (!match) throw new Error("Could not measure narration loudness");
const stats = JSON.parse(match[0]);
const inputLufs = Number(stats.input_i),
  inputPeak = Number(stats.input_tp);
if (!Number.isFinite(inputLufs) || !Number.isFinite(inputPeak))
  throw new Error("Narration is silent or has invalid loudness");
// Duplicated dual-mono stereo adds 3.01 LU without raising either channel peak.
const stereoLoudnessGain = 10 * Math.log10(2);
const gainDb = Math.min(-16 - inputLufs - stereoLoudnessGain, -2 - inputPeak);
const normalized = path.join(scratch, "normalized.wav");
execFileSync(ffmpeg, [
  "-v",
  "error",
  "-y",
  "-i",
  raw,
  "-af",
  `volume=${gainDb.toFixed(6)}dB`,
  "-ar",
  String(sampleRate),
  "-ac",
  "1",
  "-c:a",
  "pcm_s16le",
  normalized,
]);
const pcm = readPcm16Wav(fs.readFileSync(normalized));
if (pcm.samples.length !== totalSamples)
  throw new Error("PCM sample count changed unexpectedly");
// Explicit dual-mono prevents a second mono-to-stereo attenuation in the video mixer.
const stereo = new Float32Array(totalSamples * 2);
for (let i = 0; i < totalSamples; i++) {
  stereo[i * 2] = pcm.samples[i];
  stereo[i * 2 + 1] = pcm.samples[i];
}
const wave = writePcm16Wav(stereo, sampleRate, 2);
fs.writeFileSync(path.join(root, "public/voiceover.wav"), wave);
// MP3 is an optional compatibility fallback, never the intermediate source for rendering.
execFileSync(ffmpeg, [
  "-v",
  "error",
  "-y",
  "-i",
  path.join(root, "public/voiceover.wav"),
  "-c:a",
  "libmp3lame",
  "-b:a",
  "256k",
  path.join(root, "public/voiceover.mp3"),
]);
const sha256 = createHash("sha256").update(wave).digest("hex");
const manifest = {
  revision: sha256.slice(0, 16),
  sha256,
  sampleRate,
  channels: 2,
  totalSamples,
  durationSeconds: totalFrames / fps,
  playbackRate: 1,
  edgeFadeMs,
  gainDb,
  inputLufs,
  estimatedOutputLufs: inputLufs + gainDb + stereoLoudnessGain,
  estimatedOutputTruePeakDb: inputPeak + gainDb,
};
fs.writeFileSync(
  path.join(root, "public/audio/voiceover-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(root, "public/audio/timing-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `${(totalFrames / fps).toFixed(3)}s lossless narration, ${totalSamples} exact samples. All takes at 1x; fixed gain ${gainDb.toFixed(2)}dB. Revision ${manifest.revision}.`,
);
