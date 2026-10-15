import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, mono } from "../theme";
export const HudFrame: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const v = height > width;
  const light = frame >= 930;
  const ink = light ? C.bg : C.muted;
  const tc = [
    Math.floor(frame / fps / 3600),
    Math.floor(frame / fps / 60) % 60,
    Math.floor(frame / fps) % 60,
    frame % fps,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        padding: v ? 32 : 36,
        fontFamily: mono,
        fontSize: v ? 15 : 14,
        color: ink,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: v ? 32 : 36,
          border: `1px solid ${light ? "#14141635" : C.line}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: v ? 55 : 64,
          top: v ? 57 : 61,
          letterSpacing: 1.5,
        }}
      >
        SEDNIUM // COWORK RELAY V1.0
      </div>
      <div
        style={{
          position: "absolute",
          right: v ? 55 : 64,
          top: v ? 57 : 61,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {tc}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: v ? 58 : 60,
          left: v ? 58 : 64,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{ width: 6, height: 6, background: light ? C.bg : C.green }}
        />{" "}
        SYSTEM ONLINE{" "}
        <span style={{ marginLeft: 15, opacity: 0.5 }}>
          30 FPS / {v ? "9:16" : "16:9"}
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: v ? 58 : 60,
          right: v ? 58 : 64,
        }}
      >
        S/
        {String(
          frame < 135
            ? 1
            : frame < 240
              ? 2
              : frame < 480
                ? 3
                : frame < 780
                  ? 4
                  : frame < 930
                    ? 5
                    : 6,
        ).padStart(2, "0")}{" "}
        — 06
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            fontSize: 24,
            fontWeight: 400,
            left: i % 2 === 0 ? (v ? 25 : 29) : undefined,
            right: i % 2 ? (v ? 25 : 29) : undefined,
            top: i < 2 ? (v ? 18 : 22) : undefined,
            bottom: i >= 2 ? (v ? 18 : 22) : undefined,
          }}
        >
          +
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          bottom: v ? 32 : 36,
          left: v ? 32 : 36,
          height: 2,
          width: `${(frame / 1049) * (v ? 1016 : 1848)}px`,
          background: light ? C.bg : C.orange,
        }}
      />
    </AbsoluteFill>
  );
};
