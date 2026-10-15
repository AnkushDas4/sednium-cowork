import React from "react";
import { spring } from "remotion";
import { C, mono, useScene, ramp } from "../theme";
import { Label, Panel, SceneShell, Title } from "../components/Primitives";
export const Scene1Chaos: React.FC = () => {
  const { f, fps, vertical: v } = useScene();
  const jitter = f >= 60 && f <= 115 ? Math.sin(f * 1.8) * 5 : 0;
  return (
    <>
      <SceneShell vertical={v} style={{ transform: `translateX(${jitter}px)` }}>
        <Label>00 / THE COORDINATION PROBLEM</Label>
        <Title style={{ fontSize: v ? 91 : 92, marginTop: 24 }}>
          More agents.
          <br />
          <span style={{ color: C.muted }}>More collisions.</span>
        </Title>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: v ? "1fr" : "1fr 1fr",
            gap: v ? 28 : 36,
            marginTop: v ? 80 : 56,
          }}
        >
          {[0, 1].map((n) => {
            const p = spring({
              frame: f - n * 5,
              fps,
              config: { damping: 14, stiffness: 160 },
            });
            const text =
              n === 0
                ? "export async function POST(req) {\n  const user = await authenticate(req);\n  return session.create(user);\n}"
                : "export function POST(request) {\n  const token = request.headers.token;\n  return authorize(token);\n}";
            return (
              <Panel
                key={n}
                title={`LAPTOP 0${n + 1} // AGENT ${n === 0 ? "A" : "B"}`}
                style={{
                  transform: `translateX(${(1 - p) * (n === 0 ? -1100 : 1100)}px)`,
                  minHeight: v ? 300 : 260,
                }}
              >
                <div
                  style={{
                    padding: 24,
                    fontFamily: mono,
                    fontSize: v ? 21 : 19,
                    lineHeight: 1.8,
                  }}
                >
                  <div style={{ color: C.muted, marginBottom: 18 }}>
                    <span style={{ color: C.orange }}>EDITING</span>{" "}
                    src/api/routes.ts
                  </div>
                  <pre
                    style={{
                      margin: 0,
                      color: n === 0 ? C.white : "#B5B5BA",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {text.slice(0, Math.max(0, Math.floor((f - 12) * 3)))}
                    <span style={{ color: C.orange }}>|</span>
                  </pre>
                </div>
              </Panel>
            );
          })}
        </div>
        {f >= 55 && (
          <div
            style={{
              position: "absolute",
              left: v ? -15 : 80,
              right: v ? -15 : 80,
              top: v ? 760 : 335,
              background: C.red,
              color: C.bg,
              padding: v ? "32px 28px" : "30px 36px",
              transform: `scale(${1 + (1 - ramp(f, 55, 64)) * 0.15}) rotate(-1deg)`,
              boxShadow: "0 10px 0 #0008",
              fontFamily: mono,
              fontWeight: 600,
            }}
          >
            <div style={{ fontSize: v ? 32 : 28 }}>[ ! GIT CONFLICT ]</div>
            <div
              style={{ fontSize: v ? 21 : 20, marginTop: 12, lineHeight: 1.6 }}
            >
              Automatic merge failed in src/api/routes.ts
              <br />
              42 lines overwritten
            </div>
          </div>
        )}
      </SceneShell>
      {f >= 125 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: C.bg,
            transform: `scaleY(${ramp(f, 125, 129)})`,
            transformOrigin: "center",
          }}
        />
      )}
    </>
  );
};
