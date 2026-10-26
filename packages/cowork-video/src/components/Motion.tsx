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
export type TransitionOptions = { fadeIn?: boolean; fadeOut?: boolean };
export const getTransitionStyle = (
  frame: number,
  duration: number,
  { fadeIn = true, fadeOut = true }: TransitionOptions = {},
) => ({
  opacity:
    (fadeIn ? ease(frame, 0, 14) : 1) *
    (fadeOut ? 1 - ease(frame, duration - 16, duration - 1) : 1),
  transform: `translateY(${fadeIn ? (1 - ease(frame, 0, 24)) * 8 : 0}px)`,
});
// Default scenes dissolve. Scene 5 holds at full opacity; Scene 6 cuts straight to white.
// Independent entrance/exit settings avoid blank frames without shifting any audio.
export const SceneTransition: React.FC<
  React.PropsWithChildren<{ duration: number } & TransitionOptions>
> = ({ children, duration, fadeIn = true, fadeOut = true }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={getTransitionStyle(f, duration, { fadeIn, fadeOut })}>
      {children}
    </AbsoluteFill>
  );
};
