import React from "react";
import {
  AbsoluteFill,
  Audio,
  Series,
  getStaticFiles,
  staticFile,
} from "remotion";
import "./fonts";
import { C, font } from "./theme";
import { SceneTransition } from "./components/Motion";
import { scenes } from "./timeline";
import { HudFrame } from "./components/HudFrame";
import { Subtitles } from "./components/Subtitles";
import { Scene1Chaos } from "./scenes/Scene1Chaos";
import { Scene2Reveal } from "./scenes/Scene2Reveal";
import { Scene3Mesh } from "./scenes/Scene3Mesh";
import { Scene4Dashboard } from "./scenes/Scene4Dashboard";
import { Scene5Mobile } from "./scenes/Scene5Mobile";
import { Scene6Outro } from "./scenes/Scene6Outro";
export type VideoProps = { captions: boolean; soundDesign: boolean };
const components = [
  Scene1Chaos,
  Scene2Reveal,
  Scene3Mesh,
  Scene4Dashboard,
  Scene5Mobile,
  Scene6Outro,
];
export const CoWorkVideo: React.FC<VideoProps> = ({
  captions,
  soundDesign,
}) => {
  const files = getStaticFiles();
  const has = (name: string) => files.some((file) => file.name === name);
  return (
    <AbsoluteFill
      style={{ background: C.bg, color: C.white, fontFamily: font }}
    >
      <Series>
        {components.map((Scene, i) => (
          <Series.Sequence
            key={scenes[i].name}
            durationInFrames={scenes[i].duration}
          >
            <SceneTransition
              duration={scenes[i].duration}
              last={i === components.length - 1}
            >
              <Scene />
            </SceneTransition>
          </Series.Sequence>
        ))}
      </Series>
      {has("voiceover.mp3") && <Audio src={staticFile("voiceover.mp3")} />}{" "}
      {soundDesign && has("sound-design.wav") && (
        <Audio src={staticFile("sound-design.wav")} volume={0.3} />
      )}
      <HudFrame />
      {captions && <Subtitles />}
    </AbsoluteFill>
  );
};
