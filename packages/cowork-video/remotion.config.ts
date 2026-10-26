import { Config } from "@remotion/cli/config";

Config.setEntryPoint("src/index.ts");

// JPEG frames encode faster than PNG; quality 95 keeps the orange gradients free of banding.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);

// H.264 + yuv420p plays everywhere: X, LinkedIn, Instagram, YouTube, Slack, QuickTime.
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
Config.setOverwriteOutput(true);

// Remotion downloads Chrome Headless Shell on first render. Machines that cannot reach Google's
// CDN (locked-down CI, sandboxes) can point at any Chromium instead.
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
}

// Keep software-only render workers stable. Both compositions are still full-resolution 30fps.
Config.setConcurrency(2);
if (process.env.REMOTION_BROWSER_EXECUTABLE) {
  Config.setChromiumOpenGlRenderer("swangle");
}
