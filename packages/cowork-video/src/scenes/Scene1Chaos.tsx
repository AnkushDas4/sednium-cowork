import React from "react";
import { C, mono, useScene, enter, ramp } from "../theme";
import { Label, Panel, SceneShell, Title } from "../components/Primitives";
import { Reveal } from "../components/Motion";
export const Scene1Chaos: React.FC = () => {
  const { f, vertical: v } = useScene();
  return (
    <SceneShell vertical={v}>
      <Reveal>
        <Label>00 / THE COORDINATION PROBLEM</Label>
        <Title style={{ fontSize: v ? 86 : 80, marginTop: 26 }}>
          More agents.
          <br />
          <span style={{ color: C.muted }}>More collisions.</span>
        </Title>
      </Reveal>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: v ? "1fr" : "1fr 1fr",
          gap: 32,
          marginTop: v ? 64 : 44,
        }}
      >
        {[0, 1].map((n) => {
          const text =
            n === 0
              ? "export async function POST(req) {\n  const user = await authenticate(req);\n  return session.create(user);\n}"
              : "export function POST(request) {\n  const token = request.headers.token;\n  return authorize(token);\n}";
          return (
            <Panel
              key={n}
              title={`LAPTOP 0${n + 1} // AGENT ${n === 0 ? "A" : "B"}`}
              style={{ ...enter(f, 18 + n * 14, 32), height: v ? 288 : 264 }}
            >
              <div
                style={{
                  padding: v ? 28 : 26,
                  fontFamily: mono,
                  fontSize: v ? 21 : 18,
                  lineHeight: 1.8,
                }}
              >
                <div style={{ color: C.muted, marginBottom: 20 }}>
                  <span style={{ color: C.orange }}>EDITING</span>{" "}
                  src/api/routes.ts
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontFamily: mono,
                    fontSize: "inherit",
                    whiteSpace: "pre-wrap",
                    color: n === 0 ? C.white : "#B5B5BA",
                  }}
                >
                  {text.slice(
                    0,
                    Math.max(0, Math.floor((f - 40 - n * 10) * 1.5)),
                  )}
                  <span style={{ color: C.orange, opacity: f < 128 ? 1 : 0 }}>
                    |
                  </span>
                </pre>
              </div>
            </Panel>
          );
        })}
      </div>
      <div
        style={{
          ...enter(f, 128, 18),
          marginTop: 32,
          border: `1px solid ${C.red}80`,
          background: C.red + "12",
          padding: v ? "26px 30px" : "22px 28px",
          fontFamily: mono,
          display: "flex",
          flexDirection: v ? "column" : "row",
          gap: v ? 14 : 36,
          alignItems: v ? "flex-start" : "center",
        }}
      >
        <div
          style={{
            fontSize: v ? 24 : 21,
            color: C.red,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          [ ! GIT CONFLICT ]
        </div>
        <div style={{ fontSize: v ? 19 : 17, lineHeight: 1.6, color: C.white }}>
          Automatic merge failed in src/api/routes.ts
          <br />
          <span style={{ color: C.muted }}>
            42 lines overwritten · Two agents. One uncoordinated file.
          </span>
        </div>
        <div
          style={{
            marginLeft: v ? 0 : "auto",
            width: 6,
            height: v ? 3 : 48,
            background: C.red,
            opacity: ramp(f, 130, 150),
          }}
        />
      </div>
    </SceneShell>
  );
};
