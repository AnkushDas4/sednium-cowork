import React from "react";
import { ArrowRight, Check } from "lucide-react";
import { C, mono, useScene, enter, ease, ramp } from "../theme";
import {
  Chip,
  Label,
  Panel,
  SceneShell,
  Title,
} from "../components/Primitives";
import { Reveal } from "../components/Motion";
export const Scene5Mobile: React.FC = () => {
  const { f, vertical: v } = useScene();
  const sent = f >= 88;
  const received = f >= 108;
  const text = "ship the dark mode toggle and sync main";
  const press = ease(f, 84, 89) * (1 - ease(f, 90, 98));
  return (
    <SceneShell vertical={v}>
      <Reveal>
        <Label>03 / CROSS-PROMPT DISPATCH</Label>
        <Title style={{ fontSize: v ? 78 : 65, marginTop: 26 }}>
          Away from your desk.
          <br />
          <span style={{ color: C.muted }}>Still in command.</span>
        </Title>
      </Reveal>
      <div
        style={{
          position: "relative",
          marginTop: v ? 58 : 40,
          display: "grid",
          gridTemplateColumns: v ? "1fr" : "520px 1fr",
          gap: v ? 56 : 112,
          alignItems: "center",
        }}
      >
        <div
          style={{
            ...enter(f, 12, 28),
            width: v ? 510 : 416,
            height: v ? 760 : 502,
            justifySelf: "center",
            border: "2px solid #44444A",
            borderRadius: 32,
            background: "#0D0D0F",
            padding: v ? "26px 22px" : "18px",
            boxShadow: "8px 10px 0 #09090B",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              height: 6,
              width: 88,
              background: C.line,
              borderRadius: 5,
              margin: "0 auto 20px",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontFamily: mono,
              fontSize: 11,
              color: C.muted,
              textAlign: "center",
              paddingBottom: 18,
              borderBottom: `1px solid ${C.line}`,
            }}
          >
            cowork.sednium.com
          </div>
          <div style={{ padding: v ? "26px 12px" : "20px 10px" }}>
            <Label style={{ fontSize: 11, letterSpacing: 1 }}>
              SEDNIUM / MOBILE HUD
            </Label>
            <div
              style={{ fontSize: v ? 34 : 29, fontWeight: 700, marginTop: 14 }}
            >
              Room SED-409
            </div>
            <Chip style={{ fontSize: 10, marginTop: 16 }}>2 AGENTS ONLINE</Chip>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: v ? "24px 12px" : "0 10px",
              fontFamily: mono,
              fontSize: v ? 15 : 12,
              color: C.muted,
              lineHeight: 1.9,
            }}
          >
            <span style={{ color: C.white }}>@loid-ai</span>
            <br />
            Auth schema pushed. Ready.
            {v && (
              <>
                <br />
                <br />
                <span style={{ color: C.white }}>@peer-ai</span>
                <br />
                Listening for your next task.
              </>
            )}
          </div>
          <div
            style={{
              border: `1px solid ${sent ? C.orange : C.line}`,
              padding: v ? 22 : 16,
              background: C.panel,
              marginTop: 20,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                background: C.orange,
                color: C.bg,
                padding: "6px 10px",
                fontFamily: mono,
                fontSize: v ? 16 : 13,
                fontWeight: 600,
              }}
            >
              @peer-ai
            </span>
            <div
              style={{
                fontFamily: mono,
                fontSize: v ? 19 : 15,
                lineHeight: 1.7,
                height: v ? 102 : 70,
                marginTop: 22,
              }}
            >
              &gt; {text.slice(0, Math.max(0, Math.floor((f - 24) * 0.65)))}
              {!sent && "|"}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                background: C.orange,
                color: C.bg,
                padding: v ? 17 : 13,
                fontFamily: mono,
                fontWeight: 600,
                fontSize: 14,
                transform: `scale(${1 - press * 0.025})`,
              }}
            >
              {sent ? <Check size={17} /> : <ArrowRight size={17} />}{" "}
              {sent ? "DISPATCHED" : "DISPATCH"}
            </div>
          </div>
        </div>
        <Panel
          title="LAPTOP 02 // @peer-ai"
          style={{ ...enter(f, 28, 24), minHeight: v ? 292 : 318 }}
        >
          <div
            style={{
              padding: v ? 28 : 32,
              fontFamily: mono,
              fontSize: v ? 20 : 19,
              lineHeight: 2.1,
            }}
          >
            <div style={{ color: received ? C.orange : C.muted }}>
              {received
                ? "[INBOX WORK ORDER RECEIVED]"
                : "$ cowork_sync --watch"}
            </div>
            <div style={{ ...enter(f, 118, 10), marginTop: 16 }}>
              <span style={{ color: C.muted }}>EDIT </span> src/ThemeToggle.tsx
            </div>
            <div style={{ ...enter(f, 130, 10), color: C.muted }}>
              + darkMode.toggle()
            </div>
            <div style={{ ...enter(f, 142, 10), color: C.green }}>
              [OK PUSHED TO MAIN]
            </div>
          </div>
        </Panel>
        <svg
          width={v ? 904 : 1640}
          height={v ? 1150 : 510}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {v ? (
            <>
              <path d="M452 802 V846" stroke={C.line} strokeWidth={2} />
              <circle
                cx={452}
                cy={802 + ease(f, 88, 108) * 44}
                r={4}
                fill={C.orange}
                opacity={ramp(f, 88, 91) * (1 - ramp(f, 105, 108))}
              />
            </>
          ) : (
            <>
              <path d="M472 251 H622" stroke={C.line} strokeWidth={2} />
              <circle
                cx={472 + ease(f, 88, 108) * 150}
                cy={251}
                r={4}
                fill={C.orange}
                opacity={ramp(f, 88, 91) * (1 - ramp(f, 105, 108))}
              />
            </>
          )}
        </svg>
      </div>
    </SceneShell>
  );
};
