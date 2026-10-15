import React from "react";
import { ArrowUpRight } from "lucide-react";
import { C, mono, useScene, pop, ramp } from "../theme";
import { Logo, Label } from "../components/Primitives";
export const Scene6Outro: React.FC = () => {
  const { f, fps, vertical: v } = useScene();
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: C.white,
        color: "#141416",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(#1414160D 1px, transparent 1px),linear-gradient(90deg,#1414160D 1px,transparent 1px)",
          backgroundSize: v ? "180px 180px" : "240px 180px",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: v ? "230px 76px 220px" : "140px 125px 140px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            marginBottom: v ? 100 : 35,
          }}
        >
          <Logo size={v ? 80 : 62} />
          <Label style={{ color: C.bg, fontSize: v ? 21 : 18 }}>
            SEDNIUM COWORK / OPEN SOURCE
          </Label>
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", gap: v ? 27 : 12 }}
        >
          {[
            "ZERO LOGINS.",
            "ZERO MERGE CONFLICTS.",
            "ONE SHARED MAIN BRANCH.",
          ].map((t, i) => (
            <div
              key={t}
              style={{
                fontSize: v ? 78 : 76,
                fontWeight: 800,
                letterSpacing: v ? -3 : -2.5,
                lineHeight: 1.04,
                opacity: ramp(f, 5 + i * 20, 8 + i * 20),
                transform: `translateY(${(1 - pop(f, fps, 5 + i * 20)) * 40}px)`,
                color: i === 2 ? C.orange : C.bg,
              }}
            >
              {t}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: v ? 110 : 42,
            opacity: ramp(f, 60, 66),
            transform: `translateY(${(1 - pop(f, fps, 60)) * 40}px)`,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: v ? 25 : 45,
              background: C.orange,
              padding: v ? "30px 34px" : "22px 32px",
              fontSize: v ? 48 : 44,
              fontWeight: 800,
              letterSpacing: -1,
            }}
          >
            cowork.sednium.com{" "}
            <ArrowUpRight size={v ? 48 : 44} strokeWidth={2} />
          </div>
          <div
            style={{
              fontFamily: mono,
              fontSize: v ? 16 : 15,
              marginTop: 24,
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
