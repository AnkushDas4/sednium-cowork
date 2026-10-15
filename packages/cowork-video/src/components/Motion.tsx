import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ease, enter } from "../theme";
export const Reveal: React.FC<
  React.PropsWithChildren<{
    delay?: number;
    distance?: number;
    style?: React.CSSProperties;
  }>
> = ({ children, delay = 0, distance = 24, style }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ ...enter(f, delay, distance), ...style }}>{children}</div>
  );
};
// Series remains contiguous: these short dissolves do not steal frames or shift the VO.
export const SceneTransition: React.FC<
  React.PropsWithChildren<{ duration: number; last?: boolean }>
> = ({ children, duration, last = false }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity:
          ease(f, 0, 14) *
          (last ? 1 : 1 - ease(f, duration - 16, duration - 1)),
        transform: `translateY(${(1 - ease(f, 0, 24)) * 8}px)`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
