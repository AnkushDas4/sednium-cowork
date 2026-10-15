import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Laptop, Smartphone } from "lucide-react";
import { C, mono, useScene, enter, ease, ramp } from "../theme";
import {
  Chip,
  Dots,
  Label,
  Panel,
  SceneShell,
  Title,
} from "../components/Primitives";
import { Reveal } from "../components/Motion";
export const Scene3Mesh: React.FC = () => {
  const { f, vertical: v } = useScene();
  const w = v ? 904 : 1640;
  const nodes = [
    {
      id: "01",
      name: "Linux Laptop A",
      agent: "@loid-ai",
      status: "ONLINE",
      x: 0,
      y: v ? 700 : 504,
    },
    {
      id: "02",
      name: "Mobile HUD",
      agent: "Operator Phone",
      status: "CONNECTED",
      x: v ? 238 : 568,
      y: v ? 1038 : 504,
    },
    {
      id: "03",
      name: "Linux Laptop B",
      agent: "@peer-ai",
      status: "ONLINE",
      x: v ? 476 : 1136,
      y: v ? 700 : 504,
    },
  ];
  const nodeWidth = v ? 428 : 504;
  return (
    <SceneShell vertical={v}>
      <Reveal>
        <Label>01 / SHARED CONTEXT</Label>
        <Title style={{ fontSize: v ? 80 : 72, marginTop: 26 }}>
          Different machines.
          <br />
          <span style={{ color: C.muted }}>Same room.</span>
        </Title>
      </Reveal>
      <svg
        width={w}
        height={v ? 1360 : 740}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {nodes.map((n, i) => {
          const path = v
            ? `M452 566 V644 H${n.x + nodeWidth / 2} V${n.y}`
            : `M820 438 V474 H${n.x + nodeWidth / 2} V${n.y}`;
          return (
            <g key={n.id}>
              <path d={path} fill="none" stroke={C.line} strokeWidth={2} />
              <path
                d={path}
                fill="none"
                stroke={C.orange}
                strokeWidth={2}
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={1 - ease(f, 32 + i * 16, 76 + i * 16)}
              />
              <path
                d={path}
                fill="none"
                stroke={C.white}
                strokeOpacity={0.35 * ramp(f, 85, 110)}
                strokeWidth={2}
                strokeDasharray="2 38"
                strokeDashoffset={-f * 0.65}
              />
            </g>
          );
        })}
      </svg>
      <Panel
        title="RELAY / ROOM ACCESS"
        right={<Chip style={{ fontSize: 12, padding: "4px 10px" }}>LIVE</Chip>}
        style={{
          position: "absolute",
          left: v ? 0 : 470,
          top: v ? 326 : 228,
          width: v ? 904 : 700,
          height: v ? 252 : 214,
          ...enter(f, 12, 24),
        }}
      >
        <div
          style={{
            display: "flex",
            gap: v ? 40 : 28,
            alignItems: "center",
            padding: v ? 30 : 24,
          }}
        >
          <div
            style={{
              position: "relative",
              padding: 10,
              background: C.white,
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <QRCodeSVG
              value="https://cowork.sednium.com"
              size={v ? 140 : 110}
              bgColor={C.white}
              fgColor={C.bg}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 10 + ((Math.sin(f / 32) + 1) / 2) * (v ? 140 : 110),
                height: 2,
                background: C.orange,
              }}
            />
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: v ? 25 : 22 }}>
              ROOM: SED-409<span style={{ color: C.orange }}>#k=77f4a9…</span>
            </div>
            <div
              style={{
                fontFamily: mono,
                fontSize: v ? 16 : 13,
                color: C.muted,
                marginTop: 20,
                lineHeight: 1.8,
              }}
            >
              192-BIT FRAGMENT KEY (#k=)
              <br />
              ZERO SERVER LOG LEAKS
            </div>
            <div
              style={{
                fontFamily: mono,
                fontSize: 12,
                color: C.orange,
                marginTop: 12,
              }}
            >
              QR / COWORK.SEDNIUM.COM
            </div>
          </div>
        </div>
      </Panel>
      {nodes.map((n, i) => {
        const online = f >= 90 + i * 16;
        return (
          <Panel
            key={n.id}
            title={`NODE ${n.id} / ${i === 1 ? "HUMAN" : "AGENT"}`}
            style={{
              position: "absolute",
              left: n.x,
              top: n.y,
              width: nodeWidth,
              height: v ? 248 : 210,
              ...enter(f, 36 + i * 16, 28),
            }}
          >
            <div style={{ padding: v ? 28 : 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {i === 1 ? (
                  <Smartphone size={28} color={C.orange} />
                ) : (
                  <Laptop size={28} color={C.white} />
                )}
                <span style={{ fontSize: v ? 27 : 25, fontWeight: 700 }}>
                  {n.name}
                </span>
              </div>
              <div
                style={{
                  fontFamily: mono,
                  color: C.muted,
                  fontSize: v ? 19 : 16,
                  marginTop: 16,
                }}
              >
                {n.agent}
              </div>
              <div
                style={{
                  marginTop: v ? 28 : 20,
                  display: "flex",
                  alignItems: "center",
                  fontFamily: mono,
                  fontSize: 13,
                  color: online ? C.green : C.muted,
                }}
              >
                <Dots color={online ? C.green : C.muted} />
                {online ? n.status : "WAITING FOR RELAY"}
              </div>
            </div>
          </Panel>
        );
      })}
      {v && (
        <div
          style={{
            position: "absolute",
            top: 1370,
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: mono,
            fontSize: 16,
            color: C.muted,
            ...enter(f, 100, 12),
          }}
        >
          SCAN. JOIN. WORK TOGETHER.{" "}
          <span style={{ color: C.orange }}>NO ACCOUNTS.</span>
        </div>
      )}
    </SceneShell>
  );
};
