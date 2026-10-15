import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Laptop, Smartphone } from "lucide-react";
import { C, mono, useScene, pop, ramp } from "../theme";
import {
  Chip,
  Label,
  Panel,
  SceneShell,
  Title,
} from "../components/Primitives";
export const Scene3Mesh: React.FC = () => {
  const { f, fps, vertical: v } = useScene();
  const nodes = [
    {
      id: "01",
      name: "Linux Laptop A",
      agent: "@loid-ai",
      status: "ONLINE",
      x: v ? 0 : 0,
      y: v ? 680 : 310,
    },
    {
      id: "02",
      name: "Mobile HUD",
      agent: "Operator Phone",
      status: "CONNECTED",
      x: v ? 240 : 645,
      y: v ? 1020 : 480,
    },
    {
      id: "03",
      name: "Linux Laptop B",
      agent: "@peer-ai",
      status: "ONLINE",
      x: v ? 480 : 1290,
      y: v ? 680 : 310,
    },
  ];
  return (
    <SceneShell vertical={v}>
      <Label>01 / SHARED CONTEXT</Label>
      <Title style={{ fontSize: v ? 82 : 80, marginTop: 20 }}>
        Different machines.
        <br />
        <span style={{ color: C.muted }}>Same room.</span>
      </Title>
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {nodes.map((n, i) => (
          <path
            key={n.id}
            d={
              v
                ? `M464 495 V625 H${n.x + 224} V${n.y}`
                : `M835 340 V450 H${n.x + 190} V${n.y + 40}`
            }
            fill="none"
            stroke={f > 65 + i * 15 ? C.orange : C.line}
            strokeWidth="2"
            strokeDasharray="6 8"
            strokeDashoffset={-f * 1.2}
            opacity={ramp(f, 20, 50)}
          />
        ))}
      </svg>
      <Panel
        style={{
          position: "absolute",
          top: v ? 300 : 218,
          left: v ? 80 : 490,
          width: v ? 768 : 690,
          transform: `scale(${pop(f, fps, 8)})`,
        }}
        title="RELAY / ROOM ACCESS"
        right={<Chip style={{ padding: "3px 8px", fontSize: 12 }}>LIVE</Chip>}
      >
        <div
          style={{
            display: "flex",
            gap: 24,
            alignItems: "center",
            padding: 26,
          }}
        >
          <div
            style={{
              position: "relative",
              background: C.white,
              padding: 12,
              flexShrink: 0,
            }}
          >
            <QRCodeSVG
              value="https://cowork.sednium.com"
              size={v ? 146 : 116}
              bgColor={C.white}
              fgColor={C.bg}
              level="M"
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 12 + ((f * 1.7) % (v ? 146 : 116)),
                height: 3,
                background: C.orange,
              }}
            />
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: v ? 23 : 22 }}>
              ROOM: SED-409<span style={{ color: C.orange }}>#k=77f4a9…</span>
            </div>
            <div
              style={{
                fontFamily: mono,
                color: C.muted,
                fontSize: 14,
                marginTop: 18,
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
                marginTop: 8,
              }}
            >
              QR &gt; COWORK.SEDNIUM.COM
            </div>
          </div>
        </div>
      </Panel>
      {nodes.map((n, i) => {
        const online = f > 65 + i * 15;
        return (
          <Panel
            key={n.id}
            style={{
              position: "absolute",
              left: n.x,
              top: n.y,
              width: v ? 448 : 380,
              transform: `translateY(${(1 - pop(f, fps, 25 + i * 8)) * 90}px)`,
              opacity: ramp(f, 25 + i * 8, 35 + i * 8),
            }}
            title={`NODE ${n.id} / ${i === 1 ? "HUMAN" : "AGENT"}`}
          >
            <div style={{ padding: 26 }}>
              {i === 1 ? (
                <Smartphone size={36} color={C.orange} />
              ) : (
                <Laptop size={36} color={online ? C.white : C.muted} />
              )}
              <div
                style={{
                  fontSize: v ? 27 : 24,
                  fontWeight: 700,
                  marginTop: 18,
                }}
              >
                {n.name}
              </div>
              <div
                style={{
                  fontFamily: mono,
                  color: C.muted,
                  fontSize: v ? 19 : 17,
                  marginTop: 10,
                }}
              >
                {n.agent}
              </div>
              <Chip
                color={online ? C.green : C.muted}
                style={{ marginTop: 23 }}
              >
                {online ? "+ " + n.status : "- WAITING"}
              </Chip>
            </div>
          </Panel>
        );
      })}
      <div
        style={{
          position: "absolute",
          bottom: v ? 40 : 65,
          left: 0,
          right: 0,
          fontFamily: mono,
          fontSize: v ? 19 : 16,
          color: C.muted,
          textAlign: "center",
        }}
      >
        SCAN. JOIN. WORK TOGETHER.{" "}
        <span style={{ color: C.orange }}>NO ACCOUNTS REQUIRED.</span>
      </div>
    </SceneShell>
  );
};
