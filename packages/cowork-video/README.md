# Sednium CoWork — launch film

A deterministic **35-second / 1050-frame / 30fps** Remotion package. Both compositions tell the same story with dedicated layouts, not a crop of one master.

| Composition | Size | Export |
|---|---|---|
| `CoWorkLaunchHorizontal` | 1920 × 1080 | `renders/sednium-cowork-horizontal.mp4` |
| `CoWorkLaunchVertical` | 1080 × 1920 | `renders/sednium-cowork-vertical.mp4` |

## Run from the repository root

```sh
npm ci
npm run video:studio
npm run video:render
```

Studio uses port **3100** and listens on all interfaces. No relay server, database, account, API key, or real room is needed. Render output is H.264, CRF 18, JPEG frame quality 95, yuv420p, with AAC audio. Renders are ignored by Git; source assets are included.

```sh
npm --workspace=@sednium/cowork-video run build       # TypeScript verification
npm --workspace=@sednium/cowork-video run typecheck
npm test                                            # Includes video timeline tests
```

Individual formats:

```sh
npm --workspace=@sednium/cowork-video run render:horizontal
npm --workspace=@sednium/cowork-video run render:vertical
```

## Edit the film

- `src/scenes/Scene1Chaos.tsx` through `Scene6Outro.tsx`: six modular scenes.
- `src/scenes.json`: scene starts, lengths, and full narration text; shared with audio assembly.
- `src/timeline.ts`: caption phrase timings, in **absolute frames**.
- `src/theme.ts`: colors, fonts, frame-based animation helpers.
- `src/components/HudFrame.tsx`: persistent frame telemetry and architectural overlay.
- `src/components/Subtitles.tsx`: optional kinetic bottom caption bar.
- `src/Root.tsx`: both composition registrations and default props.
- `src/CoWorkVideo.tsx`: `Series` assembly, optional media tracks, HUD, captions.

All motion uses Remotion frames (`spring`, `interpolate`, `Math.sin(frame)`); there are no nondeterministic timers, CSS animation clocks, remote images, or runtime API requests. Portrait rearranges terminals, mesh nodes, dashboard columns, and phone/terminal positions.

### Optional captions and sound design

Both are on by default. Set `captions` or `soundDesign` to false in Studio's input props, or pass CLI props:

```sh
cd packages/cowork-video
npx remotion render src/index.ts CoWorkLaunchHorizontal renders/clean.mp4 \
  --props='{"captions":false,"soundDesign":true}'
```

### Voiceover

`public/voiceover.mp3` is the only narration file read by the composition. A male AI narration is supplied, based on the six requested scene lines. **Replace this file with your own 35-second master** to change the voice; no code changes are needed. Keep cue starts at 0, 4.5, 8, 16, 26, and 31 seconds. Update caption phrase frames to match any changed delivery. Caption timings are editorial phrase cues, not forced-aligned word timestamps.

If `voiceover.mp3` is absent, it is not mounted as an `Audio` element: preview and rendering continue without narration. `sound-design.wav` has the same optional-file check. In Studio, allow the public-folder watcher to detect changes or reload after replacing files.

The six original narration takes live under `public/audio/`. To rebuild the master:

```sh
npm --workspace=@sednium/cowork-video run audio
```

This time-fits the takes into their fixed cue ranges, uses pitch-preserving `atempo`, normalizes the master to a -16 LUFS target, and writes `public/audio/timing-report.json`. The opening sentence is 21 words in 4.5 seconds, so it plays faster (about 1.67× the original take); use a shorter opening or a faster original recording if that delivery feels too rushed. The final take also needs modest time compression. These adjustments do not change the required frame counts.

Audio assembly uses Remotion's bundled Linux x64 FFmpeg/FFprobe here. On other platforms, set `FFMPEG_PATH` and `FFPROBE_PATH` to compatible executables. Already-included audio works cross-platform without running this script.

### Sound design

`node packages/cowork-video/scripts/generate-sound-design.mjs` regenerates `public/sound-design.wav`. These are original, seeded synthesized sounds: mechanical cut hits, short whooshes, typing ticks, a dispatch chime, and a restrained 120-BPM pulse. The track is mixed at 0.3 volume beneath narration. No external music or sample licensing is required.

### Typography

`@remotion/google-fonts` is installed as requested. This sandbox cannot reach Google's font CDN, so rendering uses **self-hosted Google Font WOFF2s** through `@remotion/fonts` instead: Urbanist (variable, including 600/700/800) and JetBrains Mono (variable, including 400/500/600). Their OFL licenses are in `public/fonts/`. This also makes exports deterministic offline. Symbols that may be absent from Latin font subsets use SVG icons or terminal-safe ASCII.

## Browser / constrained CI

Remotion normally downloads Chrome Headless Shell on first render. If your environment cannot reach the download host, point it at your installed Chromium:

```sh
REMOTION_BROWSER_EXECUTABLE=/path/to/chromium npm run video:render
```

On the current Arena sandbox the browser is `/tmp/chromium` and its support libraries are extracted under `/tmp/x-al2023/lib`:

```sh
REMOTION_BROWSER_EXECUTABLE=/tmp/chromium \
LD_LIBRARY_PATH=/tmp/x-al2023/lib \
FONTCONFIG_PATH=/tmp/x-fonts \
npm run video:render
```

These `/tmp` paths are environment-specific, are not committed, and may need to be recreated in a fresh sandbox. The config switches to software ANGLE when a custom browser is provided and limits concurrency to two render tabs for small CI workers.

## Scene map

Frame ranges below are half-open (`start` inclusive, `end` exclusive).

| Scene | Frames | Time | Key beat |
|---|---|---|---|
| Chaos | 0–135 | 0–4.5s | Conflicting edits; warning at 55; jitter 60–115; shutter 125 |
| Reveal | 135–240 | 4.5–8s | Grid, logo, staggered wordmark, installation command |
| Mesh | 240–480 | 8–16s | Three nodes, room access, QR scanner, fragment-key callout |
| Dashboard | 480–780 | 16–26s | Lock/409, agent handoff at 570, Git sync at 675 |
| Mobile | 780–930 | 26–31s | Prompt typing; dispatch at 845; terminal receives and ships |
| Outro | 930–1050 | 31–35s | Milk-white invert; punchlines 935/955/975; CTA at 990 |

The outro's content settles before frame 1015; only live HUD telemetry/progress continues through the final hold.

## Demo data and publication notes

This is an animated reconstruction of the real dashboard, not a screen recording or integration test. Room `SED-409`, fragment suffix, agents, timestamps, lock events, and commit hashes are staged. The QR code intentionally opens the **public site**, not a usable private room or invitation. No live invite keys or credentials are embedded.

The supplied brief's “zero merge conflicts,” “never overwrite,” and automatic-sync language is marketing copy, not an unconditional product guarantee. Actual file leases require agents to use the claim tools; Git can still conflict. The demo assumes all agents use `main`, a clean worktree, and `autoPull: true` (auto-pull is **off by default** in the product). The 950KB label describes the MCP bundle approximately, not the small installer file. Fragment keys are kept out of normal HTTP request URLs; that is not a guarantee against browser-side logging. Review these supplied claims before public release.

The CTA is `cowork.sednium.com`, with the requested open-source repository footer in the outro.

## Export verification

After rendering, `npm --workspace=@sednium/cowork-video run verify:renders` checks both outputs with FFprobe: resolution, H.264/AAC tracks, 1050 frames, 30fps, and exactly 35 seconds of video. The MP4 container may include ~8ms of AAC encoder padding. Verification details are saved to `renders/verification.json`.
