# Sednium CoWork — natural-pace launch film

**41.5 seconds · 1245 frames · 30fps.** The full original script and male recordings now play at **exactly 1× speed**. This revision intentionally replaces the original 35-second cut: scene lengths accommodate the recordings, not the other way around.

| Composition | Size | Export |
|---|---|---|
| `CoWorkLaunchHorizontal` | 1920 × 1080 | `renders/sednium-cowork-horizontal.mp4` |
| `CoWorkLaunchVertical` | 1080 × 1920 | `renders/sednium-cowork-vertical.mp4` |

## Start on a desktop

Use Node.js 20+ on Windows, macOS, or Linux. From the repository root:

```sh
npm ci
npm run video:studio
```

Open **http://localhost:3100**. No database, relay server, real room, account, or API key is needed. Studio listens on all interfaces; keep it on a trusted network or behind an authenticated preview proxy.

The repository is private, so cloning requires an account with access. Native Termux/Android is not supported by the bundler's native dependencies; use a supported desktop or Linux environment instead.

To get this revision in an existing checkout on `arena/4c9c9f6c-sednium-cowork`:

```sh
git pull --ff-only
npm run video:studio
```

Do not discard local edits to update. Stop the old Studio process first if port 3100 is already in use. Check the timeline duration is **1245 frames**, not 1050, to confirm the new cut loaded.

## Render and verify

```sh
npm run video:render
npm --workspace=@sednium/cowork-video run verify:renders
```

H.264, CRF 18, yuv420p, AAC audio; JPEG frame quality 95. The verification script checks both resolutions, 30fps, **1245 frames**, and **41.5 seconds of video**. AAC encoder padding can make the container a few milliseconds longer. Results go to `renders/verification.json`.

```sh
npm --workspace=@sednium/cowork-video run render:horizontal
npm --workspace=@sednium/cowork-video run render:vertical
npm --workspace=@sednium/cowork-video run build
npm test
```

Renders are ignored by Git. All required source assets are included.

## What changed in the pacing revision

- **No speed changes:** all six original narration takes play at 1×, with their full spoken content preserved. Opening is now 8 seconds instead of 4.5; outro is 6 instead of 4.
- A brief 0.2-second lead-in per scene, then at least half a second after each take, gives the edit breathing room.
- Critically damped entrances settle without overshoot. Most movement travels only 12–32px, not across the whole screen.
- Removed camera jitter, warning-banner slams/rotation, scale-from-zero panels, and abrupt button scaling.
- Short eased scene fade-outs/fade-ins retain a continuous `Series` timeline; they do not overlap or change audio timing.
- Unified gutters; terminals and conflict warning have distinct rows. Mesh hub and nodes have dedicated lanes. The dashboard no longer scales an oversized layout or uses negative margins.
- Dashboard headings and event slots reserve their space, so new events don't push existing content around. Phone feed/composer use flex layout instead of overlapping absolute blocks.
- A dedicated caption lane stays below content in both aspect ratios. The outro holds still after local frame 142, except for persistent live HUD telemetry/progress.

## Edit the source

- `src/scenes.json`: starts, lengths, 0.2-second voiceover offsets, and full narration. Both audio scripts and the composition use this timeline.
- `src/timeline.ts`: derives total duration/outro start, stores scene-local caption phrase cues, and maps the HUD's scene index.
- `src/theme.ts`: colors and shared critically damped motion helpers.
- `src/components/Motion.tsx`: staggered `Reveal` and scene fade wrappers.
- `src/components/Primitives.tsx`: shared panels, type, icon, and safe content gutters.
- `src/scenes/Scene1Chaos.tsx` through `Scene6Outro.tsx`: six modular, responsive scenes.
- `src/components/HudFrame.tsx`: persistent framing, live timecode, and progress.
- `src/components/Subtitles.tsx`: optional phrase captions.
- `src/CoWorkVideo.tsx`: `Series`, optional audio tracks, HUD, captions.
- `src/Root.tsx`: both composition registrations; duration is derived from the timeline.

All motion is frame-driven and deterministic. There are no CSS animation clocks, real-time timers, runtime API requests, or remote image dependencies. Portrait is re-laid out, not cropped from landscape.

### Optional captions and effects

Both are on by default. Change `captions` or `soundDesign` in Studio's input props, or render with props:

