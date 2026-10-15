import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { captions } from "../timeline";
import { C, font, ramp } from "../theme";
export const Subtitles: React.FC = () => {
  const f = useCurrentFrame();
  const { height, width } = useVideoConfig();
  const v = height > width;
  const line = captions.find(([a, b]) => f >= a && f < b);
  if (!line) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: v ? 108 : 92,
        left: v ? 85 : 200,
        right: v ? 85 : 200,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          padding: "12px 22px",
          background: f >= 930 ? C.bg : C.white,
          color: f >= 930 ? C.white : C.bg,
          fontFamily: font,
          fontWeight: 600,
          fontSize: v ? 25 : 24,
          lineHeight: 1.25,
          textAlign: "center",
          opacity: ramp(f, line[0], line[0] + 4),
          transform: `translateY(${(1 - ramp(f, line[0], line[0] + 6)) * 8}px)`,
        }}
      >
        {line[2]}
      </div>
    </div>
  );
};
