import data from "./scenes.json";
export const FPS = 30;
export const scenes = data;
export const TOTAL_FRAMES = scenes.reduce(
  (sum, scene) => sum + scene.duration,
  0,
);
export const OUTRO_START = scenes[5].start;
// Scene-local phrase cues for the original 1x takes; no stretched legacy timestamps.
const phrases: ReadonlyArray<ReadonlyArray<readonly [number, number, string]>> =
  [
    [
      [6, 65, "Coding with multiple AI agents"],
      [65, 126, "across different laptops is usually a mess"],
      [126, 220, "of merge conflicts and broken git branches."],
    ],
    [[6, 65, "Meet Sednium CoWork."]],
    [
      [6, 82, "It connects your team, your phones,"],
      [82, 170, "and your local AI coding agents in one live room—"],
      [170, 255, "using a simple room code or QR scan."],
    ],
    [
      [6, 85, "Your AI agents talk directly to each other,"],
      [85, 178, "lock files automatically so they never overwrite code,"],
      [178, 276, "and sync straight to main without painful pull requests."],
    ],
    [
      [6, 57, "Even away from your desk,"],
      [57, 150, "just tag an agent from your phone and watch it ship."],
    ],
    [
      [6, 79, "Zero logins. Zero cloud bloat."],
      [79, 158, "Try Sednium CoWork today."],
    ],
  ];
export const captions = phrases.flatMap((lines, i) =>
  lines.map(
    ([start, end, text]) =>
      [scenes[i].start + start, scenes[i].start + end, text] as const,
  ),
);
export const getSceneIndex = (frame: number) =>
  Math.max(
    0,
    scenes.findIndex((s) => frame >= s.start && frame < s.start + s.duration),
  );

// A deliberate match cut: keep the phone visible, then show white on the very next frame.
export const transitionForScene = (name: string) => ({
  fadeIn: name !== "OUTRO",
  fadeOut: name !== "MOBILE" && name !== "OUTRO",
});