```sh
cd packages/cowork-video
npx remotion render src/index.ts CoWorkLaunchHorizontal renders/clean.mp4 \
  --props='{"captions":false,"soundDesign":true}'
```

### Voiceover: never speed up to fit

The composition reads `public/voiceover.mp3` at the default **1×** rate. You can replace that file with another master. Preserve the scene cue starts below or update the timeline/captions to match. If the file is absent, preview and rendering continue without narration. The sound-design file is independently optional.

Original narration takes remain unchanged under `public/audio/01.mp3` through `06.mp3`.

```sh
npm --workspace=@sednium/cowork-video run audio
```

The assembly script only delays and mixes the original recordings, pads the full master, and normalizes loudness to a -16 LUFS target. **There are no tempo/rate filters and no per-take speech trims.** If a source take is longer than its slot, generation throws an error asking you to extend the scene. It never silently accelerates or truncates the take. `public/audio/timing-report.json` records every playback rate as 1, source length, and remaining tail.

Caption cues are editorial phrase timings, not forced-aligned word timestamps. Update them when replacing narration.

### Sound design

```sh
node packages/cowork-video/scripts/generate-sound-design.mjs
```

The seeded, original synthesized track now derives cut cues and duration from `scenes.json`. Restrained whooshes, UI ticks, connection/dispatch chimes, low hits, and a quiet 120-BPM pulse sit beneath the narration at 0.3 volume. No external samples/music licenses are required.

### Typography

`@remotion/google-fonts` is installed. This sandbox cannot reach Google's font CDN, so fonts are self-hosted WOFF2 files loaded by `@remotion/fonts`: **Urbanist** (including 600/700/800) and **JetBrains Mono** (including 400/500/600). OFL licenses are in `public/fonts/`. SVG icons and terminal-safe ASCII avoid missing-glyph boxes in Latin subsets. Exports work offline once dependencies/browser are installed.

## Scene map

Frame ranges are half-open: start inclusive, end exclusive.

| Scene | Frames | Time | Motion / beat |
|---|---|---|---|
| Chaos | 0–240 | 0–8s | Staggered terminal arrivals; warning in its own row at local 128 |
| Reveal | 240–330 | 8–11s | Grid draw, restrained logo settle, staggered wordmark, install command |
| Mesh | 330–600 | 11–20s | Hub first, paths draw, three nodes connect in sequence |
| Dashboard | 600–900 | 20–30s | Message at local 30; lock at 95; 409 at 115; Git handoff 205–244 |
| Mobile | 900–1065 | 30–35.5s | Prompt; smooth button press; dispatch at local 88; packet to inbox at 108 |
| Outro | 1065–1245 | 35.5–41.5s | White canvas, staggered line reveals, CTA at local 98, stable final hold |

## Browser / constrained CI

Remotion normally downloads Chrome Headless Shell on first render. Use an installed Chromium when that CDN is blocked:

```sh
REMOTION_BROWSER_EXECUTABLE=/path/to/chromium npm run video:render
```

On the current Arena sandbox:

```sh
REMOTION_BROWSER_EXECUTABLE=/tmp/chromium \
LD_LIBRARY_PATH=/tmp/x-al2023/lib \
FONTCONFIG_PATH=/tmp/x-fonts \
npm run video:render
```

These `/tmp` paths are environment-specific and may need recreating in a fresh sandbox; they are not required on a normal desktop. A custom-browser render uses software ANGLE, and concurrency is capped at two tabs for small CI machines.

Audio and verification scripts find Remotion's bundled binaries on supported desktop platforms. Set `FFMPEG_PATH` and `FFPROBE_PATH` explicitly if using your own executables. Included audio needs no regeneration to play.

## Demo data and publication notes

This is a deterministic animated reconstruction of the product, not a recording or live integration test. Room `SED-409`, fragment suffix, agents, timestamps, events, and commits are staged. The QR opens **cowork.sednium.com**, not a usable private invitation. No live keys or credentials are embedded.

“Zero merge conflicts,” “never overwrite,” and automatic-sync language came from the supplied marketing brief, not unconditional product guarantees. Agents must use claim tools; Git can still conflict. The demo assumes `main`, clean worktrees, and `autoPull: true` (**off by default** in the real product). The ~950KB badge describes the MCP bundle, not the installer. Fragment keys stay out of normal HTTP request URLs; that is not a guarantee against browser-side logging. Review these claims before publication.
