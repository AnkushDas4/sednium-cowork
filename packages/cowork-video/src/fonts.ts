import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";
// Self-hosted Google Font files keep render workers deterministic and work offline.
// Urbanist: 600/700/800; JetBrains Mono: 400/500/600, all in variable WOFF2s.
loadFont({
  family: "Urbanist",
  url: staticFile("fonts/urbanist-latin-wght-normal.woff2"),
  weight: "100 900",
});
loadFont({
  family: "JetBrains Mono",
  url: staticFile("fonts/jetbrains-mono-latin-wght-normal.woff2"),
  weight: "100 800",
});
