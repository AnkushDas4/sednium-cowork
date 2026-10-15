import React from "react";
import { C, mono, useScene, pop, ramp } from "../theme";
import {
  Chip,
  Label,
  Panel,
  SceneShell,
  Title,
} from "../components/Primitives";
export const Scene5Mobile: React.FC = () => {
  const { f, fps, vertical: v } = useScene();
  const sent = f >= 65;
  const text = "ship the dark mode toggle and sync main";
  return (
    <SceneShell vertical={v}>
      <Label>03 / CROSS-PROMPT DISPATCH</Label>
      <Title style={{ fontSize: v ? 85 : 68, marginTop: 20 }}>
        Away from your desk.
        <br />
        <span style={{ color: C.muted }}>Still in command.</span>
      </Title>
      <div
        style={{
          position: "absolute",
          top: v ? 300 : 240,
          left: v ? 210 : 110,
          width: v ? 508 : 415,
          height: v ? 830 : 520,
          border: "2px solid #4A4A50",
          borderRadius: 36,
          background: "#0D0D0F",
          padding: v ? "26px 18px" : "18px 16px",
          transform: `perspective(1600px) rotateY(${(1 - pop(f, fps)) * -18}deg) translateY(${(1 - pop(f, fps)) * 100}px)`,
          boxShadow: "12px 14px 0 #09090B",
        }}
      >
        <div
          style={{
            width: 100,
            height: 7,
            background: C.line,
            margin: "0 auto 22px",
            borderRadius: 5,
          }}
        />
        <div
          style={{
            fontFamily: mono,
            fontSize: 13,
            color: C.muted,
            textAlign: "center",
            paddingBottom: 18,
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          cowork.sednium.com
        </div>
        <div style={{ padding: "22px 12px" }}>
          <Label style={{ fontSize: 13 }}>SEDNIUM / MOBILE HUD</Label>
          <div style={{ fontSize: 31, fontWeight: 700, marginTop: 16 }}>
            Room SED-409
          </div>
          <Chip style={{ marginTop: 18, fontSize: 12 }}>+ 2 AGENTS ONLINE</Chip>
          <div
            style={{
              marginTop: v ? 55 : 26,
              fontFamily: mono,
              fontSize: 14,
              color: C.muted,
              lineHeight: 2,
            }}
          >
            14:22:08 <span style={{ color: C.white }}>@loid-ai</span>
            <br />
            Auth schema pushed. Ready.
          </div>
          <div
            style={{
              display: v ? "block" : "none",
              marginTop: v ? 25 : 12,
              fontFamily: mono,
              fontSize: 14,
              color: C.muted,
              lineHeight: 2,
            }}
          >
            14:22:11 <span style={{ color: C.white }}>@peer-ai</span>
            <br />
            Listening for your next task.
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 28,
            left: 20,
            right: 20,
            border: `1px solid ${sent ? C.orange : C.line}`,
            padding: v ? 20 : 15,
            background: C.panel,
          }}
        >
          <span
            style={{
              background: C.orange,
              color: C.bg,
              padding: "6px 10px",
              fontFamily: mono,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            @peer-ai
          </span>
          <div
            style={{
              fontFamily: mono,
              fontSize: v ? 19 : 16,
              lineHeight: 1.65,
              height: v ? 130 : 80,
              marginTop: 20,
            }}
          >
            &gt; {text.slice(0, Math.max(0, Math.floor((f - 12) * 0.85)))}
            {!sent && "|"}
          </div>
          <div
            style={{
              background: C.orange,
              color: C.bg,
              padding: 14,
              textAlign: "center",
              fontFamily: mono,
              fontWeight: 600,
              fontSize: 16,
              transform: `scale(${f >= 65 && f < 71 ? 0.94 : 1})`,
            }}
          >
            {sent ? "OK DISPATCHED" : "DISPATCH >"}
          </div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: v ? 1200 : 330,
          left: v ? 0 : 715,
          width: v ? "100%" : 790,
          transform: `translateY(${(1 - pop(f, fps, 12)) * 70}px)`,
        }}
      >
        <Panel title="LAPTOP 02 // @peer-ai">
          <div
            style={{
              padding: v ? 24 : 30,
              fontFamily: mono,
              fontSize: v ? 19 : 20,
              lineHeight: 2.1,
              minHeight: v ? 220 : 230,
            }}
          >
            <div style={{ color: sent ? C.orange : C.muted }}>
              {sent ? "[INBOX WORK ORDER RECEIVED]" : "$ cowork_sync --watch"}
            </div>
            {f > 80 && (
              <div style={{ color: C.white }}>
                <span style={{ color: C.muted }}>EDIT </span>{" "}
                src/ThemeToggle.tsx
              </div>
            )}
            {f > 100 && (
              <div style={{ color: C.muted }}>
                + darkMode.toggle() <span style={{ color: C.green }}>OK</span>
              </div>
            )}
            {f > 118 && (
              <div style={{ color: C.green }}>[OK PUSHED TO MAIN]</div>
            )}
          </div>
        </Panel>
      </div>
      {sent && f < 88 && (
        <div
          style={{
            position: "absolute",
            width: v ? 4 : 14,
            height: v ? 14 : 4,
            background: C.orange,
            left: v ? 464 : 540 + ramp(f, 65, 86) * 160,
            top: v ? 1140 + ramp(f, 65, 86) * 55 : 460,
          }}
        />
      )}
    </SceneShell>
  );
};
