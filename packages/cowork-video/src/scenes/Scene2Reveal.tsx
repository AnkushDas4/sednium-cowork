import React from "react";
import { C, mono, useScene, pop, ramp } from "../theme";
import { Chip, Label, Logo, Title } from "../components/Primitives";
export const Scene2Reveal: React.FC = () => {
  const { f, fps, vertical: v } = useScene();
  const command =
    "$ curl -fLO https://cowork.sednium.com/install.mjs && node install.mjs";
  return (
    <>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <React.Fragment key={i}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: `${i * 16.67}%`,
                width: `${ramp(f, i * 2, i * 2 + 20) * 100}%`,
                height: 1,
                background: C.line,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: `${i * 16.67}%`,
                height: `${ramp(f, i * 2, i * 2 + 20) * 100}%`,
                width: 1,
                background: C.line,
              }}
            />
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          inset: v ? "290px 76px 200px" : "160px 100px 140px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <Label style={{ marginBottom: 32, opacity: ramp(f, 8, 20) }}>
          INTRODUCING / A SHARED OPERATING LAYER
        </Label>
        <div style={{ transform: `scale(${pop(f, fps, 6)})` }}>
          <Logo size={v ? 168 : 120} />
        </div>
        <Title
          style={{ fontSize: v ? 108 : 110, marginTop: 32, letterSpacing: -4 }}
        >
          {["SEDNIUM", "COWORK"].map((s, i) => (
            <span
              key={s}
              style={{
                display: v ? "block" : "inline-block",
                marginRight: v ? 0 : 22,
                opacity: ramp(f, 16 + i * 6, 28 + i * 6),
                transform: `translateY(${(1 - pop(f, fps, 16 + i * 6)) * 50}px)`,
              }}
            >
              {s}
            </span>
          ))}
        </Title>
        <div style={{ fontSize: v ? 31 : 28, color: C.muted, marginTop: 22 }}>
          Every agent. Every machine. One room.
        </div>
        <div
          style={{
            marginTop: v ? 75 : 44,
            background: C.bg,
            border: `1px solid ${C.line}`,
            padding: v ? "25px 24px" : "22px 30px",
            width: v ? "100%" : 1170,
            textAlign: "left",
            fontFamily: mono,
            fontSize: v ? 20 : 22,
            minHeight: v ? 130 : 76,
            lineHeight: 1.7,
            overflowWrap: "anywhere",
          }}
        >
          <span style={{ color: C.orange }}>&gt; </span>
          {command.slice(0, Math.max(0, (f - 28) * 2))}
          <span style={{ color: C.orange }}>|</span>
        </div>
        <Chip
          style={{
            marginTop: 22,
            opacity: ramp(f, 70, 80),
            fontSize: v ? 16 : 17,
          }}
        >
          OK MCP HANDSHAKE VERIFIED • 950KB SINGLE FILE
        </Chip>
      </div>
    </>
  );
};
