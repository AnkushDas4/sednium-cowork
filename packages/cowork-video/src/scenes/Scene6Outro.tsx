import React from "react";
import { ArrowUpRight } from "lucide-react";
import { C, mono, useScene, enter, ease } from "../theme";
import { Logo, Label } from "../components/Primitives";
export const Scene6Outro: React.FC = () => {
  const { f, vertical: v } = useScene();
  const held = Math.min(f, 142);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: C.white,
        color: C.bg,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(#1414160D 1px,transparent 1px),linear-gradient(90deg,#1414160D 1px,transparent 1px)",
          backgroundSize: v ? "180px 180px" : "240px 180px",
          opacity: ease(f, 0, 36),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: v ? "245px 100px 260px" : "150px 140px 190px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            ...enter(held, 6, 18),
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: v ? 80 : 40,
          }}
        >
          <Logo size={v ? 76 : 60} />
          <Label style={{ color: C.bg, fontSize: v ? 19 : 16 }}>
            SEDNIUM COWORK / OPEN SOURCE
          </Label>
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", gap: v ? 32 : 22 }}
        >
          {[
            "ZERO LOGINS.",
            "ZERO MERGE CONFLICTS.",
            "ONE SHARED MAIN BRANCH.",
          ].map((t, i) => (
            <div key={t} style={{ overflow: "hidden", paddingBottom: 4 }}>
              <div
                style={{
                  ...enter(held, 14 + i * 26, 30),
                  fontSize: v ? 76 : 70,
                  fontWeight: 800,
                  letterSpacing: -2.5,
                  lineHeight: 1.08,
                  color: i === 2 ? C.orange : C.bg,
                }}
              >
                {t}
              </div>
            </div>
          ))}
        </div>
        <div style={{ ...enter(held, 98, 24), marginTop: v ? 96 : 48 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 36,
              background: C.orange,
              padding: v ? "30px 32px" : "22px 30px",
              fontSize: v ? 46 : 42,
              fontWeight: 800,
              letterSpacing: -1,
            }}
          >
            cowork.sednium.com <ArrowUpRight size={40} />
          </div>
          <div
            style={{
              fontFamily: mono,
              fontSize: v ? 15 : 14,
              marginTop: 28,
              lineHeight: 1.8,
            }}
          >
            github.com/AnkushDas4/sednium-cowork
            <br />
            OPEN SOURCE MCP + RELAY
          </div>
        </div>
      </div>
    </div>
  );
};
