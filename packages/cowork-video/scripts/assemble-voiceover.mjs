/** Assemble original takes at EXACTLY 1x. Never time-stretch or trim spoken audio. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { getBinary } from "./binaries.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scenes = JSON.parse(fs.readFileSync(path.join(root, "src/scenes.json")));
const fps = 30;
const totalFrames = scenes.reduce((sum, s) => sum + s.duration, 0);
const seconds = totalFrames / fps;
const inputs = [];
const filters = [];
const report = [];
for (let i = 0; i < scenes.length; i++) {
  const scene = scenes[i];
  const file = path.join(
    root,
    "public/audio",
    `${String(i + 1).padStart(2, "0")}.mp3`,
  );
  const duration = Number(
    execFileSync(
      getBinary("ffprobe"),
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
  const offset = scene.voiceoverOffset / fps;
  if (duration + offset > scene.duration / fps)
    throw new Error(
      `${scene.name}: original narration is ${duration}s, longer than its slot. Extend the scene; speeding or trimming speech is forbidden.`,
    );
  inputs.push("-i", file);
  filters.push(
    `[${i}:a]adelay=${Math.round((scene.start / fps + offset) * 1000)}:all=1[a${i}]`,
  );
  report.push({
    ...scene,
    sourceSeconds: duration,
    playbackRate: 1,
    tailSeconds: scene.duration / fps - duration - offset,
  });
}
filters.push(
  `${scenes.map((_, i) => `[a${i}]`).join("")}amix=inputs=${scenes.length}:normalize=0,apad,atrim=0:${seconds},loudnorm=I=-16:TP=-1.5:LRA=7[out]`,
);
execFileSync(
  getBinary("ffmpeg"),
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
  `${seconds}s narration assembled. All ${scenes.length} original takes play at 1x, untrimmed.`,
);
