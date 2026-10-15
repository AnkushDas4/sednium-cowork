import React from "react";
import { Composition } from "remotion";
import { CoWorkVideo } from "./CoWorkVideo";
export const RemotionRoot: React.FC = () => (
  <>
    {[
      { id: "CoWorkLaunchHorizontal", width: 1920, height: 1080 },
      { id: "CoWorkLaunchVertical", width: 1080, height: 1920 },
    ].map((size) => (
      <Composition
        key={size.id}
        {...size}
        component={CoWorkVideo}
        durationInFrames={1050}
        fps={30}
        defaultProps={{ captions: true, soundDesign: true }}
      />
    ))}
  </>
);
