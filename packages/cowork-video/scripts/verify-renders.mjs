import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getBinary } from "./binaries.mjs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ffprobe = getBinary("ffprobe");
const scenes = JSON.parse(fs.readFileSync(path.join(root, "src/scenes.json")));
const totalFrames = scenes.reduce((sum, s) => sum + s.duration, 0);
const seconds = totalFrames / 30;
const results = [];
for (const [format, width, height] of [
  ["horizontal", 1920, 1080],
  ["vertical", 1080, 1920],
]) {
  const file = path.join(root, "renders", `sednium-cowork-${format}.mp4`);
  const data = JSON.parse(
    execFileSync(
      ffprobe,
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
      { encoding: "utf8" },
    ),
  );
  const video = data.streams.find((s) => s.codec_type === "video");
  const audio = data.streams.find((s) => s.codec_type === "audio");
  assert.equal(video.width, width);
  assert.equal(video.height, height);
  assert.equal(video.r_frame_rate, "30/1");
  assert.equal(Number(video.nb_frames), totalFrames);
  // FFprobe rounds fractional seconds to six decimals; frame count above is exact.
  assert.ok(Math.abs(Number(video.duration) - seconds) < 0.000001);
  assert.equal(video.codec_name, "h264");
  assert.equal(audio.codec_name, "aac");
  // AAC adds encoder padding of a few milliseconds; video remains exactly totalFrames frames.
  assert.ok(Math.abs(Number(data.format.duration) - seconds) < 0.05);
  const result = {
    format,
    width,
    height,
    fps: 30,
    frames: totalFrames,
    videoSeconds: seconds,
    containerSeconds: Number(data.format.duration),
    videoCodec: video.codec_name,
    audioCodec: audio.codec_name,
    bytes: fs.statSync(file).size,
  };
  results.push(result);
  console.log(result);
}
fs.writeFileSync(
  path.join(root, "renders", "verification.json"),
  JSON.stringify(results, null, 2) + "\n",
);
