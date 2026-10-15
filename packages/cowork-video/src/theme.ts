import {
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
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
export const ease = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
export const useScene = () => {
  const f = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  return { f, fps, width, height, durationInFrames, vertical: height > width };
};
// Critically damped, no overshoot: small travel, consistent settling, no scale-from-zero pops.
export const pop = (f: number, fps = 30, delay = 0) =>
  spring({
    frame: f - delay,
    fps,
    config: { damping: 24, stiffness: 100, mass: 1.2, overshootClamping: true },
    durationInFrames: 42,
  });
export const enter = (f: number, delay = 0, distance = 24) => ({
  opacity: ramp(f, delay, delay + 18),
  transform: `translateY(${(1 - pop(f, 30, delay)) * distance}px)`,
});
