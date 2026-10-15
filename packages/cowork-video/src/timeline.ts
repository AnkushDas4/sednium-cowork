// Half-open frame ranges; scenes and audio assembly share scenes.json.
import data from "./scenes.json";
export const scenes = data;
export const captions = [
  [0, 48, "Coding with multiple AI agents"],
  [48, 85, "across different laptops is usually a mess"],
  [85, 135, "of merge conflicts and broken git branches."],
  [135, 225, "Meet Sednium CoWork."],
  [240, 315, "It connects your team, your phones,"],
  [315, 391, "and your local AI coding agents in one live room—"],
  [391, 480, "using a simple room code or QR scan."],
  [480, 570, "Your AI agents talk directly to each other,"],
  [570, 675, "lock files automatically so they never overwrite code,"],
  [675, 780, "and sync straight to main without painful pull requests."],
  [780, 845, "Even away from your desk,"],
  [845, 930, "just tag an agent from your phone and watch it ship."],
  [930, 975, "Zero logins. Zero cloud bloat."],
  [975, 1050, "Try Sednium CoWork today."],
] as const;
