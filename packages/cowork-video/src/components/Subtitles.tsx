import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { OUTRO_START, captions } from "../timeline";
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
        bottom: v ? 132 : 108,
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
          background: f >= OUTRO_START ? C.bg : C.white,
          color: f >= OUTRO_START ? C.white : C.bg,
          fontFamily: font,
          fontWeight: 600,
          fontSize: v ? 25 : 24,
          lineHeight: 1.25,
          textAlign: "center",
          opacity:
            ramp(f, line[0], line[0] + 7) * (1 - ramp(f, line[1] - 5, line[1])),
          transform: `translateY(${(1 - ramp(f, line[0], line[0] + 12)) * 8}px)`,
        }}
      >
        {line[2]}
      </div>
    </div>
  );
};
