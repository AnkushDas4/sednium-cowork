import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  scenes,
  captions,
  FPS,
  TOTAL_FRAMES,
  getSceneIndex,
} from "../src/timeline";
import report from "../public/audio/timing-report.json";
import { pop, enter } from "../src/theme";

describe("natural-pace launch timeline", () => {
  it("has six contiguous scenes, 1245 frames, and 41.5s at 30fps", () => {
    expect(FPS).toBe(30);
    expect(TOTAL_FRAMES).toBe(1245);
    expect(scenes.map((s) => s.duration)).toEqual([
      240, 90, 270, 300, 165, 180,
    ]);
    expect(scenes.map((s) => s.start)).toEqual([0, 240, 330, 600, 900, 1065]);
    let end = 0;
    for (const scene of scenes) {
      expect(scene.start).toBe(end);
      end += scene.duration;
    }
    expect(end / FPS).toBe(41.5);
  });
  it("assigns every frame and each exact cut to the correct scene", () => {
    for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
      const active = scenes.filter(
        (s) => frame >= s.start && frame < s.start + s.duration,
      );
      expect(active).toHaveLength(1);
      expect(scenes[getSceneIndex(frame)]).toBe(active[0]);
    }
  });
  it("plays all six original takes at 1x with no clipped speech and a tail", () => {
    expect(report).toHaveLength(scenes.length);
    for (const [i, take] of report.entries()) {
      expect(take.playbackRate).toBe(1);
      expect(take.start).toBe(scenes[i].start);
      expect(take.sourceSeconds + take.voiceoverOffset / FPS).toBeLessThan(
        scenes[i].duration / FPS,
      );
      expect(take.tailSeconds).toBeGreaterThan(0.5);
    }
  });
  it("has no time-stretch filter in the assembly pipeline", () => {
    const source = readFileSync(
      new URL("../scripts/assemble-voiceover.mjs", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/atempo|asetrate|rubberband/);
    expect(source).not.toMatch(/\[\$\{i\}:a\].*atrim/);
  });
  it("keeps captions non-overlapping and inside their own scene", () => {
    let end = 0;
    for (const [start, stop, text] of captions) {
      expect(start).toBeGreaterThanOrEqual(end);
      expect(stop).toBeGreaterThan(start);
      expect(text.length).toBeGreaterThan(0);
      const scene = scenes[getSceneIndex(start)];
      expect(stop).toBeLessThanOrEqual(scene.start + scene.duration);
      end = stop;
    }
  });
  it("preserves all words from the full original script", () => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const scene of scenes) {
      const text = captions
        .filter(
          ([start]) =>
            start >= scene.start && start < scene.start + scene.duration,
        )
        .map((c) => c[2])
        .join(" ");
      expect(normalize(text)).toBe(normalize(scene.caption));
    }
  });
});

describe("smooth motion", () => {
  it("never overshoots or reverses direction during an entrance", () => {
    let previous = 0;
    for (let f = 0; f <= 60; f++) {
      const value = pop(f);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(pop(60)).toBe(1);
  });
  it("settles completely instead of vibrating or scaling whole panels", () => {
    expect(enter(100)).toEqual({ opacity: 1, transform: "translateY(0px)" });
    expect(enter(100)).toEqual(enter(101));
    expect(enter(0).transform).not.toContain("scale");
  });
});
