import { describe, it, expect } from "vitest";
import { scenes, captions } from "../src/timeline";

describe("35-second launch timeline", () => {
  it("has exactly six contiguous scenes and 1050 frames at 30fps", () => {
    expect(scenes.map((s) => s.duration)).toEqual([
      135, 105, 240, 300, 150, 120,
    ]);
    expect(scenes.map((s) => s.start)).toEqual([0, 135, 240, 480, 780, 930]);
    let end = 0;
    for (const scene of scenes) {
      expect(scene.start).toBe(end);
      end += scene.duration;
    }
    expect(end).toBe(1050);
    expect(end / 30).toBe(35);
  });
  it("assigns each frame to exactly one scene", () => {
    for (let frame = 0; frame < 1050; frame++)
      expect(
        scenes.filter((s) => frame >= s.start && frame < s.start + s.duration),
      ).toHaveLength(1);
  });
  it("keeps captions ordered, non-overlapping, and inside their scene", () => {
    let end = 0;
    for (const [start, stop, text] of captions) {
      expect(start).toBeGreaterThanOrEqual(end);
      expect(stop).toBeGreaterThan(start);
      expect(stop).toBeLessThanOrEqual(1050);
      expect(text.length).toBeGreaterThan(0);
      const scene = scenes.find(
        (s) => start >= s.start && start < s.start + s.duration,
      )!;
      expect(stop).toBeLessThanOrEqual(scene.start + scene.duration);
      end = stop;
    }
  });
  it("captions preserve every spoken word in each scene", () => {
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
