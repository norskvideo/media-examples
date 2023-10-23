import {
  Norsk,
  SrtInputSettings,
  StreamSwitchSmoothSettings,
  VideoEncodeRung,
  avToPin,
  clientHostExternal,
  selectAudio,
  selectVideo,
} from "@norskvideo/norsk-sdk";
import { webRtcServerConfig } from "./common/webRtcServerConfig";
import { Request, Response } from "express";

import express = require("express");

export async function main() {
  const ladderRungs: VideoEncodeRung[] = [
    {
      name: "high",
      width: 1280,
      height: 720,
      frameRate: { frames: 25, seconds: 1 },
      codec: {
        type: "x264",
        tune: "zerolatency",
        preset: "fast",
        profile: "high",
        bitrateMode: { value: 2000000, mode: "abr" },
      },
    },
  ];
  const srtCamera1: SrtInputSettings = {
    id: "camera1",
    ip: "0.0.0.0",
    port: 5001,
    mode: "listener",
    sourceName: "camera1",
  };
  const srtCamera2: SrtInputSettings = {
    id: "camera2",
    ip: "0.0.0.0",
    port: 5002,
    mode: "listener",
    sourceName: "camera2",
  };
  const streamSwitchSmoothSettings: StreamSwitchSmoothSettings<
    "camera1" | "camera2"
  > = {
    id: "switcher",
    activeSource: "camera1",
    outputSource: "output",
    outputResolution: { width: 1280, height: 720 },
    transitionDurationMs: 500.0,
    sampleRate: 48000,
  };

  const norsk = await Norsk.connect();
  const camera1 = await norsk.input.srt(srtCamera1);
  const camera2 = await norsk.input.srt(srtCamera2);

  const streamSwitchSmooth = await norsk.processor.control.streamSwitchSmooth(
    streamSwitchSmoothSettings
  );
  const ladder = await norsk.processor.transform.videoEncode({
    id: "ladder",
    rungs: ladderRungs,
  });

  const output = await norsk.output.whep({
    id: "webrtc",
    ...webRtcServerConfig,
  });

  streamSwitchSmooth.subscribeToPins([
    { source: camera1, sourceSelector: avToPin("camera1") },
    { source: camera2, sourceSelector: avToPin("camera2") },
  ]);

  ladder.subscribe([
    { source: streamSwitchSmooth, sourceSelector: selectVideo },
  ]);

  output.subscribe([
    { source: ladder, sourceSelector: selectVideo },
    { source: streamSwitchSmooth, sourceSelector: selectAudio },
  ]);

  const app = express();
  app.set("view engine", "ejs");
  const port = 3000;
  const host = clientHostExternal();
  app.use(express.json());
  app.put("/switch/:source", (req: Request, res: Response) => {
    if (req.params.source == "camera1" || req.params.source == "camera2") {
      streamSwitchSmooth.switchSource(req.params.source);
      res.send("");
    } else {
      res.sendStatus(404);
    }
  });
  app.get("/", (_req: Request, res: Response) => {
    const vars = {
      playerUrl: output.playerUrl,
    };
    res.render("13_view", vars);
  });
  app.use("/static", express.static("static"));
  app.listen(port, () => {
    console.log(
      `Hosted smooth_switcher app listening on http://${host}:${port}/`
    );
    console.log(`WebRTC Player URL: ${output.playerUrl}`);
  });
}

