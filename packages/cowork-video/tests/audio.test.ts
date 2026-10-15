import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  readPcm16Wav,
  writePcm16Wav,
  placeTake,
} from "../scripts/pcm-audio.mjs";
import {
  selectVoiceover,
  soundDesignVolume,
  voiceoverRevision,
} from "../src/audio";
import { TOTAL_FRAMES, FPS } from "../src/timeline";
import manifest from "../public/audio/voiceover-manifest.json";
import takes from "../public/audio/timing-report.json";

describe("clean lossless narration", () => {
  const wav = readFileSync(new URL("../public/voiceover.wav", import.meta.url));
  const pcm = readPcm16Wav(wav);
  it("uses exactly one 48kHz PCM sample timeline, not MP3 packet offsets", () => {
    expect(pcm.sampleRate).toBe(48000);
    expect(pcm.channels).toBe(2);
    expect(pcm.bits).toBe(16);
    expect(pcm.samples.length).toBe(
      (TOTAL_FRAMES / FPS) * 48000 * pcm.channels,
    );
    expect(pcm.samples.length).toBe(manifest.totalSamples * pcm.channels);
  });
  it("has no clipping or invalid samples", () => {
    let peak = 0;
    for (const sample of pcm.samples) {
      if (!Number.isFinite(sample)) throw new Error("Non-finite audio sample");
      peak = Math.max(peak, Math.abs(sample));
    }
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(0.8);
    expect(manifest.estimatedOutputTruePeakDb).toBeLessThanOrEqual(-2);
  });
  it("places fresh WAV takes on exact scene frame boundaries at 1x", () => {
    for (const take of takes) {
      expect(take.sourceFile).toMatch(/\.wav$/);
      expect(take.playbackRate).toBe(1);
      expect(take.startSample).toBe((take.start + take.voiceoverOffset) * 1600);
      expect(take.sourceSamples).toBeGreaterThan(0);
    }
  });
  it("has click-free take edges and silent gaps, without dropping samples", () => {
    for (const take of takes) {
      const start = take.startSample * pcm.channels;
      const end = start + take.sourceSamples * pcm.channels;
      expect(pcm.samples[start - 1]).toBe(0);
      expect(pcm.samples[start]).toBe(0);
      expect(pcm.samples[end - 1]).toBe(0);
      expect(pcm.samples[end]).toBe(0);
    }
  });
  it("busts cached old narration only when the PCM content changes", () => {
    const hash = createHash("sha256").update(wav).digest("hex");
    expect(manifest.sha256).toBe(hash);
    expect(voiceoverRevision).toBe(hash.slice(0, 16));
  });
  it("prefers WAV, retains MP3 fallback, and tolerates missing media", () => {
    expect(selectVoiceover(["voiceover.mp3", "voiceover.wav"])).toBe(
      "voiceover.wav",
    );
    expect(selectVoiceover(["voiceover.mp3"])).toBe("voiceover.mp3");
    expect(selectVoiceover([])).toBeNull();
  });
  it("ducks effects smoothly underneath spoken words", () => {
    expect(soundDesignVolume(0)).toBeCloseTo(0.18);
    expect(soundDesignVolume(30)).toBeCloseTo(0.08);
    let last = soundDesignVolume(0);
    for (let f = 1; f < TOTAL_FRAMES; f++) {
      const value = soundDesignVolume(f);
      expect(value).toBeGreaterThanOrEqual(0.079);
      expect(value).toBeLessThanOrEqual(0.181);
      expect(Math.abs(value - last)).toBeLessThanOrEqual(0.013);
      last = value;
    }
  });
});

describe("PCM assembly primitives", () => {
  it("ramps only the edges and preserves samples and duration in the middle", () => {
    const take = Float32Array.from([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const master = new Float32Array(14);
    placeTake(master, take, 3, 2);
    expect([...master]).toEqual([
      0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0, 0, 0,
    ]);
    expect(take).toHaveLength(8);
  });
  it("rejects overruns instead of clipping words or changing the rate", () => {
    expect(() =>
      placeTake(new Float32Array(4), new Float32Array(5), 0),
    ).toThrow(/overrun/);
  });
  it("round-trips mono PCM and rejects non-finite samples", () => {
    const a = Float32Array.from([0, 0.25, -0.5, 0]);
    expect([...readPcm16Wav(writePcm16Wav(a)).samples]).toEqual([...a]);
    expect(() => writePcm16Wav(Float32Array.from([NaN]))).toThrow(/Invalid/);
  });
});
