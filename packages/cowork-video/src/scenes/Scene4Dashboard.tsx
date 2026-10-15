import React from "react";
import { GitBranch, Lock, ShieldCheck, ArrowUpRight } from "lucide-react";
import { C, mono, useScene, pop, ramp } from "../theme";
import { Chip, Dots, Label, SceneShell, Title } from "../components/Primitives";
export const Scene4Dashboard: React.FC = () => {
  const { f, fps, vertical: v } = useScene();
  const beat = f < 90 ? 0 : f < 195 ? 1 : 2;
  const synced = f >= 225;
  return (
    <SceneShell vertical={v}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <div>
          <Label>02 / THE LIVE WORKSPACE</Label>
          <Title style={{ fontSize: v ? 76 : 72, marginTop: 20 }}>
            {
              [
                "Claim. Don’t collide.",
                "Agents, in conversation.",
                "One shared main.",
              ][beat]
            }
          </Title>
        </div>
        {!v && (
          <Label style={{ color: C.muted, fontSize: 14 }}>
            SEDNIUM / RELAY HUD
          </Label>
        )}
      </div>
      <div
        style={{
          marginTop: v ? 45 : 36,
          border: `1px solid ${C.line}`,
          background: C.bg,
          width: v ? "100%" : "111.11%",
          marginBottom: v ? 0 : -68,
          transformOrigin: "top left",
          transform: `translateY(${(1 - pop(f, fps)) * 40}px) scale(${v ? 1 : 0.9})`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: v ? 16 : 30,
            padding: v ? "20px" : "18px 24px",
            borderBottom: `1px solid ${C.line}`,
            fontFamily: mono,
            fontSize: v ? 15 : 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <GitBranch size={20} color={C.orange} /> BRANCH: main
          </span>
          <span style={{ color: synced ? C.green : C.muted }}>
            HEAD: {synced ? "8f3a19c" : "a3f9c21"}
          </span>
          <span style={{ color: C.muted, marginLeft: v ? 0 : "auto" }}>
            REPO LOCKED:{" "}
            <span style={{ color: C.white }}>AnkushDas4/sednium-cowork</span>
          </span>
        </div>
        <div
          style={{
            padding: v ? "22px 20px" : "18px 24px",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontFamily: mono,
            fontSize: v ? 16 : 16,
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: C.muted }}>LIVE ACTIVITY</span>
          <Dots color={C.orange} />
          <span
            style={{ color: C.orange, opacity: 0.7 + Math.sin(f / 7) * 0.3 }}
          >
            @loid-ai
          </span>
          <span>
            {synced
              ? "SYNCED • Main branch up to date"
              : "EDITING • Refactoring auth middleware"}
          </span>
          <Chip color={C.muted} style={{ marginLeft: "auto", fontSize: 13 }}>
            src/auth.ts
          </Chip>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: v ? "1fr" : "450px 1fr",
            minHeight: v ? 1050 : 470,
          }}
        >
          <div
            style={{
              borderRight: v ? undefined : `1px solid ${C.line}`,
              borderBottom: v ? `1px solid ${C.line}` : undefined,
              padding: v ? 24 : 26,
            }}
          >
            <Label style={{ color: C.muted, fontSize: 14 }}>
              AGENT NODES <span style={{ color: C.green }}> / 02 ONLINE</span>
            </Label>
            {["@loid-ai", "@peer-ai"].map((name, i) => (
              <div
                key={name}
                style={{
                  marginTop: 20,
                  border: `1px solid ${synced ? C.green + "88" : C.line}`,
                  padding: v ? "15px 18px" : "18px",
                  background: synced
                    ? `${C.green}${f < 250 ? "18" : "08"}`
                    : C.panel,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: mono,
                    fontSize: 19,
                  }}
                >
                  {name}
                  <Dots />
                </div>
                <div
                  style={{
                    fontFamily: mono,
                    color: C.muted,
                    fontSize: 13,
                    marginTop: 10,
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
            <Label
              style={{
                marginTop: 25,
                color: C.muted,
                fontSize: 13,
                letterSpacing: 1,
              }}
            >
              FILE LOCK REGISTRY / 90S TTL
            </Label>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginTop: 17,
                fontFamily: mono,
                fontSize: 16,
              }}
            >
              <Lock color={C.orange} size={18} /> src/auth.ts{" "}
              <span style={{ marginLeft: "auto", color: C.orange }}>
                {89 - Math.floor(f / 30)}s
              </span>
            </div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 12,
                color: C.muted,
                marginTop: 10,
              }}
            >
              LOCKED BY @loid-ai • ATOMIC LEASE
            </div>
          </div>
          <div
            style={{
              padding: v ? 24 : 28,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontFamily: mono,
                fontSize: 14,
                color: C.muted,
                display: "flex",
                gap: 24,
                borderBottom: `1px solid ${C.line}`,
                paddingBottom: 20,
              }}
            >
              <span style={{ color: C.orange }}>ALL EVENTS</span>
              <span>MENTIONS</span>
              <span>GIT SYNC</span>
            </div>
            <div
              style={{
                fontFamily: mono,
                fontSize: v ? 18 : 17,
                lineHeight: 1.6,
                marginTop: 24,
              }}
            >
              <span style={{ color: C.muted, fontSize: 12 }}>14:22:03</span>
              <div style={{ marginTop: 8 }}>
                <span style={{ color: C.orange }}>@loid-ai</span> claimed
                src/auth.ts
              </div>
              <Chip style={{ marginTop: 10, fontSize: 12 }}>
                LEASE GRANTED / 90S
              </Chip>
            </div>
            {f >= 25 && (
              <div
                style={{
                  marginTop: 20,
                  padding: 16,
                  border: `1px solid ${C.orange}88`,
                  background: C.orange + "0A",
                  display: "flex",
                  gap: 15,
                  transform: `translateX(${(1 - pop(f, fps, 25)) * 40}px)`,
                }}
              >
                <ShieldCheck color={C.orange} size={25} />
                <div
                  style={{
                    fontFamily: mono,
                    fontSize: v ? 17 : 15,
                    lineHeight: 1.6,
                  }}
                >
                  <span style={{ color: C.orange }}>409 LOCK HELD</span> ·
                  @peer-ai
                  <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
                    {f > 50
                      ? "REROUTED > src/components/Navbar.tsx"
                      : "src/auth.ts protected by @loid-ai"}
                  </div>
                </div>
              </div>
            )}
            {f >= 90 && (
              <div
                style={{
                  marginTop: 22,
                  padding: 18,
                  borderLeft: `3px solid ${C.orange}`,
                  background: C.panel,
                  opacity: ramp(f, 90, 102),
                  transform: `translateY(${(1 - pop(f, fps, 90)) * 25}px)`,
                }}
              >
                <div style={{ fontFamily: mono, fontSize: 12, color: C.muted }}>
                  14:22:08{" "}
                  <span style={{ color: C.orange, marginLeft: 12 }}>
                    [AGENT_SYNC]
                  </span>
                </div>
                <div style={{ fontFamily: mono, fontSize: 15, marginTop: 12 }}>
                  @loid-ai <ArrowUpRight size={14} /> @peer-ai
                </div>
                <div
                  style={{
                    fontSize: v ? 25 : 24,
                    lineHeight: 1.35,
                    fontWeight: 600,
                    marginTop: 12,
                  }}
                >
                  “Auth schema pushed. Hook up the login form to POST
                  /api/session.”
                </div>
              </div>
            )}
            {f >= 195 && (
              <div
                style={{
                  marginTop: 22,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  color: C.green,
                  fontFamily: mono,
                  fontSize: v ? 17 : 16,
                  transform: `translateX(${(1 - pop(f, fps, 195)) * 200}px)`,
                }}
              >
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: C.green,
                  }}
                />
                <span style={{ height: 2, width: 60, background: C.green }} />
                <GitBranch size={20} />
                <span>
                  8f3a19c &gt; main {synced ? "OK SYNCED" : "PUSHING…"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
        {["ATOMIC LOCKS", "AGENT MESSAGES", "GIT HANDOFFS"].map((t, i) => (
          <div
            key={t}
            style={{
              flex: 1,
              padding: "12px 0",
              borderTop: `2px solid ${beat >= i ? C.orange : C.line}`,
              fontFamily: mono,
              fontSize: v ? 14 : 13,
              color: beat === i ? C.white : C.muted,
            }}
          >
            0{i + 1} / {t}
          </div>
        ))}
      </div>
    </SceneShell>
  );
};
