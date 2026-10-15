import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ffprobe =
  process.env.FFPROBE_PATH ||
  path.join(
    path.dirname(
      require.resolve("@remotion/compositor-linux-x64-gnu/package.json"),
    ),
    "ffprobe",
  );
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
  assert.equal(Number(video.nb_frames), 1050);
  assert.equal(Number(video.duration), 35);
  assert.equal(video.codec_name, "h264");
  assert.equal(audio.codec_name, "aac");
  // AAC adds encoder padding of a few milliseconds; video remains exactly 1050 frames.
  assert.ok(Math.abs(Number(data.format.duration) - 35) < 0.05);
  const result = {
    format,
    width,
    height,
    fps: 30,
    frames: 1050,
    videoSeconds: 35,
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
