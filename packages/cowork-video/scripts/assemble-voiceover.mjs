/** Fits the six male narration takes to the fixed scene slots; never changes the video timing. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const binary = (name) =>
  process.env[name.toUpperCase() + "_PATH"] ||
  path.join(
    path.dirname(
      require.resolve("@remotion/compositor-linux-x64-gnu/package.json"),
    ),
    name,
  );
const scenes = JSON.parse(fs.readFileSync(path.join(root, "src/scenes.json")));
const inputs = [];
const filters = [];
const report = [];
for (let i = 0; i < scenes.length; i++) {
  const file = path.join(
    root,
    "public/audio",
    `${String(i + 1).padStart(2, "0")}.mp3`,
  );
  const duration = Number(
    execFileSync(
      binary("ffprobe"),
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        file,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  const target = scenes[i].duration / 30 - 0.24;
  const tempo = Math.max(1, duration / target);
  inputs.push("-i", file);
  filters.push(
    `[${i}:a]atempo=${tempo.toFixed(6)},atrim=0:${target},adelay=${(scenes[i].start / 30) * 1000 + 100}:all=1[a${i}]`,
  );
  report.push({ ...scenes[i], sourceSeconds: duration, playbackRate: tempo });
}
filters.push(
  "[a0][a1][a2][a3][a4][a5]amix=inputs=6:normalize=0,apad,atrim=0:35,loudnorm=I=-16:TP=-1.5:LRA=7[out]",
);
execFileSync(
  binary("ffmpeg"),
  [
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-b:a",
    "192k",
    path.join(root, "public/voiceover.mp3"),
  ],
  { stdio: "inherit" },
);
fs.writeFileSync(
  path.join(root, "public/audio/timing-report.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  "35-second narration assembled. First scene is brisk to fit the requested 21-word / 4.5s slot.",
);
