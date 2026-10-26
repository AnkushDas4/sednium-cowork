import manifest from "../public/audio/voiceover-manifest.json";
import takes from "../public/audio/timing-report.json";
import { FPS } from "./timeline";
import { ramp } from "./theme";
export const voiceoverRevision = manifest.revision;
export const selectVoiceover = (files: readonly string[]) =>
  files.includes("voiceover.wav")
    ? "voiceover.wav"
    : files.includes("voiceover.mp3")
      ? "voiceover.mp3"
      : null;
// Ticks/impacts should not masquerade as glitches or mask a spoken consonant.
export const soundDesignVolume = (frame: number) => {
  const duck = Math.max(
    0,
    ...takes.map((t) => {
      const start = t.start + t.voiceoverOffset;
      const end = start + t.sourceSeconds * FPS;
      return (
        ramp(frame, start - 6, start + 2) * (1 - ramp(frame, end, end + 10))
      );
    }),
  );
  return 0.18 - 0.1 * duck;
};
