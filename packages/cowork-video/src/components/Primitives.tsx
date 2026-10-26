import React from "react";
import { C, mono, font } from "../theme";
export const Panel: React.FC<
  React.PropsWithChildren<{
    style?: React.CSSProperties;
    title?: string;
    right?: React.ReactNode;
  }>
> = ({ children, style, title, right }) => (
  <div
    style={{
      background: C.panel,
      border: `1px solid ${C.line}`,
      boxShadow: "0 22px 50px #0003",
      ...style,
    }}
  >
    {title && (
      <div
        style={{
          height: 48,
          borderBottom: `1px solid ${C.line}`,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: mono,
          fontSize: 15,
          color: C.muted,
          letterSpacing: 1,
        }}
      >
        <span>{title}</span>
        {right ?? (
          <span style={{ display: "flex", gap: 7 }}>
            {[0, 1, 2].map((x) => (
              <i
                key={x}
                style={{
                  width: 6,
                  height: 6,
                  background: x === 0 ? C.orange : C.line,
                }}
              />
            ))}
          </span>
        )}
      </div>
    )}
    {children}
  </div>
);
export const Label: React.FC<
  React.PropsWithChildren<{ style?: React.CSSProperties }>
> = ({ children, style }) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 16,
      letterSpacing: 2,
      color: C.orange,
      fontWeight: 500,
      ...style,
    }}
  >
    {children}
  </div>
);
export const Chip: React.FC<
  React.PropsWithChildren<{ color?: string; style?: React.CSSProperties }>
> = ({ children, color = C.green, style }) => (
  <span
    style={{
      display: "inline-block",
      fontFamily: mono,
      fontSize: 14,
      color,
      border: `1px solid ${color}55`,
      background: `${color}0D`,
      padding: "8px 12px",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </span>
);
export const Title: React.FC<
  React.PropsWithChildren<{ style?: React.CSSProperties }>
> = ({ children, style }) => (
  <div
    style={{
      fontFamily: font,
      fontWeight: 800,
      fontSize: 82,
      letterSpacing: -3,
      lineHeight: 1.08,
      ...style,
    }}
  >
    {children}
  </div>
);
export const Logo: React.FC<{ size?: number }> = ({ size = 100 }) => (
  <svg width={size} height={size} viewBox="0 0 512 512">
    <rect width="512" height="512" fill={C.orange} rx="42" />
    <g
      fill="none"
      stroke="#121214"
      strokeWidth="34"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="112" y="120" width="288" height="216" rx="22" />
      <path d="M172 392h168 M172 196l58 52-58 52 M258 300h82" />
    </g>
  </svg>
);
export const Dots: React.FC<{ color?: string }> = ({ color = C.green }) => (
  <span
    style={{
      display: "inline-block",
      width: 8,
      height: 8,
      background: color,
      marginRight: 9,
    }}
  />
);
export const SceneShell: React.FC<
  React.PropsWithChildren<{ vertical: boolean; style?: React.CSSProperties }>
> = ({ children, vertical, style }) => (
  <div
    style={{
      position: "absolute",
      inset: vertical ? "170px 88px 235px" : "140px 140px 190px",
      ...style,
    }}
  >
    {children}
  </div>
);
