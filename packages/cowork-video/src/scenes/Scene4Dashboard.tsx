import React from "react";
import { GitBranch, Lock, ShieldCheck, ArrowRight } from "lucide-react";
import { interpolateColors } from "remotion";
import { C, mono, useScene, enter, ease, ramp, dashboardScale } from "../theme";
import { Chip, Dots, Label, SceneShell, Title } from "../components/Primitives";
import { Reveal } from "../components/Motion";
export const Scene4Dashboard: React.FC = () => {
  const { f, vertical: v } = useScene();
  const synced = f >= 244;
  const locks = f >= 95;
  return (
    <SceneShell vertical={v}>
      <Reveal>
        <Label>02 / THE LIVE WORKSPACE</Label>
        <Title style={{ fontSize: v ? 76 : 72, marginTop: 26 }}>
          Claim. Coordinate. Ship.
        </Title>
      </Reveal>
      <div
        style={{
          ...enter(f, 12, 24),
          transform: `${enter(f, 12, 24).transform} scale(${dashboardScale(v)})`,
          transformOrigin: "top center",
          marginTop: v ? 54 : 42,
          border: `1px solid ${C.line}`,
          background: C.bg,
        }}
      >
        <div
          style={{
            height: v ? 86 : 56,
            padding: v ? "16px 26px" : "0 26px",
            display: "flex",
            alignItems: "center",
            gap: v ? 20 : 32,
            flexWrap: "wrap",
            fontFamily: mono,
            fontSize: v ? 15 : 14,
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <GitBranch size={19} color={C.orange} /> BRANCH: main
          </span>
          <span style={{ color: synced ? C.green : C.muted }}>
            HEAD: {synced ? "8f3a19c" : "a3f9c21"}
          </span>
          <span style={{ marginLeft: v ? 0 : "auto", color: C.muted }}>
            REPO LOCKED:{" "}
            <span style={{ color: C.white }}>AnkushDas4/sednium-cowork</span>
          </span>
        </div>
        <div
          style={{
            height: v ? 104 : 68,
            padding: "18px 26px",
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
            fontFamily: mono,
            fontSize: v ? 16 : 14,
            borderBottom: `1px solid ${C.line}`,
          }}
        >
          <span style={{ color: C.muted, fontSize: 12 }}>LIVE ACTIVITY</span>
          <Dots color={C.orange} />
          <span
            style={{ color: C.orange, opacity: 0.85 + 0.15 * Math.sin(f / 36) }}
          >
            @loid-ai
          </span>
          <span>
            {synced
              ? "SYNCED / Main branch up to date"
              : "EDITING / Refactoring auth middleware"}
          </span>
          <Chip
            style={{ marginLeft: v ? 0 : "auto", fontSize: 12 }}
            color={C.muted}
          >
            src/auth.ts
          </Chip>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: v ? "1fr" : "420px 1fr",
            gap: 0,
            height: v ? "auto" : 460,
          }}
        >
          <div
            style={{
              padding: v ? 28 : 24,
              borderRight: v ? undefined : `1px solid ${C.line}`,
              borderBottom: v ? `1px solid ${C.line}` : undefined,
            }}
          >
            <Label style={{ fontSize: 12, color: C.muted, letterSpacing: 1 }}>
              AGENT NODES / <span style={{ color: C.green }}>02 ONLINE</span>
            </Label>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: v ? "1fr 1fr" : "1fr",
                gap: v ? 20 : 16,
                marginTop: v ? 24 : 20,
              }}
            >
              {["@loid-ai", "@peer-ai"].map((name, i) => (
                <div
                  key={name}
                  style={{
                    padding: v ? "20px" : "16px 20px",
                    background: interpolateColors(
                      f,
                      [230, 260],
                      [C.panel, "#15201C"],
                    ),
                    border: `1px solid ${interpolateColors(f, [230, 260], [C.line, "#285442"])}`,
                    ...enter(f, 28 + i * 12, 16),
                  }}
                >
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: v ? 21 : 19,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    {name}
                    <Dots />
                  </div>
                  <div
                    style={{
                      fontFamily: mono,
                      fontSize: v ? 12 : 11,
                      lineHeight: 1.7,
                      color: synced ? C.green : C.muted,
                      marginTop: 14,
                      minHeight: v ? 40 : 22,
                    }}
                  >
                    {synced
                      ? "GIT PUSH > AUTO-PULL SYNCED"
                      : i === 0
                        ? "CURRENT TASK / auth middleware"
                        : "CURRENT TASK / login form"}
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: v ? 28 : 22,
                paddingTop: v ? 24 : 18,
                borderTop: `1px solid ${C.line}`,
                minHeight: v ? 110 : 80,
              }}
            >
              <Label style={{ fontSize: 11, letterSpacing: 1, color: C.muted }}>
                FILE LOCK REGISTRY / 90S TTL
              </Label>
              <div style={{ ...enter(f, 95, 12), marginTop: 20 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontFamily: mono,
                    fontSize: v ? 19 : 16,
                  }}
                >
                  <Lock size={18} color={C.orange} /> src/auth.ts{" "}
                  <span style={{ marginLeft: "auto", color: C.orange }}>
                    {89 - Math.max(0, Math.floor((f - 95) / 30))}s
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: 11,
                    color: C.muted,
                    marginTop: 14,
                  }}
                >
                  LOCKED BY @loid-ai / ATOMIC LEASE
                </div>
              </div>
              {!locks && (
                <span
                  style={{ fontFamily: mono, fontSize: 12, color: C.muted }}
                >
                  WAITING FOR CLAIM
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              padding: v ? 28 : 24,
              display: "flex",
              flexDirection: "column",
              gap: v ? 22 : 18,
            }}
          >
            <div
              style={{
                fontFamily: mono,
                fontSize: 12,
                color: C.muted,
                display: "flex",
                gap: 28,
                paddingBottom: 20,
                borderBottom: `1px solid ${C.line}`,
              }}
            >
              <span style={{ color: C.orange }}>ALL EVENTS</span>
              <span>MENTIONS</span>
              <span>GIT SYNC</span>
            </div>
            <div
              style={{
                ...enter(f, 30, 16),
                borderLeft: `2px solid ${C.orange}`,
                padding: v ? "22px 24px" : "16px 22px",
                background: C.panel,
                minHeight: v ? 150 : 110,
              }}
            >
              <div style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>
                14:22:08{" "}
                <span style={{ color: C.orange, marginLeft: 16 }}>
                  [AGENT_SYNC]
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  fontFamily: mono,
                  fontSize: v ? 17 : 14,
                  marginTop: 14,
                }}
              >
                @loid-ai <ArrowRight size={15} /> @peer-ai
              </div>
              <div
                style={{
                  fontSize: v ? 26 : 23,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  marginTop: 14,
                }}
              >
                “Auth schema pushed. Hook up the login form to POST
                /api/session.”
              </div>
            </div>
            <div
              style={{
                ...enter(f, 115, 16),
                border: `1px solid ${C.orange}55`,
                padding: v ? "24px" : "16px 22px",
                background: C.orange + "08",
                display: "flex",
                gap: 18,
                alignItems: "flex-start",
                minHeight: v ? 102 : 80,
              }}
            >
              <ShieldCheck size={24} color={C.orange} />
              <div
                style={{
                  fontFamily: mono,
                  fontSize: v ? 18 : 15,
                  lineHeight: 1.7,
                }}
              >
                <span style={{ color: C.orange }}>409 LOCK HELD</span> /
                @peer-ai
                <div
                  style={{
                    fontSize: v ? 15 : 12,
                    color: C.muted,
                    marginTop: 10,
                  }}
                >
                  REROUTED &gt; src/components/Navbar.tsx
                </div>
              </div>
            </div>
            <div
              style={{
                ...enter(f, 205, 16),
                display: "flex",
                alignItems: "center",
                gap: 18,
                minHeight: v ? 52 : 44,
                fontFamily: mono,
                fontSize: v ? 18 : 15,
                color: C.green,
              }}
            >
              <svg width={112} height={32} viewBox="0 0 112 32">
                <path d="M8 16 H104" stroke={C.line} strokeWidth={2} />
                <path
                  d="M8 16 H104"
                  stroke={C.green}
                  strokeWidth={2}
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - ease(f, 205, 244)}
                />
                <circle
                  cx={8 + ease(f, 205, 244) * 96}
                  cy={16}
                  r={6}
                  fill={C.green}
                />
              </svg>
              <GitBranch size={21} />
              <span>
                8f3a19c &gt; main
                <br />
                <span style={{ fontSize: 12, opacity: ramp(f, 244, 262) }}>
                  PUSH COMPLETE / PEERS SYNCED
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </SceneShell>
  );
};
