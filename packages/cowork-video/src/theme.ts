import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
export const C = {
  bg: "#121214",
  panel: "#18181B",
  white: "#F7F6F2",
  line: "#2A2A2E",
  orange: "#FF6B00",
  green: "#10B981",
  muted: "#929297",
  red: "#F05B48",
};
export const mono = '"JetBrains Mono", monospace';
export const font = "Urbanist, sans-serif";
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const ramp = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], clamp);
export const useScene = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  return { f: frame, fps, width, height, vertical: height > width };
};
export const pop = (frame: number, fps = 30, delay = 0) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 160 },
  });
