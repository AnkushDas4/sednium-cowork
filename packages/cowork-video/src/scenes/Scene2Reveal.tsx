import React from "react";
import { C, mono, useScene, pop, ease, enter } from "../theme";
import { Chip, Label, Logo, Title } from "../components/Primitives";
export const Scene2Reveal: React.FC = () => {
  const { f, fps, vertical: v } = useScene();
  const command =
    "$ curl -fLO https://cowork.sednium.com/install.mjs && node install.mjs";
  return (
    <>
      <div style={{ position: "absolute", inset: 0, opacity: 0.65 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: `${i * 16.67}%`,
                width: "100%",
                height: 1,
                background: C.line,
                transform: `scaleX(${ease(f, i * 2, i * 2 + 45)})`,
                transformOrigin: "center",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: `${i * 16.67}%`,
                width: 1,
                height: "100%",
                background: C.line,
                transform: `scaleY(${ease(f, i * 2, i * 2 + 45)})`,
                transformOrigin: "center",
              }}
            />
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          inset: v ? "280px 100px 260px" : "155px 140px 180px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <Label style={{ ...enter(f, 2, 12), marginBottom: v ? 48 : 32 }}>
          INTRODUCING / A SHARED OPERATING LAYER
        </Label>
        <div
          style={{
            opacity: ease(f, 2, 20),
            transform: `scale(${0.94 + pop(f, fps, 2) * 0.06})`,
          }}
        >
          <Logo size={v ? 152 : 108} />
        </div>
        <Title
          style={{ fontSize: v ? 108 : 102, marginTop: 36, letterSpacing: -3 }}
        >
          {["SEDNIUM", "COWORK"].map((s, i) => (
            <span
              key={s}
              style={{
                display: v ? "block" : "inline-block",
                marginRight: v ? 0 : 24,
                ...enter(f, 8 + i * 5, 24),
              }}
            >
              {s}
            </span>
          ))}
        </Title>
        <div
          style={{
            ...enter(f, 18, 16),
            fontSize: v ? 30 : 28,
            color: C.muted,
            marginTop: 28,
          }}
        >
          Every agent. Every machine. One room.
        </div>
        <div
          style={{
            ...enter(f, 24, 18),
            marginTop: v ? 88 : 52,
            width: v ? "100%" : 1120,
            border: `1px solid ${C.line}`,
            background: C.bg,
            padding: v ? "28px 30px" : "22px 28px",
            fontFamily: mono,
            fontSize: v ? 19 : 21,
            textAlign: "left",
            lineHeight: 1.8,
            minHeight: v ? 114 : 84,
            overflowWrap: "anywhere",
          }}
        >
          {command.slice(0, Math.max(0, Math.floor((f - 20) * 1.8)))}
          <span style={{ color: C.orange, opacity: f < 64 ? 1 : 0 }}>|</span>
        </div>
        <Chip
          style={{ ...enter(f, 54, 12), marginTop: 24, fontSize: v ? 15 : 16 }}
        >
          MCP HANDSHAKE VERIFIED / ~950KB SINGLE FILE
        </Chip>
      </div>
    </>
  );
};
